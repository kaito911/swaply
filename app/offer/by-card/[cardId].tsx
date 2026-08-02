// app/offer/by-card/[cardId].tsx
//
// 「相手から」card軸再設計 (2026-08): 自分の1出品に届いた複数の申請者を縦に並べて
// 比較し、1人を選んで成立させる画面。trades.tsx の「相手から」card軸一覧 (renderReceivedByCard)
// からタップで到達する。
//
// 設計方針 (確定):
//   - 新規クエリなし: fetchMyOffers(userId) の結果を cardId + pending + 自分の出品 で filter。
//     fetchMyOffers は自分関連の offer しか返さないため、他人の cardId を直叩きしても空になる。
//   - Trust (交換人数/取引回数/発送時間/直近ログイン) は表示しない (横並び比較の圧を作らない)。
//   - 申請者名は display_name 優先 (既存 trades.tsx:738-750 の方針を踏襲。handle は fallback のみ)。
//   - 承認は acceptOffer(offer.id) をそのまま使用 (RPC が競合 offer を自動 declined 化し、
//     見送り Push も既存 notify-on-event 経由で飛ぶ)。「他の申請は見送られます」確認は出さない。
//   - 承認成功後の Alert 文言は trades.tsx:181-190 と同一 (「承認しました」「取引が開始されました。」)。

import { ScreenHeader } from '@/components/ScreenHeader'
import { colors } from '@/constants/theme'
import { acceptOffer, fetchMyOffers } from '@/lib/supabase'
import type { Offer } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { useBadge } from '@/providers/BadgeProvider'
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

// 申請者名: display_name 優先、無ければ @handle、それも無ければ「ユーザー」(trades.tsx:738-750 と同方針)。
function proposerName(offer: Offer): string {
  const p = offer.proposer
  if (p?.display_name && p.display_name.trim().length > 0) return p.display_name
  if (p?.handle && p.handle.trim().length > 0) return `@${p.handle}`
  return 'ユーザー'
}

// 相手 (proposer) が出すカード: offer_items のうち target_card 以外。
function proposerCards(offer: Offer): { name: string; image: string | null }[] {
  const targetCardId = offer.target_card?.id
  const items = offer.items?.filter((item) => item.card_id !== targetCardId) ?? []
  if (items.length === 0) return [{ name: 'グッズ情報なし', image: null }]
  return items.map((item) => ({
    name: item.card?.name && item.card.name.trim().length > 0 ? item.card.name : 'グッズ情報なし',
    image: item.card?.image_url ?? null,
  }))
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`
}

export default function OfferByCardScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>()
  const { session } = useAuthContext()
  const { refreshBadge } = useBadge()
  const userId = session?.user?.id ?? null

  const [offers, setOffers] = useState<Offer[]>([])
  const [card, setCard] = useState<Offer['target_card'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (userId == null || cardId == null || cardId === '') {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadFailed(false)
    try {
      // fetchMyOffers は自分関連の offer のみ返す。自分の出品(cardId)宛の pending だけに絞る。
      //   他人の cardId を直叩きしても、その offer は返らず自然に空になる。
      const all = await fetchMyOffers(userId)
      const forCard = all.filter(
        (o) =>
          o.status === 'pending' &&
          o.target_card?.id === cardId &&
          o.target_card?.owner_user_id === userId,
      )
      setOffers(forCard)
      setCard(forCard[0]?.target_card ?? null)
    } catch (error) {
      console.error('[OfferByCard][load]', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [userId, cardId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const handleAccept = useCallback(
    async (offerId: string) => {
      try {
        setAcceptingId(offerId)
        await acceptOffer(offerId)
        await refreshBadge()
        // 文言は trades.tsx:181-190 と同一。
        Alert.alert('承認しました', '取引が開始されました。')
        router.back()
      } catch (error: unknown) {
        console.error('[OfferByCard][handleAccept]', error)
        const message = error instanceof Error ? error.message : '承認に失敗しました'
        Alert.alert('エラー', message)
      } finally {
        setAcceptingId(null)
      }
    },
    [refreshBadge],
  )

  // ── render ──

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="申請者を比較" />
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (loadFailed) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="申請者を比較" />
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>読み込みに失敗しました</Text>
          <Pressable style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryButtonText}>再試行</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  if (offers.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="申請者を比較" />
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>この出品への申請はありません</Text>
          <Text style={styles.emptyBody}>
            すべて対応済みか、取り下げられた可能性があります。
          </Text>
          <Pressable style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="申請者を比較" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 対象の出品カード */}
        {card != null && (
          <View style={styles.targetCard}>
            {card.image_url != null && card.image_url !== '' ? (
              <Image source={{ uri: card.image_url }} style={styles.targetImage} />
            ) : (
              <View style={[styles.targetImage, styles.imageEmpty]} />
            )}
            <View style={styles.targetMeta}>
              <Text style={styles.targetLabel}>この出品への申請</Text>
              <Text style={styles.targetName} numberOfLines={2}>
                {card.name && card.name.trim().length > 0 ? card.name : 'グッズ情報なし'}
              </Text>
              <Text style={styles.targetCount}>申請 {offers.length}件</Text>
            </View>
          </View>
        )}

        {/* 申請者を縦に並べる */}
        {offers.map((offer) => {
          const cards = proposerCards(offer)
          const isAccepting = acceptingId === offer.id
          return (
            <View key={offer.id} style={styles.applicant}>
              <Text style={styles.applicantName} numberOfLines={1}>
                {proposerName(offer)}
              </Text>

              <Text style={styles.blockLabel}>相手が出すグッズ</Text>
              {cards.map((c, i) => (
                <View key={i} style={styles.giveRow}>
                  {c.image != null && c.image !== '' ? (
                    <Image source={{ uri: c.image }} style={styles.giveImage} />
                  ) : (
                    <View style={[styles.giveImage, styles.imageEmpty]} />
                  )}
                  <Text style={styles.giveName} numberOfLines={2}>
                    {c.name}
                  </Text>
                </View>
              ))}

              {offer.message != null && offer.message.trim().length > 0 && (
                <View style={styles.messageBox}>
                  <Text style={styles.messageText}>{offer.message}</Text>
                </View>
              )}

              <Text style={styles.dateText}>{formatDate(offer.created_at)}</Text>

              <Pressable
                style={[styles.acceptButton, isAccepting && styles.acceptButtonDisabled]}
                onPress={() => void handleAccept(offer.id)}
                disabled={isAccepting || acceptingId != null}
              >
                {isAccepting ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.acceptButtonText}>この人と交換する</Text>
                )}
              </Pressable>
            </View>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  retryButtonText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  content: { padding: 16, paddingBottom: 120, gap: 12 },

  // 対象の出品カード
  targetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  targetImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: colors.backgroundMuted,
    flexShrink: 0,
  },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  targetMeta: { flex: 1, minWidth: 0, gap: 3 },
  targetLabel: { fontSize: 11, color: colors.textTertiary },
  targetName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  targetCount: { fontSize: 13, fontWeight: '700', color: colors.primary },

  // 申請者カード
  applicant: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    padding: 14,
    gap: 8,
  },
  applicantName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  blockLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  giveRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  giveImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.backgroundMuted,
    flexShrink: 0,
  },
  giveName: { flex: 1, minWidth: 0, fontSize: 14, color: colors.textPrimary },
  messageBox: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: 10,
    padding: 10,
  },
  messageText: { fontSize: 13, color: colors.textPrimary },
  dateText: { fontSize: 12, color: colors.textTertiary },
  acceptButton: {
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  acceptButtonDisabled: { opacity: 0.6 },
  acceptButtonText: { fontSize: 14, fontWeight: '700', color: colors.textInverse },
})
