// app/venue/holds.tsx
// Venue Hold一覧・現地取引フロー
import { acceptVenueHold, confirmVenueTrade, fetchVenueHolds } from '@/lib/supabase'
import { VenueHold, VenueHoldStatus, VenueTrade } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const HOLD_STATUS_LABELS: Record<VenueHoldStatus, string> = {
  pending: '承認待ち',
  held: 'Hold確定',
  expired: '期限切れ',
  cancelled: 'キャンセル',
  converted: '取引化済み',
}

const HOLD_STATUS_COLORS: Record<VenueHoldStatus, string> = {
  pending: '#D97706',
  held: '#059669',
  expired: '#6B7280',
  cancelled: '#6B7280',
  converted: '#4F46E5',
}

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return '期限切れ'
  const mins = Math.floor(diff / 60000)
  return `あと${mins}分`
}

export default function VenueHoldsScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>()
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [holds, setHolds] = useState<VenueHold[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [venueTrades, setVenueTrades] = useState<Record<string, VenueTrade>>({})

  useFocusEffect(
    useCallback(() => {
      if (venueId == null || userId == null) return
      setLoading(true)
      fetchVenueHolds(venueId, userId)
        .then(setHolds)
        .finally(() => setLoading(false))
    }, [venueId, userId])
  )

  const handleAccept = async (hold: VenueHold) => {
    Alert.alert('Hold申請を承認しますか？', '承認するとHoldが確定し、30分以内に手渡しで交換完了してください。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '承認する',
        onPress: async () => {
          try {
            setActingId(hold.id)
            const trade = await acceptVenueHold(hold.id)
            setVenueTrades((prev) => ({ ...prev, [hold.id]: trade }))
            setHolds((prev) => prev.map((h) => h.id === hold.id ? { ...h, status: 'held' } : h))
          } catch (error) {
            Alert.alert('エラー', '承認に失敗しました')
          } finally {
            setActingId(null)
          }
        },
      },
    ])
  }

  const handleConfirmTrade = async (hold: VenueHold) => {
    const trade = venueTrades[hold.id]
    if (trade == null) return

    const role = hold.proposer_id === userId ? 'proposer' : 'receiver'

    Alert.alert('手渡し完了を確認しますか？', 'カードを受け取ったことを確認します。双方が確認すると取引完了となりTrustが更新されます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '確認する',
        onPress: async () => {
          try {
            setActingId(hold.id)
            await confirmVenueTrade(trade.id, userId!, role)
            Alert.alert('確認しました', role === 'proposer'
              ? '相手の確認待ちです。'
              : '双方確認完了！取引が完了しました。')
            setHolds((prev) => prev.map((h) => h.id === hold.id ? { ...h, status: 'converted' } : h))
          } catch (error) {
            Alert.alert('エラー', '確認に失敗しました')
          } finally {
            setActingId(null)
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {holds.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Hold申請はありません</Text>
            <Text style={styles.emptyBody}>供給板や成立候補からHold申請を送りましょう</Text>
          </View>
        ) : (
          holds.map((hold) => {
            const isProposer = hold.proposer_id === userId
            const isReceiver = hold.receiver_id === userId
            const isActing = actingId === hold.id
            const trade = venueTrades[hold.id]

            return (
              <View key={hold.id} style={styles.holdCard}>
                <View style={styles.holdHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: HOLD_STATUS_COLORS[hold.status] + '18' }]}>
                    <Text style={[styles.statusText, { color: HOLD_STATUS_COLORS[hold.status] }]}>
                      {HOLD_STATUS_LABELS[hold.status]}
                    </Text>
                  </View>
                  {hold.status === 'pending' || hold.status === 'held' ? (
                    <Text style={styles.timeLeft}>{timeLeft(hold.expires_at)}</Text>
                  ) : null}
                </View>

                <View style={styles.tradeContent}>
                  <View style={styles.cardBox}>
                    <Text style={styles.cardBoxLabel}>提案者のカード</Text>
                    <Text style={styles.cardBoxName}>{hold.proposer_card}</Text>
                  </View>
                  <Text style={styles.arrowText}>⇄</Text>
                  <View style={styles.cardBox}>
                    <Text style={styles.cardBoxLabel}>受信者のカード</Text>
                    <Text style={styles.cardBoxName}>{hold.receiver_card}</Text>
                  </View>
                </View>

                <Text style={styles.roleText}>
                  {isProposer ? 'あなたが申請しました' : 'あなたへの申請です'}
                </Text>

                {hold.status === 'pending' && isReceiver && (
                  <Pressable
                    style={[styles.acceptButton, isActing && styles.buttonDisabled]}
                    onPress={() => handleAccept(hold)}
                    disabled={isActing}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.acceptButtonText}>承認する</Text>
                    )}
                  </Pressable>
                )}

                {hold.status === 'held' && trade != null && (
                  <Pressable
                    style={[styles.confirmButton, isActing && styles.buttonDisabled]}
                    onPress={() => handleConfirmTrade(hold)}
                    disabled={isActing}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.confirmButtonText}>手渡し完了を確認する</Text>
                    )}
                  </Pressable>
                )}
              </View>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.base, paddingBottom: 120, gap: spacing.md },
  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary },
  emptyBody: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  holdCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  holdHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  timeLeft: { fontSize: fontSize.xs, color: colors.textTertiary },
  tradeContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardBox: { flex: 1, backgroundColor: colors.backgroundMuted, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  cardBoxLabel: { fontSize: fontSize.xs, color: colors.textTertiary },
  cardBoxName: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary },
  arrowText: { fontSize: 18, color: colors.textTertiary },
  roleText: { fontSize: fontSize.xs, color: colors.textTertiary },
  acceptButton: {
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#FFFFFF' },
  confirmButton: {
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#FFFFFF' },
  buttonDisabled: { opacity: 0.6 },
})
