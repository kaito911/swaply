// app/listing/[id].tsx
import { LikeButton } from '@/components/LikeButton'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { TrustBadge } from '@/components/TrustBadge'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import {
  addWantedCard,
  archiveWantedCard,
  fetchCard,
  fetchMyWantedCards,
  supabase,
} from '@/lib/supabase'
import {
  getCharacterById,
  getItemTypeById,
  getWorkById,
} from '@/lib/master'
import { Card, computeTrustBadge, Profile, TrustBadgeLevel, WantedCard, WantMatchScore } from '@/lib/types'
import { isWantMatchV2, scoreWantMatchV2 } from '@/lib/matcher' // ★ Step 3 commit 3: v1 → v2 切替
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
function getTrustRows(owner: Profile): { label: string; value: string }[] {
  return [
    { label: '成立件数', value: `${owner.trade_count}件` },
    { label: '発送遵守率', value: `${owner.ship_rate}%` },
    {
      label: '返信中央値',
      value: owner.reply_median_hours < 999 ? `${owner.reply_median_hours}時間` : '—',
    },
    {
      label: '差額平均',
      value: owner.adjustment_avg != null ? `¥${owner.adjustment_avg}` : '—',
    },
    { label: '差額偏り', value: owner.adjustment_bias ?? '—' },
    { label: 'トラブル件数', value: `${owner.trouble_count}件` },
  ]
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
  if (card.allows_adjustment) return '調整金に対応しており、条件が合わせやすいです'
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
  const [myWants, setMyWants] = useState<WantedCard[]>([])
  const [likeToggling, setLikeToggling] = useState(false)
  // ★ 3.5a fix: optimistic 状態 (home.tsx と同じ設計、ただし 1 card のみなので scalar)
  // 'liked' = add 直後 + wantId 保持、'unliked' = archive 直後、null = myWants 判定にフォール
  const [pendingLikeState, setPendingLikeState] = useState<
    { kind: 'liked'; wantId: string } | { kind: 'unliked' } | null
  >(null)
  const [bestMatchScore, setBestMatchScore] = useState<WantMatchScore>('none')
  const [imageSide, setImageSide] = useState<'front' | 'back'>('front')
  // 譲 / 求 タブ: 初期表示は譲 (まず相手が何を出しているかを見せる)
  const [activeTab, setActiveTab] = useState<ListingDetailTab>('offer')

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
        const wants = await fetchMyWantedCards(uid)
        setMyWants(wants)

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

  // ★ 3.5a 機能 H + LikeButton bug fix: optimistic update で構造化 card の fuzzy match 漏れに対応
  // home.tsx と同じ設計 (詳細は home.tsx コメント参照)、ここでは 1 card のみなので scalar state
  //
  // exact name match (card.name === w.card_name) を最優先:
  //   wanted_cards_unique_per_user (user_id, card_name, ...) と整合、Pioneer #001 直接交換と同じ思想
  //   2026-05-23 のホーム ♡ tap バグ (23505 duplicate key) と同根の対策
  const matchesCard = (c: Card, w: WantedCard): boolean =>
    w.card_name === c.name || isWantMatchV2(c, w)

  const isLiked = (() => {
    if (card == null) return false
    if (pendingLikeState?.kind === 'unliked') return false
    if (pendingLikeState?.kind === 'liked') return true
    return myWants.some((w) => matchesCard(card, w))
  })()

  const handleToggleLike = async () => {
    if (currentUserId == null || card == null || likeToggling) return
    setLikeToggling(true)
    try {
      if (isLiked) {
        // archive: pending 由来 or myWants 由来の wantId を解決
        const pendingWantId =
          pendingLikeState?.kind === 'liked' ? pendingLikeState.wantId : null
        const matched = myWants.find((w) => matchesCard(card, w))
        const wantIdToArchive = pendingWantId ?? matched?.id
        setPendingLikeState({ kind: 'unliked' })
        if (wantIdToArchive != null) {
          await archiveWantedCard(wantIdToArchive)
        }
      } else {
        const newWant = await addWantedCard({
          userId: currentUserId,
          cardName: card.name,
          groupName: card.group_name,
          memberName: card.member_name,
          series: card.series,
        })
        setPendingLikeState({ kind: 'liked', wantId: newWant.id })
      }
      const next = await fetchMyWantedCards(currentUserId)
      setMyWants(next)
    } catch {
      Alert.alert('エラー', 'いいねの更新に失敗しました')
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

              {/* 差額: bottom-left overlay（即時スキャン用）*/}
              <View style={[styles.diffOverlay, { backgroundColor: diff.bgColor }]}>
                <Text style={[styles.diffOverlayText, { color: diff.textColor }]}>
                  {diff.text}
                </Text>
              </View>

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
                <Tag
                  text={diff.text}
                  bgColor={diff.bgColor}
                  textColor={diff.textColor}
                />
              </View>

              {/* β1 期待値補正: 手渡し可表示が「通常の交換提案フローで手渡しできる」と
                  誤認されないよう注記。手渡し / 会場交換は専用導線で今後対応予定。 */}
              {card.allows_handoff && (
                <Text style={styles.beta1ExchangeNote}>
                  ※ 現在、通常の交換提案は郵送交換のみ対応です。手渡し・会場交換は今後の専用導線で対応予定です。
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
