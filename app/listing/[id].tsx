// app/listing/[id].tsx
import { LikeButton } from '@/components/LikeButton'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { TrustBadge } from '@/components/TrustBadge'
import { FEATURE_FLAGS } from '@/constants/feature-flags'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import {
  addLike,
  addUserBlock,
  fetchCard,
  fetchMyBlockedUserIds,
  fetchMyLikedCardIds,
  fetchMyWantedCards,
  removeLike,
  removeUserBlock,
  supabase,
} from '@/lib/supabase'
import {
  getCharacterById,
  getItemTypeById,
  getWorkById,
} from '@/lib/master'
import { Card, computeTrustBadge, Profile, TrustBadgeLevel, WantedCard, WantMatchScore } from '@/lib/types'
import { scoreWantMatchV2 } from '@/lib/matcher' // ★ Step 3 commit 3: v1 → v2 切替
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'

// ─────────────────────────────────────────
// helpers
// ─────────────────────────────────────────

type DiffInfo = { text: string; bgColor: string; textColor: string }

function getDiffInfo(card: Card): DiffInfo {
  if (!card.allows_adjustment) {
    return { text: '調整金なし', bgColor: colors.tagNeutralBg, textColor: colors.tagNeutralText }
  }
  if (card.adjustment_max != null) {
    return {
      text: `調整金 ¥${card.adjustment_max.toLocaleString()}まで可`,
      bgColor: colors.tagAccentBg,
      textColor: colors.tagAccentText,
    }
  }
  return { text: '調整金相談可', bgColor: colors.tagInfoBg, textColor: colors.tagInfoText }
}

function getCtaConfig(
  card: Card,
  isOwn: boolean,
): { label: string; disabled: boolean } {
  if (isOwn) return { label: '自分の出品です', disabled: true }
  switch (card.status) {
    case 'reserved': return { label: '取引進行中', disabled: true }
    case 'traded':   return { label: '交換済み',   disabled: true }
    case 'inactive': return { label: '出品停止中', disabled: true }
  }
  // status === 'active' に到達。
  // β1: 通常の交換提案フローは郵送交換のみ対応 (accept_offer_atomic_v3 が trade_mode='mail'
  // 固定 + ship_deadline_at 72h + shipments 必須生成のため)。
  // allows_mail=false の出品 (= 手渡しのみ) は通常提案 CTA を無効化し、誤認を防ぐ。
  if (!card.allows_mail) {
    return { label: '郵送提案には対応していません', disabled: true }
  }
  return { label: '交換を提案する', disabled: false }
}

// ④ Trust: ホーム削除分の補完として全項目を直接表示 (3.5a 機能 H 戦略)
// β1: ADJUSTMENT_MONEY_ENABLED=false 中は差額平均 / 差額偏り を出さない。
function getTrustRows(owner: Profile): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: '成立件数', value: `${owner.trade_count}件` },
    { label: '発送遵守率', value: `${owner.ship_rate}%` },
    {
      label: '返信中央値',
      value: owner.reply_median_hours < 999 ? `${owner.reply_median_hours}時間` : '—',
    },
  ]
  if (FEATURE_FLAGS.ADJUSTMENT_MONEY_ENABLED) {
    rows.push(
      {
        label: '差額平均',
        value: owner.adjustment_avg != null ? `¥${owner.adjustment_avg}` : '—',
      },
      { label: '差額偏り', value: owner.adjustment_bias ?? '—' },
    )
  }
  rows.push({ label: 'トラブル件数', value: `${owner.trouble_count}件` })
  return rows
}

// ⑤ CTA: 押していい理由を1つだけ返す（want一致 → 実績 → 郵送 → 差額 の優先順）
function getPushReason(
  card: Card,
  owner: Profile | undefined,
  bestMatchScore: WantMatchScore,
): string | null {
  if (bestMatchScore === 'strong') return 'あなたが求めているカードと一致しています'
  if (bestMatchScore === 'medium') return 'あなたが求めているカードに近いです'
  if (owner != null && owner.trade_count >= 1) return '交換実績があるため、安心して提案できます'
  if (card.allows_mail) return '郵送で交換しやすい条件です'
  // β1: ADJUSTMENT_MONEY_ENABLED=false 中は調整金 push 理由を出さない
  if (FEATURE_FLAGS.ADJUSTMENT_MONEY_ENABLED && card.allows_adjustment) {
    return '調整金に対応しており、条件が合わせやすいです'
  }
  return null
}

// ─────────────────────────────────────────
// types
// ─────────────────────────────────────────

// 出品詳細のタブ:
//   'offer' (譲) = 相手が出しているグッズの情報
//   'want'  (求) = 相手が求めているもの
// Trust / 出品者情報 / CTA は交換判断全体に関わるためタブ外 (共通エリア / 画面下部) に維持。
type ListingDetailTab = 'offer' | 'want'

// ─────────────────────────────────────────
// inline component
// ─────────────────────────────────────────

function Tag({
  text,
  bgColor,
  textColor,
}: {
  text: string
  bgColor: string
  textColor: string
}) {
  return (
    <View style={[styles.tag, { backgroundColor: bgColor }]}>
      <Text style={[styles.tagText, { color: textColor }]}>{text}</Text>
    </View>
  )
}

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────

export default function ListingDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const rawId = params.id
  const listingId = Array.isArray(rawId) ? rawId[0] : rawId

  const [card, setCard] = useState<Card | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [descExpanded, setDescExpanded] = useState(false)
  // matcher (bestMatchScore) の計算は load 内で local wants で実施するため、myWants state は
  // 現状 JSX 非使用。Phase B 以降の参照余地として state ホールド、意図を eslint-disable で明示。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [myWants, setMyWants] = useState<WantedCard[]>([])
  const [likeToggling, setLikeToggling] = useState(false)
  // ★ Phase A: liked_cards (UI 上「いいね」) は card_id 直接比較なので
  // optimistic state は単純な boolean に簡素化
  const [isLiked, setIsLiked] = useState(false)
  const [bestMatchScore, setBestMatchScore] = useState<WantMatchScore>('none')
  const [imageSide, setImageSide] = useState<'front' | 'back'>('front')
  // 譲 / 求 タブ: 初期表示は譲 (まず相手が何を出しているかを見せる)
  const [activeTab, setActiveTab] = useState<ListingDetailTab>('offer')
  // Phase 0 PR-C: 出品者のブロック状態 (画面 mount 時に取得、トグル時に optimistic 更新)
  const [isBlocked, setIsBlocked] = useState(false)
  const [blockToggling, setBlockToggling] = useState(false)

  const load = useCallback(async () => {
    if (!listingId) {
      setError('出品IDが不正です')
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      setError(null)

      const [{ data: authData }, fetched] = await Promise.all([
        supabase.auth.getUser(),
        fetchCard(listingId),
      ])

      const uid = authData.user?.id ?? null
      setCurrentUserId(uid)

      if (fetched === null) {
        throw new Error('出品情報の取得に失敗しました')
      }

      setCard(fetched)

      if (uid != null) {
        const [wants, blockedIds, likedIds] = await Promise.all([
          fetchMyWantedCards(uid),
          fetchMyBlockedUserIds(),
          fetchMyLikedCardIds(uid),
        ])
        setMyWants(wants)
        setIsBlocked(blockedIds.includes(fetched.owner_user_id))
        setIsLiked(likedIds.has(fetched.id))

        const best = wants.reduce<WantMatchScore>((acc, want) => {
          const s = scoreWantMatchV2(fetched, want)
          if (s === 'strong') return 'strong'
          if (s === 'medium' && acc !== 'strong') return 'medium'
          if (s === 'weak' && acc === 'none') return 'weak'
          return acc
        }, 'none')
        setBestMatchScore(best)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '出品を読み込めませんでした')
      setCard(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [listingId])

  useEffect(() => {
    void load()
  }, [load])

  // 裏面が存在しないカードに切り替わったとき imageSide を 'front' に戻す
  useEffect(() => {
    if (card?.image_back_url == null) {
      setImageSide('front')
    }
  }, [card?.image_back_url])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void load()
  }, [load])

  // ── loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>出品を読み込んでいます...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── error ────────────────────────────────────────────────────────────────────

  if (error !== null || card === null) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.navTitle}>出品詳細</Text>
          <View style={styles.navRight} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>出品を読み込めませんでした</Text>
          <Text style={styles.errorBody}>{error ?? '出品情報の取得に失敗しました'}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              setLoading(true)
              void load()
            }}
          >
            <Text style={styles.retryButtonText}>再読み込み</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── derive ───────────────────────────────────────────────────────────────────

  const owner = card.owner
  const trustLevel: TrustBadgeLevel = owner != null
    ? computeTrustBadge({
        trade_count: owner.trade_count,
        ship_rate: owner.ship_rate,
        reply_median_hours: owner.reply_median_hours,
        trouble_count: owner.trouble_count,
        last_active_at: owner.last_active_at,
      })
    : 'green'

  const diff = getDiffInfo(card)
  const isOwn = currentUserId !== null && card.owner_user_id === currentUserId
  const cta = getCtaConfig(card, isOwn)
  const isNonActive = card.status !== 'active'
  const hasDescription = card.description != null && card.description.trim() !== ''

  const memberSeries = [card.member_name, card.series]
    .filter((v): v is string => v != null && v !== '')
    .join(' · ')

  const pushReason = getPushReason(card, owner, bestMatchScore)

  const handlePropose = () => {
    router.push({
      pathname: '/offer/create',
      params: { cardId: card.id },
    } as never)
  }

  // Phase 0 PR-C: ブロック / 解除トグル
  // 進行中の取引には影響しない (既存 trade / offer / shipment テーブルは touch しない)。
  // β1 は「今後の表示・接触を減らす」目的で、home / search / listing 一覧から除外する用途のみ。
  const handleBlockToggle = () => {
    if (card == null || blockToggling) return
    const ownerId = card.owner_user_id
    if (ownerId === currentUserId) return // safety guard

    if (isBlocked) {
      // 解除フロー
      Alert.alert(
        'ブロックを解除しますか?',
        '今後このユーザーの出品が再び表示されるようになります。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '解除する',
            style: 'default',
            onPress: async () => {
              try {
                setBlockToggling(true)
                await removeUserBlock(ownerId)
                setIsBlocked(false)
                Alert.alert('ブロックを解除しました')
              } catch (err) {
                console.error('[listing/[id]][removeUserBlock]', err)
                const message =
                  err instanceof Error && err.message === 'AUTH_REQUIRED'
                    ? 'ログインが必要です。再ログインしてからお試しください。'
                    : 'ブロック解除に失敗しました。時間をおいてもう一度お試しください。'
                Alert.alert('エラー', message)
              } finally {
                setBlockToggling(false)
              }
            },
          },
        ],
      )
      return
    }

    // ブロックフロー
    Alert.alert(
      'このユーザーをブロックしますか?',
      'このユーザーの出品を今後表示しにくくします。進行中の交換がある場合は、必要な確認を続けてください。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'ブロックする',
          style: 'destructive',
          onPress: async () => {
            try {
              setBlockToggling(true)
              await addUserBlock(ownerId)
              setIsBlocked(true)
              Alert.alert(
                'ブロックしました',
                'このユーザーの出品は今後表示しにくくなります。',
              )
            } catch (err) {
              console.error('[listing/[id]][addUserBlock]', err)
              const message =
                err instanceof Error && err.message === 'AUTH_REQUIRED'
                  ? 'ログインが必要です。再ログインしてからお試しください。'
                  : err instanceof Error && err.message === 'CANNOT_BLOCK_SELF'
                  ? '自分自身をブロックすることはできません。'
                  : 'ブロックに失敗しました。時間をおいてもう一度お試しください。'
              Alert.alert('エラー', message)
            } finally {
              setBlockToggling(false)
            }
          },
        },
      ],
    )
  }

  // ★ Phase A: liked_cards (UI 上「いいね」) は card_id ベースの exact match なので
  // pendingLikeState / matchesCard / fuzzy match はすべて不要に。
  const handleToggleLike = async () => {
    if (currentUserId == null || card == null || likeToggling) return
    setLikeToggling(true)
    const wasLiked = isLiked
    // Optimistic UI update
    setIsLiked(!wasLiked)
    try {
      if (wasLiked) {
        await removeLike(currentUserId, card.id)
      } else {
        await addLike(currentUserId, card.id)
      }
    } catch {
      // 失敗時は元の状態に revert
      setIsLiked(wasLiked)
      Alert.alert('エラー', '更新に失敗しました')
    } finally {
      setLikeToggling(false)
    }
  }

  const handleSellerPress = () => {
    if (owner == null) return
    router.push({
      pathname: '/trust/[id]',
      params: { id: owner.id },
    } as never)
  }

  // ── render ───────────────────────────────────────────────────────────────────

  const hasBackImage = card.image_back_url != null

  const displayImageUrl =
    imageSide === 'back' && hasBackImage
      ? card.image_back_url
      : card.image_url

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* NavBar */}
      <View style={styles.navBar}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.navTitle}>出品詳細</Text>
        <View style={styles.navRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ① タブバー (画面トップ): 譲 / 求 */}
        <View style={styles.tabBar}>
          <Pressable
            style={[
              styles.tabSegment,
              activeTab === 'offer' && styles.tabSegmentActive,
            ]}
            onPress={() => setActiveTab('offer')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'offer' }}
          >
            <Text
              style={[
                styles.tabSegmentText,
                activeTab === 'offer' && styles.tabSegmentTextActive,
              ]}
            >
              譲
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tabSegment,
              activeTab === 'want' && styles.tabSegmentActive,
            ]}
            onPress={() => setActiveTab('want')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'want' }}
          >
            <Text
              style={[
                styles.tabSegmentText,
                activeTab === 'want' && styles.tabSegmentTextActive,
              ]}
            >
              求
            </Text>
          </Pressable>
        </View>

        {/* ② タブコンテンツ — activeTab で切替 */}
        {activeTab === 'offer' ? (
          // ─ 譲タブ: 相手が出しているグッズの情報 ─
          <>
            {/* 出品画像 + overlay (差額 / Like / 表裏切替)
                Trust 表示は下部「出品者 / Trust」共通エリアに集約済 — 画像 overlay には載せない */}
            <View style={styles.imageWrap}>
              {displayImageUrl != null ? (
                <Image
                  source={{ uri: displayImageUrl }}
                  style={styles.image}
                  contentFit="contain"
                  transition={200}
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.image, styles.imageFallback]}>
                  <Ionicons name="image-outline" size={40} color={colors.border} />
                  <Text style={styles.imageFallbackText}>写真未登録</Text>
                </View>
              )}

              {/* 表/裏切替: 裏面ありのときのみ */}
              {hasBackImage && (
                <View style={styles.sideToggleOverlay}>
                  <Pressable
                    style={[
                      styles.sideToggleSeg,
                      imageSide === 'front' && styles.sideToggleSegActive,
                    ]}
                    onPress={() => setImageSide('front')}
                  >
                    <Text
                      style={[
                        styles.sideToggleSegText,
                        imageSide === 'front' && styles.sideToggleSegTextActive,
                      ]}
                    >
                      表面
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.sideToggleSeg,
                      imageSide === 'back' && styles.sideToggleSegActive,
                    ]}
                    onPress={() => setImageSide('back')}
                  >
                    <Text
                      style={[
                        styles.sideToggleSegText,
                        imageSide === 'back' && styles.sideToggleSegTextActive,
                      ]}
                    >
                      裏面
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* 差額: bottom-left overlay（即時スキャン用）
                  β1: ADJUSTMENT_MONEY_ENABLED=false 中は非表示 */}
              {FEATURE_FLAGS.ADJUSTMENT_MONEY_ENABLED && (
                <View style={[styles.diffOverlay, { backgroundColor: diff.bgColor }]}>
                  <Text style={[styles.diffOverlayText, { color: diff.textColor }]}>
                    {diff.text}
                  </Text>
                </View>
              )}

              {/* ♡ いいね: bottom-right overlay (自分の出品では非表示) */}
              {!isOwn && currentUserId != null && (
                <LikeButton
                  isLiked={isLiked}
                  onToggle={handleToggleLike}
                  size="medium"
                  disabled={likeToggling}
                  style={styles.likeOverlay}
                />
              )}
            </View>

            {isNonActive && (
              <View
                style={[
                  styles.statusBanner,
                  card.status === 'reserved'
                    ? styles.statusBannerAmber
                    : styles.statusBannerGray,
                ]}
              >
                <Text style={styles.statusBannerText}>
                  {card.status === 'traded'
                    ? 'この出品は交換済みです'
                    : card.status === 'inactive'
                    ? 'この出品は現在出品停止中です'
                    : 'この出品は現在取引進行中です'}
                </Text>
              </View>
            )}

            <View style={styles.body}>
              {/* タイトル情報 (グッズ名 / グループ / メンバー · シリーズ) */}
              {card.group_name != null && (
                <Text style={styles.groupName}>{card.group_name}</Text>
              )}
              <Text style={styles.cardName}>{card.name}</Text>
              {memberSeries !== '' && (
                <Text style={styles.memberSeries}>{memberSeries}</Text>
              )}

              {isLiked && !isOwn && (
                <Text style={styles.wantSavedNote}>✓ いいね済みの商品です</Text>
              )}

              {/* 交換条件 (発送方法 + 差額対応) */}
              <Text style={styles.sectionLabel}>交換条件</Text>
              <View style={styles.conditionsRow}>
                {card.allows_mail && (
                  <Tag
                    text="郵送で交換可"
                    bgColor={colors.tagNeutralBg}
                    textColor={colors.tagNeutralText}
                  />
                )}
                {card.allows_handoff && (
                  <Tag
                    text="手渡しで交換可"
                    bgColor={colors.tagNeutralBg}
                    textColor={colors.tagNeutralText}
                  />
                )}
                {/* β1: ADJUSTMENT_MONEY_ENABLED=false 中は調整金 Tag を非表示 */}
                {FEATURE_FLAGS.ADJUSTMENT_MONEY_ENABLED && (
                  <Tag
                    text={diff.text}
                    bgColor={diff.bgColor}
                    textColor={diff.textColor}
                  />
                )}
              </View>

              {/* β1 期待値補正: 通常の交換提案は郵送のみ。手渡し / 会場交換は venue モード経由。 */}
              {card.allows_handoff && (
                <Text style={styles.beta1ExchangeNote}>
                  ※ 現在、通常の交換提案は郵送交換に対応しています。会場での交換は会場モードからご利用ください。
                </Text>
              )}

              {/* 出品物の説明 (折りたたみ) */}
              {hasDescription && (
                <View style={styles.descSection}>
                  <Pressable
                    style={styles.descToggle}
                    onPress={() => setDescExpanded((v) => !v)}
                  >
                    <Text style={styles.descToggleText}>
                      {descExpanded ? '▲ 説明を閉じる' : '▼ 説明を見る'}
                    </Text>
                  </Pressable>
                  {descExpanded && (
                    <Text style={styles.descText}>{card.description}</Text>
                  )}
                </View>
              )}
            </View>
          </>
        ) : (
          // ─ 求タブ: 相手が求めているもの ─
          <View style={styles.body}>
            {/* 求条件のメインカード (求 hero) — 構造化された want_* を chip 表示 + 詳細テキスト */}
            <View style={styles.wantHeroCard}>
              <Text style={styles.wantHeroBadge}>求</Text>
              <Text style={styles.wantHeroSubtitle}>
                この出品者が求めているもの
              </Text>

              {/* 求める作品 */}
              {card.want_works != null && card.want_works.length > 0 && (
                <View style={styles.wantChipBlock}>
                  <Text style={styles.wantChipBlockLabel}>求める作品</Text>
                  <View style={styles.wantChipsRow}>
                    {card.want_works.map((id) => (
                      <View key={`work-${id}`} style={styles.wantChip}>
                        <Text style={styles.wantChipText}>
                          {getWorkById(id)?.display_name_ja ?? id}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 求めるキャラ */}
              {card.want_characters != null &&
                card.want_characters.length > 0 && (
                  <View style={styles.wantChipBlock}>
                    <Text style={styles.wantChipBlockLabel}>求めるキャラ</Text>
                    <View style={styles.wantChipsRow}>
                      {card.want_characters.map((id) => (
                        <View key={`char-${id}`} style={styles.wantChip}>
                          <Text style={styles.wantChipText}>
                            {getCharacterById(id)?.display_name_ja ?? id}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

              {/* 求めるグッズ種類 */}
              {card.want_item_types != null &&
                card.want_item_types.length > 0 && (
                  <View style={styles.wantChipBlock}>
                    <Text style={styles.wantChipBlockLabel}>求めるグッズ種類</Text>
                    <View style={styles.wantChipsRow}>
                      {card.want_item_types.map((id) => (
                        <View key={`type-${id}`} style={styles.wantChip}>
                          <Text style={styles.wantChipText}>
                            {getItemTypeById(id)?.display_name_ja ?? id}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

              {/* 詳細・コメント (want_description 既存) */}
              <Text style={styles.wantHeroBlockLabel}>詳細・コメント</Text>
              <Text style={styles.wantHeroBody}>
                {card.want_description != null &&
                card.want_description.trim() !== ''
                  ? card.want_description
                  : '—'}
              </Text>
            </View>

            {/* 交換条件 (求タブにも表示: 提案時に必要な条件として参照) */}
            <Text style={styles.sectionLabel}>交換条件</Text>
            <View style={styles.conditionsRow}>
              {card.allows_mail && (
                <Tag
                  text="郵送で交換可"
                  bgColor={colors.tagNeutralBg}
                  textColor={colors.tagNeutralText}
                />
              )}
              {card.allows_handoff && (
                <Tag
                  text="手渡しで交換可"
                  bgColor={colors.tagNeutralBg}
                  textColor={colors.tagNeutralText}
                />
              )}
              <Tag
                text={diff.text}
                bgColor={diff.bgColor}
                textColor={diff.textColor}
              />
            </View>
          </View>
        )}

        {/* ③ 出品者 / Trust (タブ外、共通エリア) */}
        <View style={styles.body}>
          <Text style={styles.sectionLabel}>出品者</Text>

          {owner != null ? (
            <Pressable style={styles.sellerCard} onPress={handleSellerPress}>
              <View style={styles.sellerTopRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(owner.handle || owner.display_name || '?')
                      .slice(0, 1)
                      .toUpperCase()}
                  </Text>
                </View>

                <View style={styles.sellerMeta}>
                  <Text style={styles.sellerHandle}>
                    {owner.handle
                      ? `@${owner.handle}`
                      : owner.display_name ?? '出品者'}
                  </Text>
                  <View style={styles.sellerBadgeRow}>
                    <TrustBadge level={trustLevel} size="sm" />
                  </View>
                </View>

                <Text style={styles.detailLink}>Trust詳細 ›</Text>
              </View>

              {/* Trust 6 項目 default 表示 */}
              <View style={styles.trustRowsWrap}>
                {getTrustRows(owner).map((row, i, arr) => (
                  <View
                    key={row.label}
                    style={[
                      styles.trustRow,
                      i < arr.length - 1 && styles.trustRowBorder,
                    ]}
                  >
                    <Text style={styles.trustLabel}>{row.label}</Text>
                    <Text style={styles.trustValue}>{row.value}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.trustNote}>
                ※ 感情レビューなし。確定事実のみ表示。
              </Text>
            </Pressable>
          ) : (
            <View style={styles.sellerCardEmpty}>
              <Text style={styles.sellerUnknown}>
                出品者情報を取得できませんでした
              </Text>
            </View>
          )}
        </View>

        {/* ④' 通報リンク (自分の出品では非表示) */}
        {!isOwn && (
          <View style={styles.reportLinkSection}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/report' as never,
                  params: {
                    targetType: 'card',
                    targetId: card.id,
                    targetLabel: card.name ?? '',
                  } as never,
                })
              }
              hitSlop={6}
            >
              <Text style={styles.reportLinkText}>気になる内容を通報する</Text>
            </Pressable>
          </View>
        )}

        {/* ④'' ブロックリンク (自分の出品では非表示、controlled テキストリンク) */}
        {!isOwn && (
          <View style={styles.blockLinkSection}>
            <Pressable
              onPress={handleBlockToggle}
              disabled={blockToggling}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.blockLinkText,
                  blockToggling && styles.blockLinkTextDisabled,
                ]}
              >
                {isBlocked
                  ? 'このユーザーのブロックを解除する'
                  : 'このユーザーをブロックする'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ④ CTA (タブ外、画面下部) */}
        {!isOwn && (
          <View style={styles.ctaContainer}>
            {/* A. 押していい理由（1つだけ） */}
            {pushReason != null && (
              <Text style={styles.pushReasonNote} numberOfLines={1}>
                {pushReason}
              </Text>
            )}
            {/* B. 不安除去の一文 */}
            <Text style={styles.ctaReassurance}>承認されるまで確定しません</Text>
            <PrimaryCTA
              label={cta.label}
              onPress={handlePropose}
              disabled={cta.disabled}
              size="lg"
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  // ── layout ──────────────────────────────
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },

  // ── navBar ──────────────────────────────
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 28,
    lineHeight: 32,
    color: colors.textPrimary,
  },
  navTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  navRight: {
    width: 32,
  },

  // ── loading / error ──────────────────────
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorBody: {
    marginTop: spacing.sm,
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryButtonText: {
    color: colors.textInverse,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },

  // ── ① image ──────────────────────────────
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.backgroundMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imageFallbackText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  sideToggleOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  sideToggleSeg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sideToggleSegActive: {
    backgroundColor: '#FFFFFF',
  },
  sideToggleSegText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sideToggleSegTextActive: {
    color: '#18181B',
  },
  diffOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  diffOverlayText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  likeOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
  },

  // ── status banner ────────────────────────
  statusBanner: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  statusBannerAmber: {
    backgroundColor: colors.warningBg,
  },
  statusBannerGray: {
    backgroundColor: '#F3F4F6',
  },
  statusBannerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },

  // ── body ─────────────────────────────────
  body: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  groupName: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  cardName: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    marginTop: spacing.xs,
  },
  memberSeries: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // ── section label ─────────────────────────
  sectionLabel: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },

  // ── タブバー (譲 / 求) ────────────────────
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.lg,
    padding: 4,
  },
  tabSegment: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSegmentActive: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabSegmentText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  tabSegmentTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.extrabold,
  },

  // ── 譲タブ: いいね済 note (画像と本文タイトルの後に置く) ─
  wantSavedNote: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // ── 求タブ: 求条件のメインカード (hero) ─────
  // 画像枠は無理に作らず、テキストベースの hero card で「求」意図を明示。
  wantHeroCard: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  wantHeroBadge: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  wantHeroSubtitle: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  wantHeroBody: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // ── 求タブ: 構造化 chip ────────────────────
  wantChipBlock: {
    marginTop: spacing.sm,
  },
  wantChipBlockLabel: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  wantChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  wantChip: {
    backgroundColor: colors.tagAccentBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  wantChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.tagAccentText,
  },
  wantHeroBlockLabel: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: 6,
  },

  // ── ③ conditions ─────────────────────────
  conditionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  // β1 期待値補正: 譲タブ「交換条件」直下の注記 (allows_handoff=true のときのみ表示)
  beta1ExchangeNote: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  tag: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },

  // ── ④ seller card ─────────────────────────
  sellerCard: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  sellerCardEmpty: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.base,
    alignItems: 'center',
  },
  sellerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  sellerMeta: {
    flex: 1,
  },
  sellerHandle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  sellerBadgeRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  detailLink: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.primary,
  },
  trustRowsWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  trustRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  trustLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  trustValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  trustNote: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  sellerUnknown: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    paddingVertical: spacing.sm,
  },

  // ── description ───────────────────────────
  descSection: {
    marginBottom: spacing.base,
  },
  descToggle: {
    paddingVertical: spacing.sm,
  },
  descToggleText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
  descText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    lineHeight: 22,
    marginTop: spacing.xs,
  },

  // ── ④' 通報リンク (出品者セクションと CTA の間、控えめ表示) ──
  reportLinkSection: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  reportLinkText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textDecorationLine: 'underline',
  },

  // ── ④'' ブロックリンク (出品者セクションと CTA の間、controlled テキストリンク) ──
  blockLinkSection: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  blockLinkText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textDecorationLine: 'underline',
  },
  blockLinkTextDisabled: {
    opacity: 0.5,
  },

  // ── ⑤ cta ────────────────────────────────
  ctaContainer: {
    backgroundColor: colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  // A. 押していい理由（1つ）
  pushReasonNote: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  // B. 不安除去の一文
  ctaReassurance: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
})
