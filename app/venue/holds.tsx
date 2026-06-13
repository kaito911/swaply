// app/venue/holds.tsx
// Venue Hold一覧（PR2: 受信 / 送信 / 成立済の 3 タブ構成）
//
// タブ分離:
//   - received: 自分が受信者 (= supply_post 投稿者) の Hold。承認 / 拒否ボタン。
//   - sent:     自分が申請者の Hold。取消ボタン。
//   - converted: held / converted (= venue_trade 生成後)。手渡し完了確認 (legacy)。
//
// lazy expiry:
//   - pending かつ expires_at < now() を UI 上「期限切れ」扱いで承認 / 拒否 / 取消ボタン非表示。
//   - DB 上は pending のまま (PR2 では expired への遷移はしない。P1 で pg_cron)。
//
// 手渡し完了確認 (converted タブ) は B1 (in-memory trade) / B2 (receiver 先行 CHECK 違反)
// バグを残したまま温存。PR4a で再設計予定。
import {
  acceptVenueHold,
  cancelVenueHold,
  confirmVenueTrade,
  declineVenueHold,
  fetchVenueHolds,
  type VenueHoldWithRelations,
} from '@/lib/supabase'
import {
  computeTrustBadge,
  VENUE_HOLD_STATUS_LABELS,
  VenueHoldStatus,
  VenueTrade,
} from '@/lib/types'
import { TrustBadge } from '@/components/TrustBadge'
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

type Tab = 'received' | 'sent' | 'converted'

const HOLD_STATUS_COLORS: Record<VenueHoldStatus, string> = {
  pending: '#D97706',
  held: '#059669',
  expired: '#6B7280',
  cancelled: '#6B7280',
  converted: '#4F46E5',
  declined: '#6B7280',
}

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return '期限切れ'
  const mins = Math.floor(diff / 60000)
  return `あと${mins}分`
}

function isExpired(hold: VenueHoldWithRelations): boolean {
  return (
    hold.status === 'pending' &&
    new Date(hold.expires_at).getTime() < Date.now()
  )
}

function isConvertedLike(hold: VenueHoldWithRelations): boolean {
  // held は legacy だが PR4 まで残置。converted と同じ「成立済」扱い。
  return hold.status === 'held' || hold.status === 'converted'
}

function counterpartName(
  profile: { handle: string | null; display_name: string | null } | null | undefined
): string {
  if (profile == null) return '削除済みユーザー'
  return profile.handle ?? profile.display_name ?? 'ユーザー'
}

export default function VenueHoldsScreen() {
  const { venueId, tab: tabParam } = useLocalSearchParams<{
    venueId: string
    tab?: string
  }>()
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const initialTab: Tab =
    tabParam === 'sent' || tabParam === 'converted' ? tabParam : 'received'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [holds, setHolds] = useState<VenueHoldWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [venueTrades, setVenueTrades] = useState<Record<string, VenueTrade>>({})

  const reload = useCallback(async () => {
    if (venueId == null || userId == null) return
    setLoading(true)
    const fresh = await fetchVenueHolds(venueId, userId, 'all')
    setHolds(fresh)
    setLoading(false)
  }, [venueId, userId])

  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload])
  )

  const matchTab = (h: VenueHoldWithRelations, t: Tab): boolean => {
    if (userId == null) return false
    if (t === 'converted') return isConvertedLike(h)
    if (t === 'received') return h.receiver_id === userId && !isConvertedLike(h)
    if (t === 'sent') return h.proposer_id === userId && !isConvertedLike(h)
    return false
  }

  const receivedCount = holds.filter((h) => matchTab(h, 'received')).length
  const sentCount = holds.filter((h) => matchTab(h, 'sent')).length
  const convertedCount = holds.filter((h) => matchTab(h, 'converted')).length

  const visible = holds.filter((h) => matchTab(h, tab))

  const handleAccept = (hold: VenueHoldWithRelations) => {
    Alert.alert(
      'Hold申請を承認しますか？',
      '承認するとHoldが確定し、30分以内に手渡しで交換完了してください。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '承認する',
          onPress: async () => {
            try {
              setActingId(hold.id)
              const trade = await acceptVenueHold(hold.id)
              setVenueTrades((prev) => ({ ...prev, [hold.id]: trade }))
              setHolds((prev) =>
                prev.map((h) =>
                  h.id === hold.id ? { ...h, status: 'held' } : h
                )
              )
              // accept 後は成立済タブへ自動切替
              setTab('converted')
            } catch (error) {
              console.error('[VenueHolds][handleAccept]', error)
              Alert.alert('エラー', '承認に失敗しました')
            } finally {
              setActingId(null)
            }
          },
        },
      ]
    )
  }

  const handleDecline = (hold: VenueHoldWithRelations) => {
    if (userId == null) return
    Alert.alert(
      'Hold申請を拒否しますか？',
      '拒否すると申請者には「拒否済み」と表示されます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '拒否する',
          style: 'destructive',
          onPress: async () => {
            try {
              setActingId(hold.id)
              await declineVenueHold(hold.id, userId)
              setHolds((prev) =>
                prev.map((h) =>
                  h.id === hold.id ? { ...h, status: 'declined' } : h
                )
              )
            } catch (error) {
              console.error('[VenueHolds][handleDecline]', error)
              Alert.alert('エラー', '拒否に失敗しました')
            } finally {
              setActingId(null)
            }
          },
        },
      ]
    )
  }

  const handleCancel = (hold: VenueHoldWithRelations) => {
    if (userId == null) return
    Alert.alert(
      'Hold申請を取り消しますか？',
      '取り消すと相手側にも「キャンセル」として表示されます。',
      [
        { text: '戻る', style: 'cancel' },
        {
          text: '取り消す',
          style: 'destructive',
          onPress: async () => {
            try {
              setActingId(hold.id)
              await cancelVenueHold(hold.id, userId)
              setHolds((prev) =>
                prev.map((h) =>
                  h.id === hold.id ? { ...h, status: 'cancelled' } : h
                )
              )
            } catch (error) {
              console.error('[VenueHolds][handleCancel]', error)
              Alert.alert('エラー', '取消に失敗しました')
            } finally {
              setActingId(null)
            }
          },
        },
      ]
    )
  }

  const handleConfirmTrade = async (hold: VenueHoldWithRelations) => {
    const trade = venueTrades[hold.id]
    if (trade == null || userId == null) return

    const role = hold.proposer_id === userId ? 'proposer' : 'receiver'

    Alert.alert(
      '手渡し完了を確認しますか？',
      'カードを受け取ったことを確認します。双方が確認すると取引完了となりTrustが更新されます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '確認する',
          onPress: async () => {
            try {
              setActingId(hold.id)
              await confirmVenueTrade(trade.id, userId, role)
              Alert.alert(
                '確認しました',
                role === 'proposer'
                  ? '相手の確認待ちです。'
                  : '双方確認完了！取引が完了しました。'
              )
              setHolds((prev) =>
                prev.map((h) =>
                  h.id === hold.id ? { ...h, status: 'converted' } : h
                )
              )
            } catch (error) {
              console.error('[VenueHolds][handleConfirmTrade]', error)
              Alert.alert('エラー', '確認に失敗しました')
            } finally {
              setActingId(null)
            }
          },
        },
      ]
    )
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'received', label: '受信', count: receivedCount },
    { key: 'sent', label: '送信', count: sentCount },
    { key: 'converted', label: '成立済', count: convertedCount },
  ]

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* タブヘッダー */}
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            onPress={() => setTab(t.key)}
          >
            <Text
              style={[
                styles.tabLabel,
                tab === t.key && styles.tabLabelActive,
              ]}
            >
              {t.label}（{t.count}）
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>
            {tab === 'received'
              ? '受信中のHoldはありません'
              : tab === 'sent'
              ? '送信中のHoldはありません'
              : '成立済みのHoldはありません'}
          </Text>
          <Text style={styles.emptyBody}>
            {tab === 'received'
              ? 'あなたの会場投稿に届いたHoldがここに表示されます'
              : tab === 'sent'
              ? '当日供給板からHold申請を送るとここに表示されます'
              : '承認したHoldがここに集まります'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {visible.map((hold) => {
            const expired = isExpired(hold)
            const displayStatus: VenueHoldStatus = expired
              ? 'expired'
              : hold.status
            const displayLabel = VENUE_HOLD_STATUS_LABELS[displayStatus]
            const displayColor = HOLD_STATUS_COLORS[displayStatus]
            const counterpart =
              tab === 'received' ? hold.proposer_profile : hold.receiver_profile
            const isActing = actingId === hold.id
            const trade = venueTrades[hold.id]

            const showAccept =
              tab === 'received' && hold.status === 'pending' && !expired
            const showDecline = showAccept
            const showCancel =
              tab === 'sent' && hold.status === 'pending' && !expired
            const showConfirmTrade =
              tab === 'converted' && hold.status === 'held' && trade != null

            return (
              <View key={hold.id} style={styles.holdCard}>
                <View style={styles.holdHeader}>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: displayColor + '18' },
                    ]}
                  >
                    <Text
                      style={[styles.statusText, { color: displayColor }]}
                    >
                      {displayLabel}
                    </Text>
                  </View>
                  {(hold.status === 'pending' && !expired) ||
                  hold.status === 'held' ? (
                    <Text style={styles.timeLeft}>
                      {timeLeft(hold.expires_at)}
                    </Text>
                  ) : null}
                </View>

                {/* 相手情報 (counterpart) */}
                {counterpart != null && (
                  <View style={styles.counterpartRow}>
                    <Text style={styles.counterpartLabel}>
                      {tab === 'received' ? '申請者: ' : '投稿者: '}
                    </Text>
                    <Text style={styles.counterpartName}>
                      @{counterpartName(counterpart)}
                    </Text>
                    <TrustBadge
                      level={computeTrustBadge({
                        trade_count: counterpart.trade_count,
                        ship_rate: counterpart.ship_rate,
                        reply_median_hours: 24,
                        trouble_count: counterpart.trouble_count,
                        last_active_at: null,
                      })}
                    />
                  </View>
                )}
                {counterpart == null && (
                  <Text style={styles.counterpartRemoved}>
                    {tab === 'received' ? '申請者' : '投稿者'}: 削除済みユーザー
                  </Text>
                )}

                {/* 譲 / 求 */}
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

                {/* supply_post が SET NULL されている場合 */}
                {hold.supply_post_id == null && (
                  <Text style={styles.removedNote}>
                    ※ 元の会場投稿は削除されています
                  </Text>
                )}

                {/* アクション行 */}
                {(showAccept || showDecline) && (
                  <View style={styles.actionRow}>
                    {showDecline && (
                      <Pressable
                        style={[
                          styles.declineButton,
                          isActing && styles.buttonDisabled,
                        ]}
                        onPress={() => handleDecline(hold)}
                        disabled={isActing}
                      >
                        <Text style={styles.declineButtonText}>拒否</Text>
                      </Pressable>
                    )}
                    {showAccept && (
                      <Pressable
                        style={[
                          styles.acceptButton,
                          isActing && styles.buttonDisabled,
                        ]}
                        onPress={() => handleAccept(hold)}
                        disabled={isActing}
                      >
                        {isActing ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.acceptButtonText}>承認</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                )}

                {showCancel && (
                  <Pressable
                    style={[
                      styles.cancelButton,
                      isActing && styles.buttonDisabled,
                    ]}
                    onPress={() => handleCancel(hold)}
                    disabled={isActing}
                  >
                    {isActing ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.textSecondary}
                      />
                    ) : (
                      <Text style={styles.cancelButtonText}>取消</Text>
                    )}
                  </Pressable>
                )}

                {showConfirmTrade && (
                  <Pressable
                    style={[
                      styles.confirmButton,
                      isActing && styles.buttonDisabled,
                    ]}
                    onPress={() => handleConfirmTrade(hold)}
                    disabled={isActing}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.confirmButtonText}>
                        手渡し完了を確認する
                      </Text>
                    )}
                  </Pressable>
                )}

                {tab === 'converted' &&
                  hold.status === 'held' &&
                  trade == null && (
                    <Text style={styles.legacyNote}>
                      ※ 手渡し完了確認は再設計予定。一度この画面を離れて戻ると一時的に押せなくなることがあります（PR4で対応予定）。
                    </Text>
                  )}

                {expired && (
                  <Text style={styles.expiredHint}>
                    ※ 期限切れのため操作できません
                  </Text>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.base,
  },
  tabItem: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: colors.primary },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textTertiary,
  },
  tabLabelActive: { color: colors.primary, fontWeight: fontWeight.bold },
  content: { padding: spacing.base, paddingBottom: 120, gap: spacing.md },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  holdCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  holdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  timeLeft: { fontSize: fontSize.xs, color: colors.textTertiary },
  counterpartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  counterpartLabel: { fontSize: fontSize.xs, color: colors.textTertiary },
  counterpartName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  counterpartRemoved: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  tradeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardBox: {
    flex: 1,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  cardBoxLabel: { fontSize: fontSize.xs, color: colors.textTertiary },
  cardBoxName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  arrowText: { fontSize: 18, color: colors.textTertiary },
  removedNote: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  acceptButton: {
    flex: 2,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  declineButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  cancelButton: {
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  confirmButton: {
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  buttonDisabled: { opacity: 0.6 },
  legacyNote: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  expiredHint: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
})
