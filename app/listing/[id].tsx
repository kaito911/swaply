import { supabase } from '@/lib/supabase'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { SafeAreaView } from 'react-native-safe-area-context'

type CardRow = Record<string, unknown>
type ProfileRow = Record<string, unknown>
type TrustRow = Record<string, unknown>

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toNumberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return fallback
}

function formatPercent(value: unknown): string {
  const num = toNumberValue(value, Number.NaN)

  if (!Number.isFinite(num)) return '—'

  if (num <= 1) {
    return `${Math.round(num * 100)}%`
  }

  return `${Math.round(num)}%`
}

function formatHours(value: unknown): string {
  const num = toNumberValue(value, Number.NaN)

  if (!Number.isFinite(num)) return '—'
  if (num < 1) return '1h以内'

  return `${Math.round(num)}h`
}

function getTrustBadgeLabel(trust: TrustRow | null): string {
  if (!trust) return 'New'

  return (
    toNullableString(trust.badge) ??
    toNullableString(trust.badge_label) ??
    toNullableString(trust.trust_badge) ??
    'New'
  )
}

function getCompletedCount(trust: TrustRow | null): number {
  if (!trust) return 0

  const candidates = [
    trust.completed_trade_count,
    trust.completed_trades_count,
    trust.trade_count,
    trust.success_count,
  ]

  for (const candidate of candidates) {
    const value = toNumberValue(candidate, Number.NaN)
    if (Number.isFinite(value)) return value
  }

  return 0
}

function getShipRate(trust: TrustRow | null): string {
  if (!trust) return '—'

  return formatPercent(
    trust.shipping_compliance_rate ??
      trust.ship_rate ??
      trust.shipping_rate ??
      trust.success_rate
  )
}

function getReplySpeed(trust: TrustRow | null): string {
  if (!trust) return '—'

  return formatHours(
    trust.reply_median_hours ??
      trust.median_reply_hours ??
      trust.reply_hours ??
      trust.response_median_hours
  )
}

function buildMetaLine(card: CardRow | null): string {
  if (!card) return ''

  const parts = [
    toNullableString(card.group_name),
    toNullableString(card.member_name),
    toNullableString(card.series),
  ].filter(Boolean) as string[]

  return parts.join(' / ')
}

function buildWantText(card: CardRow | null): string {
  if (!card) return '未設定'

  return (
    toNullableString(card.want) ??
    toNullableString(card.want_note) ??
    toNullableString(card.want_description) ??
    '未設定'
  )
}

function buildAdjustmentText(card: CardRow | null): string {
  if (!card) return '未設定'

  const allowed =
    card.adjustment_allowed === true ||
    card.accepts_adjustment === true ||
    card.is_adjustment_allowed === true

  return allowed ? '相談可' : 'なし希望'
}

function buildTradeMethodText(card: CardRow | null): string {
  if (!card) return '未設定'

  return (
    toNullableString(card.shipping_policy) ??
    toNullableString(card.trade_method) ??
    toNullableString(card.delivery_method) ??
    '未設定'
  )
}

export default function ListingDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const rawId = params.id
  const listingId = Array.isArray(rawId) ? rawId[0] : rawId

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [card, setCard] = useState<CardRow | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [trust, setTrust] = useState<TrustRow | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const isOwnListing = useMemo(() => {
    if (!card || !currentUserId) return false
    return toStringValue(card.owner_user_id) === currentUserId
  }, [card, currentUserId])

  const fetchListing = useCallback(async () => {
    if (!listingId) {
      setErrorMessage('出品IDが不正です')
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      setErrorMessage(null)

      const [{ data: authData }, cardResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('cards').select('*').eq('id', listingId).single(),
      ])

      setCurrentUserId(authData.user?.id ?? null)

      if (cardResult.error || !cardResult.data) {
        console.log('[ListingDetailScreen][fetchCard]', cardResult.error)
        throw new Error('出品情報の取得に失敗しました')
      }

      const fetchedCard = cardResult.data as CardRow
      setCard(fetchedCard)

      const ownerUserId = toStringValue(fetchedCard.owner_user_id)
      if (!ownerUserId) {
        throw new Error('出品者IDが取得できませんでした')
      }

      const [profileResult, trustResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', ownerUserId).maybeSingle(),
        supabase
          .from('user_trust_stats')
          .select('*')
          .eq('user_id', ownerUserId)
          .maybeSingle(),
      ])

      if (profileResult.error) {
        console.log('[ListingDetailScreen][fetchProfile]', profileResult.error)
        throw new Error('出品者プロフィールの取得に失敗しました')
      }

      if (trustResult.error) {
        console.log('[ListingDetailScreen][fetchTrust]', trustResult.error)
        throw new Error('Trust情報の取得に失敗しました')
      }

      setProfile((profileResult.data as ProfileRow | null) ?? null)
      setTrust((trustResult.data as TrustRow | null) ?? null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '出品を読み込めませんでした'

      setErrorMessage(message)
      setCard(null)
      setProfile(null)
      setTrust(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [listingId])

  useEffect(() => {
    void fetchListing()
  }, [fetchListing])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    void fetchListing()
  }, [fetchListing])

  const onPressBack = useCallback(() => {
    router.back()
  }, [])

  const onPressSellerProfile = useCallback(() => {
    if (!card) return

    const ownerUserId = toStringValue(card.owner_user_id)
    if (!ownerUserId) return

    router.push({
      pathname: '/profile/[id]',
      params: { id: ownerUserId },
    } as never)
  }, [card])

  const onPressPropose = useCallback(() => {
    if (!card) return

    const cardId = toStringValue(card.id)
    if (!cardId) {
      Alert.alert('エラー', '出品IDが取得できませんでした')
      return
    }

    if (isOwnListing) {
      Alert.alert('確認', '自分の出品には交換提案できません')
      return
    }

    router.push({
      pathname: '/offer/create',
      params: { cardId },
    } as never)
  }, [card, isOwnListing])

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6D5EF8" />
          <Text style={styles.loadingText}>出品を読み込んでいます...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (errorMessage || !card) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={onPressBack}>
            <Text style={styles.iconButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>出品詳細</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.center}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorTitle}>出品を読み込めませんでした</Text>
          <Text style={styles.errorBody}>
            {errorMessage ?? '出品情報の取得に失敗しました'}
          </Text>

          <Pressable style={styles.retryButton} onPress={() => void fetchListing()}>
            <Text style={styles.retryButtonText}>再読み込み</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const title =
    toNullableString(card.name) ??
    toNullableString(card.title) ??
    '名称未設定'

  const imageUrl =
    toNullableString(card.image_url) ??
    toNullableString(card.image) ??
    null

  const metaLine = buildMetaLine(card)
  const description =
    toNullableString(card.description) ??
    '説明はまだありません'

  const wantText = buildWantText(card)
  const adjustmentText = buildAdjustmentText(card)
  const tradeMethodText = buildTradeMethodText(card)

  const sellerName =
    toNullableString(profile?.display_name) ??
    toNullableString(profile?.nickname) ??
    toNullableString(profile?.username) ??
    'ユーザー名未設定'

  const badgeLabel = getTrustBadgeLabel(trust)
  const completedCount = getCompletedCount(trust)
  const shipRate = getShipRate(trust)
  const replySpeed = getReplySpeed(trust)

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={onPressBack}>
          <Text style={styles.iconButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>出品詳細</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.imageCard}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.image} />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.imageFallbackText}>画像なし</Text>
            </View>
          )}
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.title}>{title}</Text>
          {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>出品情報</Text>

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>説明</Text>
            <Text style={styles.infoValue}>{description}</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>求カード条件</Text>
            <Text style={styles.infoValue}>{wantText}</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>調整金</Text>
            <Text style={styles.infoValue}>{adjustmentText}</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>交換方法</Text>
            <Text style={styles.infoValue}>{tradeMethodText}</Text>
          </View>
        </View>

        <Pressable style={styles.sectionCard} onPress={onPressSellerProfile}>
          <Text style={styles.sectionTitle}>出品者情報</Text>

          <View style={styles.sellerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {sellerName.slice(0, 1).toUpperCase()}
              </Text>
            </View>

            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName}>{sellerName}</Text>
              <Text style={styles.sellerBadge}>{badgeLabel}</Text>
            </View>
          </View>

          <View style={styles.trustRow}>
            <View style={styles.trustBox}>
              <Text style={styles.trustValue}>{completedCount}</Text>
              <Text style={styles.trustLabel}>成立件数</Text>
            </View>

            <View style={styles.trustBox}>
              <Text style={styles.trustValue}>{shipRate}</Text>
              <Text style={styles.trustLabel}>発送率</Text>
            </View>

            <View style={styles.trustBox}>
              <Text style={styles.trustValue}>{replySpeed}</Text>
              <Text style={styles.trustLabel}>返信速度</Text>
            </View>
          </View>

          <Text style={styles.profileLink}>プロフィールを見る</Text>
        </Pressable>

        <Pressable
          style={[
            styles.primaryButton,
            isOwnListing ? styles.primaryButtonDisabled : null,
          ]}
          onPress={onPressPropose}
          disabled={isOwnListing}
        >
          <Text style={styles.primaryButtonText}>
            {isOwnListing ? '自分の出品です' : '交換を提案する'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F3FB',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    height: 72,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: 32,
    lineHeight: 32,
    color: '#111827',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  headerRight: {
    width: 36,
    height: 36,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#6B7280',
  },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 32,
    lineHeight: 56,
    color: '#6B7280',
    borderWidth: 2,
    borderColor: '#9CA3AF',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  errorBody: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#6D5EF8',
    borderRadius: 18,
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  imageCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 12,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: '#EEF1F7',
  },
  imageFallback: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: '#EEF1F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B7280',
  },
  titleSection: {
    marginTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  meta: {
    marginTop: 8,
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },
  sectionCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 14,
  },
  infoBlock: {
    marginBottom: 14,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECE9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#6D5EF8',
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  sellerBadge: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  trustRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  trustBox: {
    flex: 1,
    backgroundColor: '#F7F8FC',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  trustValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  trustLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  profileLink: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#6D5EF8',
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: '#6D5EF8',
    borderRadius: 18,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#B8BED3',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
})