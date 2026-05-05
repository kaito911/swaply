// app/offer/[offerId].tsx
// 提案詳細画面（届いた提案 / 送信した提案 共通）
import { TradeStats } from '@/components/TradeStats'
import { TrustBadge } from '@/components/TrustBadge'
import { colors, radius, spacing } from '@/constants/theme'
import { acceptOffer, declineOffer, fetchOfferById } from '@/lib/supabase'
import {
  computeTrustBadge,
  OFFER_STATUS_LABELS,
  type Offer,
  type Profile,
} from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type SimpleProfileLike = {
  display_name?: string | null
  handle?: string | null
}

function getProfileName(profile?: SimpleProfileLike | null): string {
  if (!profile) return 'ユーザー'
  if (profile.display_name && profile.display_name.trim().length > 0) {
    return profile.display_name
  }
  if (profile.handle && profile.handle.trim().length > 0) {
    return `@${profile.handle}`
  }
  return 'ユーザー'
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`
}

export default function OfferDetailScreen() {
  const { offerId: rawOfferId } = useLocalSearchParams<{
    offerId: string | string[]
  }>()
  const offerId = Array.isArray(rawOfferId) ? rawOfferId[0] : rawOfferId

  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [offer, setOffer] = useState<Offer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    if (!offerId) {
      setError('提案IDが見つかりません')
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const data = await fetchOfferById(offerId)
      if (data == null) {
        setError('提案が見つかりません')
      } else {
        setOffer(data)
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '提案の取得に失敗しました'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [offerId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const handleAccept = useCallback(() => {
    if (offer == null) return
    Alert.alert('提案を承認しますか？', '承認すると取引が開始されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '承認',
        onPress: async () => {
          try {
            setActing(true)
            await acceptOffer(offer.id)
            Alert.alert('承認しました', '取引が開始されました。', [
              { text: 'OK', onPress: () => router.back() },
            ])
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '承認に失敗しました'
            Alert.alert('エラー', message)
          } finally {
            setActing(false)
          }
        },
      },
    ])
  }, [offer])

  const handleDecline = useCallback(() => {
    if (offer == null) return
    Alert.alert('提案を辞退しますか？', '辞退するとこの提案は不成立になります。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '辞退',
        style: 'destructive',
        onPress: async () => {
          try {
            setActing(true)
            await declineOffer(offer.id)
            Alert.alert('辞退しました', undefined, [
              { text: 'OK', onPress: () => router.back() },
            ])
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '辞退に失敗しました'
            Alert.alert('エラー', message)
          } finally {
            setActing(false)
          }
        },
      },
    ])
  }, [offer])

  const handleCounter = useCallback(() => {
    if (offer == null || userId == null) return
    const targetCardId = offer.target_card?.id
    const proposerCardId = offer.items?.find(
      (it) => it.card_id !== targetCardId
    )?.card_id
    if (!targetCardId || !proposerCardId) return
    router.push({
      pathname: '/offer/counter',
      params: {
        originalOfferId: offer.id,
        proposerId: userId,
        receiverId: offer.proposer_user_id,
        proposerCardId: targetCardId,
        receiverCardId: proposerCardId,
      },
    })
  }, [offer, userId])

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  // ── Error ──
  if (error != null || offer == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{error ?? '提案が見つかりません'}</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── Main ──
  const isReceived = offer.target_card?.owner_user_id === userId
  const isPendingReceived = isReceived && offer.status === 'pending'
  const counterPartProfile: Profile | null | undefined = isReceived
    ? offer.proposer
    : offer.target_card?.owner

  const targetCard = offer.target_card
  const proposerCardId = offer.items?.find(
    (it) => it.card_id !== offer.target_card?.id
  )?.card_id
  const proposerCard = offer.items?.find(
    (it) => it.card_id === proposerCardId
  )?.card

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* ステータス */}
        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>
              {OFFER_STATUS_LABELS[offer.status]}
            </Text>
          </View>
          <Text style={styles.dateText}>{formatDate(offer.created_at)}</Text>
        </View>

        {/* 相手プロフィール */}
        {counterPartProfile != null && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {isReceived ? '提案者' : '送信先'}
            </Text>
            <Text style={styles.proposerName}>
              {getProfileName(counterPartProfile)}
            </Text>
            <View style={styles.trustRow}>
              <TrustBadge
                level={computeTrustBadge({
                  trade_count: counterPartProfile.trade_count,
                  ship_rate: counterPartProfile.ship_rate,
                  reply_median_hours: counterPartProfile.reply_median_hours,
                  trouble_count: counterPartProfile.trouble_count,
                  last_active_at: counterPartProfile.last_active_at,
                })}
                size="sm"
              />
              <TradeStats
                tradeCount={counterPartProfile.trade_count}
                shipRate={counterPartProfile.ship_rate}
                replyMedianHours={counterPartProfile.reply_median_hours}
                layout="row"
              />
            </View>
          </View>
        )}

        {/* 交換内容 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>交換内容</Text>
          <View style={styles.exchangeRow}>
            <View style={styles.cardCol}>
              <Text style={styles.cardColLabel}>
                {isReceived ? 'あなたが受け取る' : 'あなたが出す'}
              </Text>
              {proposerCard?.image_url != null ? (
                <Image
                  source={{ uri: proposerCard.image_url }}
                  style={styles.cardImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.cardImage, styles.imagePlaceholder]} />
              )}
              <Text style={styles.cardName} numberOfLines={2}>
                {proposerCard?.name ?? 'カード情報なし'}
              </Text>
            </View>

            <Text style={styles.arrow}>⇄</Text>

            <View style={styles.cardCol}>
              <Text style={styles.cardColLabel}>
                {isReceived ? 'あなたが出す' : 'あなたが受け取る'}
              </Text>
              {targetCard?.image_url != null ? (
                <Image
                  source={{ uri: targetCard.image_url }}
                  style={styles.cardImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={[styles.cardImage, styles.imagePlaceholder]} />
              )}
              <Text style={styles.cardName} numberOfLines={2}>
                {targetCard?.name ?? 'カード情報なし'}
              </Text>
            </View>
          </View>
        </View>

        {/* 調整金 */}
        {offer.adjustment_amount != null && offer.adjustment_amount !== 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>調整金</Text>
            <Text style={styles.bodyText}>
              {(() => {
                const amount = offer.adjustment_amount
                const absText = `¥${Math.abs(amount).toLocaleString()}`
                const proposerPays = amount < 0
                const youPay =
                  (isReceived && !proposerPays) ||
                  (!isReceived && proposerPays)
                const direction = youPay ? 'あなた → 相手' : '相手 → あなた'
                return `調整金 ${absText}（${direction}）`
              })()}
            </Text>
          </View>
        )}

        {/* メッセージ */}
        {offer.message != null && offer.message.trim().length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>メッセージ</Text>
            <Text style={styles.bodyText}>{offer.message}</Text>
          </View>
        )}

        {/* アクション（受信側 pending のみ） */}
        {isPendingReceived && (
          <>
            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.secondaryButton, acting && styles.disabledButton]}
                disabled={acting}
                onPress={handleDecline}
              >
                <Text style={styles.secondaryButtonText}>辞退</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, acting && styles.disabledButton]}
                disabled={acting}
                onPress={handleAccept}
              >
                <Text style={styles.primaryButtonText}>承認</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.counterButton, acting && styles.disabledButton]}
              disabled={acting}
              onPress={handleCounter}
            >
              <Text style={styles.counterButtonText}>調整金変更を提案</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  backButton: {
    marginTop: spacing.base,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xl,
    gap: spacing.base,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.tagInfoBg,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.tagInfoText,
  },
  dateText: {
    fontSize: 12,
    color: '#8A8499',
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: '#ECE8FA',
  },
  sectionLabel: {
    fontSize: 12,
    color: '#8A8499',
    marginBottom: 6,
  },
  proposerName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exchangeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  cardCol: {
    flex: 1,
  },
  cardColLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  cardImage: {
    width: '100%',
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    marginBottom: 6,
  },
  imagePlaceholder: {
    backgroundColor: colors.backgroundMuted,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  arrow: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    paddingTop: 40,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flex: 1,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  counterButton: {
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  disabledButton: {
    opacity: 0.6,
  },
})
