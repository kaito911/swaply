import {
    confirmTradeReceipt,
    fetchTradeDetailByOffer,
    submitTradeShipment,
} from '@/lib/supabase'
import { useAuthContext } from '@/providers/AuthProvider'
import { useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type TradeStatus =
  | 'pending'
  | 'in_transit'
  | 'partially_received'
  | 'completed'
  | 'cancelled'
  | 'disputed'

type ShipmentStatus = 'pending' | 'shipped' | 'received' | 'cancelled'

type TradeDetailCard = {
  id: string
  name?: string | null
  image_url?: string | null
  group_name?: string | null
  member_name?: string | null
  series?: string | null
  owner_user_id?: string | null
}

type TradeDetailShipment = {
  id: string
  trade_id: string
  user_id: string
  status: ShipmentStatus
  tracking_number: string | null
  carrier: string | null
  shipped_at: string | null
  received_at: string | null
  created_at?: string
  updated_at?: string
}

type TradeDetailProfile = {
  id: string
  display_name?: string | null
  name?: string | null
  handle?: string | null
  avatar_url?: string | null
}

type TradeCardEntry = {
  offerItemId: string
  offerId: string
  cardId: string
  card?: TradeDetailCard | null
}

type TradeDetailResponse = {
  trade: {
    id: string
    offer_id: string
    proposer_user_id: string
    receiver_user_id: string
    trade_mode: string
    status: TradeStatus
    ship_deadline_at: string
    completed_at?: string | null
    created_at: string
    updated_at: string
  }
  myCards: TradeCardEntry[]
  counterpartCards: TradeCardEntry[]
  myShipment: TradeDetailShipment
  counterpartShipment: TradeDetailShipment
  counterpartProfile?: TradeDetailProfile | null
  counterpartTrust?: {
    badge?: string | null
    completed_trade_count?: number | null
    shipping_compliance_rate?: number | null
    trouble_count?: number | null
  } | null
}

function formatDateTime(value?: string | null): string {
  if (!value) return '未設定'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ja-JP')
}

function getUserLabel(profile?: TradeDetailProfile | null): string {
  if (!profile) return '相手'
  return profile.display_name || profile.name || profile.handle || '相手'
}

function getTradeStatusLabel(status: TradeStatus): string {
  switch (status) {
    case 'pending':
      return '発送待ち'
    case 'in_transit':
      return '発送進行中'
    case 'partially_received':
      return '一部受取済み'
    case 'completed':
      return '取引完了'
    case 'cancelled':
      return 'キャンセル済み'
    case 'disputed':
      return 'トラブル対応中'
    default:
      return status
  }
}

function getShipmentStatusLabel(status?: ShipmentStatus): string {
  switch (status) {
    case 'pending':
      return '未発送'
    case 'shipped':
      return '発送済み'
    case 'received':
      return '受取済み'
    case 'cancelled':
      return 'キャンセル'
    default:
      return '不明'
  }
}

function getStatusNotice(status: TradeStatus) {
  switch (status) {
    case 'pending':
      return {
        tone: 'neutral' as const,
        title: '72時間以内に発送してください',
        body: '期限内に発送登録がない場合、取引は自動キャンセルまたはトラブル扱いになる可能性があります。',
      }
    case 'in_transit':
      return {
        tone: 'info' as const,
        title: '発送進行中です',
        body: '相手の荷物が届いたら受取確認を行ってください。',
      }
    case 'partially_received':
      return {
        tone: 'info' as const,
        title: '一部受取済みです',
        body: 'まだ未受取の荷物があります。到着後に受取確認を行ってください。',
      }
    case 'completed':
      return {
        tone: 'success' as const,
        title: 'この取引は完了しています',
        body: '双方の受取確認が完了しました。',
      }
    case 'cancelled':
      return {
        tone: 'danger' as const,
        title: 'この取引はキャンセルされました',
        body: '発送期限切れなどにより、この取引は終了しています。',
      }
    case 'disputed':
      return {
        tone: 'danger' as const,
        title: 'この取引はトラブル対応中です',
        body: '片側のみ発送済みなどの理由で、通常進行ではなく確認対応が必要な状態です。',
      }
    default:
      return null
  }
}

export default function TradeDetailScreen() {
  const { tradeId } = useLocalSearchParams<{ tradeId?: string | string[] }>()
  const { session } = useAuthContext()

  const [detail, setDetail] = useState<TradeDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [submittingShipment, setSubmittingShipment] = useState(false)
  const [confirmingReceipt, setConfirmingReceipt] = useState(false)

  const offerId = useMemo(() => {
    if (Array.isArray(tradeId)) return tradeId[0] ?? ''
    return tradeId ?? ''
  }, [tradeId])

  const currentUserId = session?.user?.id ?? null

  const loadTrade = useCallback(async () => {
    if (!offerId) {
      setDetail(null)
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      const data = (await fetchTradeDetailByOffer(offerId)) as TradeDetailResponse
      setDetail(data ?? null)
    } catch (error) {
      console.error('[TradeDetailScreen][loadTrade]', error)
      Alert.alert('エラー', '取引詳細の取得に失敗しました')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [offerId])

  useEffect(() => {
    void loadTrade()
  }, [loadTrade])

  const trade = detail?.trade ?? null
  const myShipment = detail?.myShipment ?? null
  const partnerShipment = detail?.counterpartShipment ?? null
  const myCards = detail?.myCards ?? []
  const partnerCards = detail?.counterpartCards ?? []
  const partnerProfile = detail?.counterpartProfile ?? null
  const partnerTrust = detail?.counterpartTrust ?? null

  const tradeStatus = trade?.status ?? 'pending'
  const statusNotice = getStatusNotice(tradeStatus)

  const canSubmitShipment =
    !!trade &&
    !!myShipment &&
    trade.status === 'pending' &&
    myShipment.status === 'pending'

  const canConfirmReceipt =
    !!trade &&
    !!myShipment &&
    !!partnerShipment &&
    (trade.status === 'in_transit' || trade.status === 'partially_received') &&
    partnerShipment.status === 'shipped'

  const showActionBlocked =
    !!trade &&
    (trade.status === 'completed' ||
      trade.status === 'cancelled' ||
      trade.status === 'disputed')

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadTrade()
  }, [loadTrade])

  const handleSubmitShipment = useCallback(async () => {
    if (!trade) return

    const trimmedTracking = trackingNumber.trim()
    const trimmedCarrier = carrier.trim()

    if (!trimmedTracking) {
      Alert.alert('入力不足', '追跡番号を入力してください')
      return
    }

    try {
      setSubmittingShipment(true)
      await submitTradeShipment({
        tradeId: trade.id,
        trackingNumber: trimmedTracking,
        carrier: trimmedCarrier.length > 0 ? trimmedCarrier : null,
      })
      setTrackingNumber('')
      setCarrier('')
      Alert.alert('発送登録完了', '発送情報を登録しました')
      await loadTrade()
    } catch (error) {
      console.error('[TradeDetailScreen][handleSubmitShipment]', error)
      Alert.alert('エラー', '発送登録に失敗しました')
    } finally {
      setSubmittingShipment(false)
    }
  }, [trade, trackingNumber, carrier, loadTrade])

  const handleConfirmReceipt = useCallback(async () => {
    if (!trade) return

    try {
      setConfirmingReceipt(true)
      await confirmTradeReceipt(trade.id)
      Alert.alert('受取確認完了', '受取確認を反映しました')
      await loadTrade()
    } catch (error) {
      console.error('[TradeDetailScreen][handleConfirmReceipt]', error)
      Alert.alert('エラー', '受取確認に失敗しました')
    } finally {
      setConfirmingReceipt(false)
    }
  }, [trade, loadTrade])

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    )
  }

  if (!offerId || !detail || !trade) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.emptyText}>取引情報が見つかりません</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
      >
        <Text style={styles.title}>取引詳細</Text>

        {statusNotice && (
          <View
            style={[
              styles.noticeBox,
              statusNotice.tone === 'neutral' && styles.noticeNeutral,
              statusNotice.tone === 'info' && styles.noticeInfo,
              statusNotice.tone === 'success' && styles.noticeSuccess,
              statusNotice.tone === 'danger' && styles.noticeDanger,
            ]}
          >
            <Text style={styles.noticeTitle}>{statusNotice.title}</Text>
            <Text style={styles.noticeBody}>{statusNotice.body}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>取引概要</Text>
          <Text style={styles.statusBadge}>{getTradeStatusLabel(trade.status)}</Text>
          <Text style={styles.metaText}>発送期限: {formatDateTime(trade.ship_deadline_at)}</Text>
          <Text style={styles.metaText}>取引相手: {getUserLabel(partnerProfile)}</Text>
          <Text style={styles.metaText}>取引方法: {trade.trade_mode}</Text>
          {trade.completed_at ? (
            <Text style={styles.metaText}>完了日時: {formatDateTime(trade.completed_at)}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>相手のTrust</Text>
          <Text style={styles.metaText}>バッジ: {partnerTrust?.badge || '未設定'}</Text>
          <Text style={styles.metaText}>
            完了取引数: {partnerTrust?.completed_trade_count ?? 0}
          </Text>
          <Text style={styles.metaText}>
            発送遵守率: {partnerTrust?.shipping_compliance_rate ?? 0}
          </Text>
          <Text style={styles.metaText}>
            トラブル件数: {partnerTrust?.trouble_count ?? 0}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>自分が出すカード</Text>
          {myCards.length === 0 ? (
            <Text style={styles.emptyText}>カードがありません</Text>
          ) : (
            myCards.map((item) => (
              <View key={item.offerItemId} style={styles.itemRow}>
                <Text style={styles.itemTitle}>{item.card?.name ?? item.cardId}</Text>
                <Text style={styles.itemMeta}>
                  {[item.card?.group_name, item.card?.member_name, item.card?.series]
                    .filter(Boolean)
                    .join(' / ') || '情報なし'}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>相手が出すカード</Text>
          {partnerCards.length === 0 ? (
            <Text style={styles.emptyText}>カードがありません</Text>
          ) : (
            partnerCards.map((item) => (
              <View key={item.offerItemId} style={styles.itemRow}>
                <Text style={styles.itemTitle}>{item.card?.name ?? item.cardId}</Text>
                <Text style={styles.itemMeta}>
                  {[item.card?.group_name, item.card?.member_name, item.card?.series]
                    .filter(Boolean)
                    .join(' / ') || '情報なし'}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>配送状況</Text>

          <View style={styles.shipmentBox}>
            <Text style={styles.shipmentTitle}>自分</Text>
            <Text style={styles.metaText}>
              状態: {getShipmentStatusLabel(myShipment?.status)}
            </Text>
            <Text style={styles.metaText}>
              追跡番号: {myShipment?.tracking_number || '未登録'}
            </Text>
            <Text style={styles.metaText}>
              配送業者: {myShipment?.carrier || '未登録'}
            </Text>
            <Text style={styles.metaText}>
              発送日時: {formatDateTime(myShipment?.shipped_at)}
            </Text>
            <Text style={styles.metaText}>
              受取日時: {formatDateTime(myShipment?.received_at)}
            </Text>
          </View>

          <View style={styles.shipmentBoxLast}>
            <Text style={styles.shipmentTitle}>相手</Text>
            <Text style={styles.metaText}>
              状態: {getShipmentStatusLabel(partnerShipment?.status)}
            </Text>
            <Text style={styles.metaText}>
              追跡番号: {partnerShipment?.tracking_number || '未登録'}
            </Text>
            <Text style={styles.metaText}>
              配送業者: {partnerShipment?.carrier || '未登録'}
            </Text>
            <Text style={styles.metaText}>
              発送日時: {formatDateTime(partnerShipment?.shipped_at)}
            </Text>
            <Text style={styles.metaText}>
              受取日時: {formatDateTime(partnerShipment?.received_at)}
            </Text>
          </View>
        </View>

        {canSubmitShipment && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>発送登録</Text>

            <TextInput
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              placeholder="追跡番号"
              autoCapitalize="none"
              style={styles.input}
            />

            <TextInput
              value={carrier}
              onChangeText={setCarrier}
              placeholder="配送業者（任意）"
              style={styles.input}
            />

            <Pressable
              style={[styles.button, submittingShipment && styles.buttonDisabled]}
              onPress={() => void handleSubmitShipment()}
              disabled={submittingShipment}
            >
              <Text style={styles.buttonText}>
                {submittingShipment ? '登録中...' : '発送を登録する'}
              </Text>
            </Pressable>
          </View>
        )}

        {canConfirmReceipt && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>受取確認</Text>
            <Text style={styles.metaText}>
              相手の荷物が届いたら、受取確認を行ってください。
            </Text>

            <Pressable
              style={[styles.button, confirmingReceipt && styles.buttonDisabled]}
              onPress={() => void handleConfirmReceipt()}
              disabled={confirmingReceipt}
            >
              <Text style={styles.buttonText}>
                {confirmingReceipt ? '確認中...' : '受取確認する'}
              </Text>
            </Pressable>
          </View>
        )}

        {showActionBlocked && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>この取引の操作</Text>
            <Text style={styles.emptyText}>
              この状態の取引では、発送登録や受取確認はできません。
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  noticeBox: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  noticeNeutral: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  noticeInfo: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  noticeSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  noticeDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  noticeBody: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
    overflow: 'hidden',
  },
  metaText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  itemRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 13,
    color: '#6B7280',
  },
  shipmentBox: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  shipmentBoxLast: {
    paddingTop: 10,
  },
  shipmentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
})