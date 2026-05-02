// app/listing/[id].tsx
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { TrustBadge } from '@/components/TrustBadge'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { addWantedCard, fetchCard, fetchMyWantedCards, supabase } from '@/lib/supabase'
import { Card, computeTrustBadge, isWantMatch, Profile, scoreWantMatch, TrustBadgeLevel, WantMatchScore } from '@/lib/types'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
    return { text: '差額なし', bgColor: colors.tagGreen, textColor: colors.tagGreenText }
  }
  if (card.adjustment_max != null) {
    return {
      text: `差額 ¥${card.adjustment_max.toLocaleString()}まで可`,
      bgColor: colors.tagAmber,
      textColor: colors.tagAmberText,
    }
  }
  return { text: '差額相談可', bgColor: colors.tagPurple, textColor: colors.tagPurpleText }
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
    default:         return { label: '交換を提案する', disabled: false }
  }
}

// ④ Trust: 判断できる1〜2行（数値の羅列ではなく文脈付き）
function getTrustLines(owner: Profile): string[] {
  return [
    owner.trade_count >= 1
      ? `交換実績 ${owner.trade_count}件`
      : 'まだ交換実績はありません',
    `発送率 ${owner.ship_rate}%`,
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
  if (card.allows_adjustment) return '差額調整に対応しており、条件が合わせやすいです'
  return null
}

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
  const [wantAdded, setWantAdded] = useState(false)
  const [wantAdding, setWantAdding] = useState(false)
  const [isWantSaved, setIsWantSaved] = useState(false)
  const [bestMatchScore, setBestMatchScore] = useState<WantMatchScore>('none')
  const [imageSide, setImageSide] = useState<'front' | 'back'>('front')

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
        setIsWantSaved(wants.some((want) => isWantMatch(fetched, want)))

        const best = wants.reduce<WantMatchScore>((acc, want) => {
          const s = scoreWantMatch(fetched, want)
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
      })
    : 'none'

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

  const handleAddWant = async () => {
    if (currentUserId == null || card == null || wantAdded || wantAdding) return
    try {
      setWantAdding(true)
      await addWantedCard({
        userId: currentUserId,
        cardName: card.name,
        groupName: card.group_name,
        memberName: card.member_name,
        series: card.series,
      })
      setWantAdded(true)
    } catch {
      Alert.alert('エラー', 'ほしいカードへの追加に失敗しました')
    } finally {
      setWantAdding(false)
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
        {/* ① Card ─────────────────────────────── */}
        <View style={styles.imageWrap}>
          {displayImageUrl != null ? (
            <Image source={{ uri: displayImageUrl }} style={styles.image} resizeMode="contain" />
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

          {/* TrustBadge: top-right overlay */}
          <View style={styles.trustOverlay}>
            <TrustBadge level={trustLevel} size="sm" />
          </View>

          {/* 差額: bottom-left overlay（即時スキャン用）*/}
          <View style={[styles.diffOverlay, { backgroundColor: diff.bgColor }]}>
            <Text style={[styles.diffOverlayText, { color: diff.textColor }]}>
              {diff.text}
            </Text>
          </View>
        </View>

        {isNonActive && (
          <View style={[
            styles.statusBanner,
            card.status === 'reserved' ? styles.statusBannerAmber : styles.statusBannerGray,
          ]}>
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
          {card.group_name != null && (
            <Text style={styles.groupName}>{card.group_name}</Text>
          )}
          <Text style={styles.cardName}>{card.name}</Text>
          {memberSeries !== '' && (
            <Text style={styles.memberSeries}>{memberSeries}</Text>
          )}

          {/* ② Want ─────────────────────────────── */}
          <Text style={styles.sectionLabel}>何を求めているか</Text>
          <View style={styles.wantBox}>
            <Text style={styles.wantLabel}>求めているカード</Text>
            <Text style={styles.wantValue}>
              {card.want_description ?? '未設定'}
            </Text>
          </View>
          {(isWantSaved || wantAdded) && !isOwn && (
            <Text style={styles.wantSavedNote}>✓ 保存済みのほしいカードです</Text>
          )}

          {/* ③ Conditions ───────────────────────── */}
          <Text style={styles.sectionLabel}>交換条件</Text>
          <View style={styles.conditionsRow}>
            {card.allows_mail && (
              <Tag text="郵送で交換可" bgColor={colors.tagBlue} textColor={colors.tagBlueText} />
            )}
            {card.allows_handoff && (
              <Tag text="手渡しで交換可" bgColor={colors.tagBlue} textColor={colors.tagBlueText} />
            )}
            <Tag text={diff.text} bgColor={diff.bgColor} textColor={diff.textColor} />
          </View>

          {/* ④ Trust ────────────────────────────── */}
          <Text style={styles.sectionLabel}>出品者</Text>

          {owner != null ? (
            <Pressable style={styles.sellerCard} onPress={handleSellerPress}>
              <View style={styles.sellerTopRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(owner.handle || owner.display_name || '?').slice(0, 1).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.sellerMeta}>
                  <Text style={styles.sellerHandle}>
                    {owner.handle ? `@${owner.handle}` : (owner.display_name ?? '出品者')}
                  </Text>
                  <View style={styles.sellerBadgeRow}>
                    <TrustBadge level={trustLevel} size="sm" />
                  </View>
                </View>

                <Text style={styles.detailLink}>Trust詳細 ›</Text>
              </View>

              {/* 数値の羅列ではなく判断できる形で表示 */}
              <View style={styles.trustLinesWrap}>
                {getTrustLines(owner).map((line, i) => (
                  <Text key={i} style={styles.trustLine}>{line}</Text>
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

          {/* 補足: カード説明（折りたたみ） */}
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

          {/* 補足: ほしいカード追加（ログイン・他人のみ） */}
          {!isOwn && currentUserId != null && (
            <Pressable
              style={[styles.wantButton, (wantAdded || wantAdding) && styles.wantButtonDone]}
              onPress={handleAddWant}
              disabled={wantAdded || wantAdding}
            >
              <Text style={[styles.wantButtonText, wantAdded && styles.wantButtonTextDone]}>
                {wantAdded
                  ? '✓ ほしいカードに追加済み'
                  : wantAdding
                  ? '追加中...'
                  : '＋ ほしいカードに追加'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ⑤ CTA ──────────────────────────────── */}
        {!isOwn && (
          <View style={styles.ctaContainer}>
            {/* A. 押していい理由（1つだけ） */}
            {pushReason != null && (
              <Text style={styles.pushReasonNote} numberOfLines={1}>
                {pushReason}
              </Text>
            )}
            {/* B. 不安除去の一文 */}
            <Text style={styles.ctaReassurance}>
              承認されるまで確定しません
            </Text>
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
  trustOverlay: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
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

  // ── ② want ───────────────────────────────
  wantBox: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  wantLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  wantValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  wantSavedNote: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // ── ③ conditions ─────────────────────────
  conditionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
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
  trustLinesWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  trustLine: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
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

  // ── wants 追加導線 ────────────────────────
  wantButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.base,
    alignSelf: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  wantButtonDone: {
    opacity: 0.5,
  },
  wantButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  wantButtonTextDone: {
    color: colors.textTertiary,
    textDecorationLine: 'none',
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
