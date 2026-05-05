// app/trade/[offerId].tsx
import { colors } from '@/constants/theme'
import {
    cancelTrade,
    confirmTradeReceipt,
    fetchTradeDetailByOffer,
    openTradeDispute,
    submitTradeShipment,
} from '@/lib/supabase'
import { useAuthContext } from '@/providers/AuthProvider'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
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
    TextInput,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// ─────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────

type TradeStatus =
  | 'pending'
  | 'in_transit'
  | 'partially_received'
  | 'completed'
  | 'cancelled'
  | 'disputed'

type ShipmentStatus = 'pending' | 'shipped' | 'received' | 'cancelled'

type TradeRow = {
  id: string
  offer_id: string
  proposer_user_id: string
  receiver_user_id: string
  trade_mode: string
  status: TradeStatus
  ship_deadline_at: string
  completed_at: string | null
  cancelled_at: string | null
  dispute_reason?: string | null
  created_at: string
  updated_at: string
}

type ShipmentRow = {
  id?: string
  trade_id?: string
  user_id?: string
  status?: ShipmentStatus
  tracking_number?: string | null
  carrier?: string | null
  shipped_at?: string | null
  received_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type ProfileRow = {
  id?: string
  username?: string | null
  handle?: string | null
  display_name?: string | null
  full_name?: string | null
  avatar_url?: string | null
  shipping_name?: string | null
  postal_code?: string | null
  address_line1?: string | null
  address_line2?: string | null
}

type TrustRow = {
  user_id?: string
  completed_trade_count?: number
  shipping_compliance_rate?: number
  receive_confirm_median_hours?: number | null
  badge?: string | null
}

type CardPayload = {
  id?: string
  name?: string | null
  title?: string | null
  group_name?: string | null
  member_name?: string | null
  member?: string | null
  idol_name?: string | null
  series?: string | null
  image_url?: string | null
  status?: string | null
}

type OfferCardItem = {
  offerItemId: string
  offerId: string
  cardId: string
  card: CardPayload
}

type TradeDetail = {
  trade: TradeRow
  myCards: OfferCardItem[]
  counterpartCards: OfferCardItem[]
  myShipment: ShipmentRow
  counterpartShipment: ShipmentRow
  counterpartProfile: ProfileRow
  counterpartTrust: TrustRow
}

// ─────────────────────────────────────────
// UIState
// ─────────────────────────────────────────

type UIState =
  | 'waiting_my_ship'
  | 'waiting_their_ship'
  | 'waiting_their_receipt'
  | 'waiting_my_receipt'
  | 'completed'
  | 'cancelled'
  | 'disputed'

type UIStateConfig = {
  headline: string
  note: string
  stepIndex: number // -1 = 進行バー非表示
}

const UI_STATE_CONFIG: Record<UIState, UIStateConfig> = {
  waiting_my_ship: {
    headline: 'あなたの発送待ちです',
    note: '発送後、追跡番号を入力してください。同時発送ルールにより、相手も同時に発送する必要があります。',
    stepIndex: 1,
  },
  waiting_their_ship: {
    headline: '相手の発送待ちです',
    note: '相手が発送すると次のステップに進みます。しばらくお待ちください。',
    stepIndex: 1,
  },
  waiting_their_receipt: {
    headline: '相手の受取確認待ちです',
    note: 'あなたの受取確認は完了しています。相手の確認をお待ちください。',
    stepIndex: 2,
  },
  waiting_my_receipt: {
    headline: '受取確認をしてください',
    note: '荷物を受け取ったあとに確認してください。双方の確認完了で取引が終了します。',
    stepIndex: 2,
  },
  completed: {
    headline: '交換が完了しました',
    note: '双方の受取確認が完了しました。',
    stepIndex: 3,
  },
  cancelled: {
    headline: 'この取引はキャンセルされました',
    note: 'これ以上の発送・受取操作はできません。カード状態が元に戻っているか確認してください。',
    stepIndex: -1,
  },
  disputed: {
    headline: '問題対応中です',
    note: '運営の対応をお待ちください。追加発送や自己判断のキャンセルは避けてください。',
    stepIndex: -1,
  },
}

const PROGRESS_STEPS = ['承認', '発送', '受取', '完了'] as const

function getUIState(
  trade: TradeRow,
  canSubmitShipment: boolean,
  canConfirmReceipt: boolean,
  myShipmentStatus: ShipmentStatus | undefined,
): UIState {
  if (trade.status === 'completed') return 'completed'
  if (trade.status === 'cancelled') return 'cancelled'
  if (trade.status === 'disputed') return 'disputed'
  if (canConfirmReceipt) return 'waiting_my_receipt'
  if (canSubmitShipment) return 'waiting_my_ship'
  if (myShipmentStatus === 'received') return 'waiting_their_receipt'
  return 'waiting_their_ship'
}

// ─────────────────────────────────────────
// ヘルパー関数
// ─────────────────────────────────────────

function getDisplayName(profile: ProfileRow): string {
  return (
    profile.display_name ||
    profile.handle ||
    profile.username ||
    profile.full_name ||
    '相手ユーザー'
  )
}

function getCardName(card: CardPayload): string {
  return card.name || card.title || 'カード名未設定'
}

function getCardMember(card: CardPayload): string {
  return card.member_name || card.member || card.idol_name || 'メンバー未設定'
}

function getCardSeries(card: CardPayload): string {
  return card.series || 'シリーズ未設定'
}

function getCardGroup(card: CardPayload): string {
  return card.group_name || 'グループ未設定'
}

function formatDateTime(value?: string | null): string {
  if (!value) return '未設定'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未設定'
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`
}

function formatHoursLeft(deadline?: string | null): string {
  if (!deadline) return ''
  const diffMs = new Date(deadline).getTime() - Date.now()
  if (Number.isNaN(diffMs)) return ''
  if (diffMs <= 0) return '⚠️ 発送期限を過ぎています'
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) return `発送期限まで ${days}日 ${hours}時間`
  return `発送期限まで ${hours}時間`
}

function getShipmentLabel(status?: ShipmentStatus): string {
  switch (status) {
    case 'pending': return '未発送'
    case 'shipped': return '発送済み'
    case 'received': return '受取確認済み'
    case 'cancelled': return 'キャンセル'
    default: return '未設定'
  }
}

// ─────────────────────────────────────────
// サブコンポーネント
// ─────────────────────────────────────────

function CardItemRow({
  item,
  roleLabel,
}: {
  item: OfferCardItem
  roleLabel: string
}) {
  const imageUrl = item.card?.image_url
  return (
    <View style={styles.cardItemRow}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.cardImage} />
      ) : (
        <View style={styles.cardImageFallback}>
          <Text style={styles.cardImageFallbackText}>NO IMAGE</Text>
        </View>
      )}
      <View style={styles.cardMeta}>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{roleLabel}</Text>
        </View>
        <Text style={styles.cardTitle}>{getCardName(item.card)}</Text>
        <Text style={styles.cardMetaText}>グループ: {getCardGroup(item.card)}</Text>
        <Text style={styles.cardMetaText}>メンバー: {getCardMember(item.card)}</Text>
        <Text style={styles.cardMetaText}>シリーズ: {getCardSeries(item.card)}</Text>
      </View>
    </View>
  )
}

function ShipmentBox({
  title,
  shipment,
}: {
  title: string
  shipment: ShipmentRow
}) {
  return (
    <View style={styles.shipmentBox}>
      <Text style={styles.sectionSubTitle}>{title}</Text>
      <Text style={styles.shipmentText}>状態: {getShipmentLabel(shipment.status)}</Text>
      <Text style={styles.shipmentText}>
        追跡番号: {shipment.tracking_number || '未登録'}
      </Text>
      <Text style={styles.shipmentText}>配送会社: {shipment.carrier || '未登録'}</Text>
      <Text style={styles.shipmentText}>
        発送時刻: {formatDateTime(shipment.shipped_at)}
      </Text>
      <Text style={styles.shipmentText}>
        受取時刻: {formatDateTime(shipment.received_at)}
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────
// メイン画面
// ─────────────────────────────────────────

export default function TradeDetailScreen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>()
  const { session } = useAuthContext()

  const currentUserId = session?.user?.id ?? null

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submittingShipment, setSubmittingShipment] = useState(false)
  const [confirmingReceipt, setConfirmingReceipt] = useState(false)
  const [cancellingTrade, setCancellingTrade] = useState(false)
  const [openingDispute, setOpeningDispute] = useState(false)

  const [detail, setDetail] = useState<TradeDetail | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeDetail, setDisputeDetail] = useState('')

  const loadTrade = useCallback(async () => {
    if (!offerId || typeof offerId !== 'string') {
      throw new Error('offerId が不正です。')
    }
    const payload = await fetchTradeDetailByOffer(offerId)
    if (!payload?.trade?.id) {
      throw new Error('trade 情報が取得できませんでした。')
    }
    setDetail(payload as TradeDetail)
    setTrackingNumber(payload?.myShipment?.tracking_number || '')
    setCarrier(payload?.myShipment?.carrier || '')
  }, [offerId])

  const initialLoad = useCallback(async () => {
    try {
      setLoading(true)
      await loadTrade()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '取引情報の取得に失敗しました。'
      Alert.alert('読み込みエラー', message)
    } finally {
      setLoading(false)
    }
  }, [loadTrade])

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true)
      await loadTrade()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '最新状態の取得に失敗しました。'
      Alert.alert('更新エラー', message)
    } finally {
      setRefreshing(false)
    }
  }, [loadTrade])

  useEffect(() => {
    void initialLoad()
  }, [initialLoad])

  useFocusEffect(
    useCallback(() => {
      loadTrade().catch(() => undefined)
    }, [loadTrade])
  )

  const trade = detail?.trade
  const myCards = detail?.myCards ?? []
  const counterpartCards = detail?.counterpartCards ?? []
  const myShipment = detail?.myShipment ?? {}
  const counterpartShipment = detail?.counterpartShipment ?? {}
  const counterpartProfile = detail?.counterpartProfile ?? {}
  const counterpartTrust = detail?.counterpartTrust ?? {}

  const myShipmentStatus = myShipment.status
  const counterpartShipmentStatus = counterpartShipment.status

  const canSubmitShipment =
    !!trade &&
    (trade.status === 'pending' || trade.status === 'in_transit') &&
    myShipmentStatus !== 'shipped' &&
    myShipmentStatus !== 'received' &&
    myShipmentStatus !== 'cancelled'

  const canConfirmReceipt =
    !!trade &&
    (trade.status === 'in_transit' || trade.status === 'partially_received') &&
    counterpartShipmentStatus === 'shipped' &&
    myShipmentStatus !== 'received'

  const canCancelTrade =
    !!trade &&
    trade.status === 'pending' &&
    myShipmentStatus !== 'shipped' &&
    myShipmentStatus !== 'received' &&
    counterpartShipmentStatus !== 'shipped' &&
    counterpartShipmentStatus !== 'received'

  const canOpenDispute =
    !!trade &&
    currentUserId != null &&
    trade.status !== 'completed' &&
    trade.status !== 'cancelled'

  const handleSubmitShipment = useCallback(async () => {
    if (!trade?.id) {
      Alert.alert('エラー', '取引IDが取得できません。')
      return
    }
    if (!trackingNumber.trim()) {
      Alert.alert('入力エラー', '追跡番号を入力してください。')
      return
    }
    try {
      setSubmittingShipment(true)
      await submitTradeShipment({
        tradeId: trade.id,
        trackingNumber: trackingNumber.trim(),
        carrier: carrier.trim() || null,
      })
      Alert.alert('発送通知完了', '発送状況を更新しました。')
      await loadTrade()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '発送通知に失敗しました。'
      Alert.alert('発送通知エラー', message)
    } finally {
      setSubmittingShipment(false)
    }
  }, [carrier, loadTrade, trackingNumber, trade?.id])

  const handleConfirmReceipt = useCallback(async () => {
    if (!trade?.id) {
      Alert.alert('エラー', '取引IDが取得できません。')
      return
    }
    Alert.alert(
      '受取確認',
      '相手から届いた荷物を受け取ったあとに実行してください。よろしいですか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '確認する',
          onPress: async () => {
            try {
              setConfirmingReceipt(true)
              await confirmTradeReceipt(trade.id)
              Alert.alert('受取確認完了', '受取状態を更新しました。')
              await loadTrade()
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : '受取確認に失敗しました。'
              Alert.alert('受取確認エラー', message)
            } finally {
              setConfirmingReceipt(false)
            }
          },
        },
      ]
    )
  }, [loadTrade, trade?.id])

  const handleCancelTrade = useCallback(async () => {
    if (!trade?.id || !currentUserId) {
      Alert.alert('エラー', '必要な情報が取得できません。')
      return
    }
    Alert.alert(
      '取引をキャンセル',
      '発送前のみキャンセルできます。キャンセルすると取引は中断され、対象カードは active に戻ります。実行しますか？',
      [
        { text: '戻る', style: 'cancel' },
        {
          text: 'キャンセルする',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancellingTrade(true)
              await cancelTrade(trade.id, currentUserId)
              Alert.alert('キャンセル完了', '取引をキャンセルしました。')
              await loadTrade()
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : '取引のキャンセルに失敗しました。'
              Alert.alert('キャンセルエラー', message)
            } finally {
              setCancellingTrade(false)
            }
          },
        },
      ]
    )
  }, [currentUserId, loadTrade, trade?.id])

  const handleOpenDispute = useCallback(async () => {
    if (!trade?.id || !currentUserId) {
      Alert.alert('エラー', '必要な情報が取得できません。')
      return
    }
    if (!disputeReason.trim()) {
      Alert.alert('入力エラー', '問題区分を入力してください。')
      return
    }
    try {
      setOpeningDispute(true)
      await openTradeDispute({
        tradeId: trade.id,
        userId: currentUserId,
        disputeReason: disputeReason.trim(),
        detailText: disputeDetail.trim() || null,
      })
      Alert.alert('問題報告を受け付けました', '取引状態を問題対応中に更新しました。')
      await loadTrade()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '問題報告に失敗しました。'
      Alert.alert('問題報告エラー', message)
    } finally {
      setOpeningDispute(false)
    }
  }, [currentUserId, disputeDetail, disputeReason, loadTrade, trade?.id])

  // ── Loading ──────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#6D5EF5" />
          <Text style={styles.centerText}>取引情報を読み込み中です</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!detail || !trade) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>取引情報が見つかりません</Text>
          <Text style={styles.emptyBody}>
            offer と trade の紐付けが取得できませんでした。
          </Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── UIState 導出 ──────────────────────────

  const uiState = getUIState(trade, canSubmitShipment, canConfirmReceipt, myShipmentStatus)
  const uiConfig = UI_STATE_CONFIG[uiState]
  const stepIndex = uiConfig.stepIndex
  const showProgress = stepIndex >= 0
  const deadlineText = formatHoursLeft(trade.ship_deadline_at)
  const isDeadlinePast =
    !!trade.ship_deadline_at &&
    new Date(trade.ship_deadline_at).getTime() < Date.now()
  const hasAddress =
    counterpartProfile.shipping_name != null ||
    counterpartProfile.address_line1 != null

  // ── Main ─────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >

        {/* [1] Header ── 今なに待ちか */}
        <View style={[
          styles.headerCard,
          uiState === 'completed' ? styles.headerCardCompleted :
          uiState === 'cancelled' ? styles.headerCardCancelled :
          uiState === 'disputed' ? styles.headerCardDisputed :
          undefined,
        ]}>
          <Pressable style={styles.headerBackButton} onPress={() => router.back()}>
            <Text style={styles.headerBackButtonText}>← 戻る</Text>
          </Pressable>

          <Text style={[
            styles.uiStateHeadline,
            uiState === 'completed' ? styles.headlineCompleted :
            uiState === 'cancelled' ? styles.headlineCancelled :
            uiState === 'disputed' ? styles.headlineDisputed :
            uiState === 'waiting_my_ship' || uiState === 'waiting_my_receipt' ? styles.headlineMyTurn :
            undefined,
          ]}>
            {uiConfig.headline}
          </Text>

          <Text style={styles.counterpartLabel}>
            {getDisplayName(counterpartProfile)} との取引
          </Text>

          {uiState === 'waiting_my_ship' && deadlineText !== '' && (
            <Text style={[styles.deadlineText, isDeadlinePast && styles.deadlineTextExpired]}>
              {deadlineText}
            </Text>
          )}
        </View>

        {/* [2] Progress ── 今どこか */}
        {showProgress && (
          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              {PROGRESS_STEPS.map((label, i) => (
                <React.Fragment key={label}>
                  <View style={styles.progressStep}>
                    <View style={[
                      styles.progressDot,
                      i < stepIndex ? styles.progressDotDone :
                      i === stepIndex ? styles.progressDotActive :
                      styles.progressDotFuture,
                    ]}>
                      <Text style={[
                        styles.progressDotText,
                        i < stepIndex ? styles.progressDotTextDone :
                        i === stepIndex ? styles.progressDotTextActive :
                        styles.progressDotTextFuture,
                      ]}>
                        {i < stepIndex ? '✓' : String(i + 1)}
                      </Text>
                    </View>
                    <Text style={[
                      styles.progressLabel,
                      i === stepIndex ? styles.progressLabelActive :
                      i < stepIndex ? styles.progressLabelDone :
                      styles.progressLabelFuture,
                    ]}>
                      {label}
                    </Text>
                  </View>
                  {i < PROGRESS_STEPS.length - 1 && (
                    <View style={[
                      styles.progressLine,
                      i < stepIndex ? styles.progressLineDone : styles.progressLineFuture,
                    ]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {/* [3] Primary Action ── 今やること */}
        {uiState === 'waiting_my_ship' && (
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>発送を通知する</Text>
            <Text style={styles.noticeText}>
              追跡番号は必須です。発送後に登録してください。
            </Text>

            <Text style={styles.inputLabel}>追跡番号</Text>
            <TextInput
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              placeholder="追跡番号を入力"
              placeholderTextColor="#9A94AA"
              style={styles.input}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>配送会社（任意）</Text>
            <TextInput
              value={carrier}
              onChangeText={setCarrier}
              placeholder="ヤマト / 日本郵便 など"
              placeholderTextColor="#9A94AA"
              style={styles.input}
            />

            <Pressable
              style={[styles.primaryButton, submittingShipment && styles.disabledButton]}
              onPress={handleSubmitShipment}
              disabled={submittingShipment}
            >
              <Text style={styles.primaryButtonText}>
                {submittingShipment ? '送信中...' : '発送を通知する'}
              </Text>
            </Pressable>

            {canCancelTrade && (
              <Pressable
                style={styles.cancelLink}
                onPress={handleCancelTrade}
                disabled={cancellingTrade}
              >
                <Text style={styles.cancelLinkText}>
                  {cancellingTrade ? '処理中...' : '取引をキャンセルする'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {uiState === 'waiting_my_receipt' && (
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>受け取りを確認する</Text>
            <Text style={styles.noticeText}>
              相手の荷物を受け取ったあとに押してください。
            </Text>
            <Pressable
              style={[styles.primaryButton, confirmingReceipt && styles.disabledButton]}
              onPress={handleConfirmReceipt}
              disabled={confirmingReceipt}
            >
              <Text style={styles.primaryButtonText}>
                {confirmingReceipt ? '確認中...' : '受け取りを確認する'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* [4] Trade Summary ── 何を交換しているか */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>交換内容</Text>

          <Text style={styles.sectionSubTitle}>あなたが出すカード</Text>
          {myCards.length > 0 ? (
            myCards.map((item) => (
              <CardItemRow key={item.offerItemId} item={item} roleLabel="あなた" />
            ))
          ) : (
            <Text style={styles.emptyInlineText}>あなた側のカードが見つかりません。</Text>
          )}

          <View style={styles.divider} />

          <Text style={styles.sectionSubTitle}>相手が出すカード</Text>
          {counterpartCards.length > 0 ? (
            counterpartCards.map((item) => (
              <CardItemRow key={item.offerItemId} item={item} roleLabel="相手" />
            ))
          ) : (
            <Text style={styles.emptyInlineText}>相手側のカードが見つかりません。</Text>
          )}
        </View>

        {/* [5] 相手の配送先 ── 発送に必要な情報 */}
        {hasAddress && uiState !== 'completed' && uiState !== 'cancelled' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>相手の配送先</Text>
            <Text style={styles.addressNote}>
              発送時に使用してください。取引成立後に開示された住所です。
            </Text>
            {counterpartProfile.shipping_name != null && (
              <View style={styles.addressRow}>
                <Text style={styles.addressLabel}>氏名</Text>
                <Text style={styles.addressValue}>{counterpartProfile.shipping_name}</Text>
              </View>
            )}
            {counterpartProfile.postal_code != null && (
              <View style={styles.addressRow}>
                <Text style={styles.addressLabel}>郵便番号</Text>
                <Text style={styles.addressValue}>{counterpartProfile.postal_code}</Text>
              </View>
            )}
            {counterpartProfile.address_line1 != null && (
              <View style={styles.addressRow}>
                <Text style={styles.addressLabel}>住所</Text>
                <Text style={styles.addressValue}>{counterpartProfile.address_line1}</Text>
              </View>
            )}
            {counterpartProfile.address_line2 != null && (
              <View style={styles.addressRow}>
                <Text style={styles.addressLabel}>建物名</Text>
                <Text style={styles.addressValue}>{counterpartProfile.address_line2}</Text>
              </View>
            )}
          </View>
        )}

        {/* [6] 発送状況 ── 追跡情報 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>発送状況</Text>
          <ShipmentBox title="あなたの発送" shipment={myShipment} />
          <View style={styles.divider} />
          <ShipmentBox title="相手の発送" shipment={counterpartShipment} />
        </View>

        {/* [7] Note ── 状態に応じた1〜2行の補足 */}
        <View style={[
          styles.noteCard,
          uiState === 'completed' ? styles.noteCardCompleted :
          uiState === 'cancelled' || uiState === 'disputed' ? styles.noteCardWarning :
          undefined,
        ]}>
          <Text style={[
            styles.noteText,
            uiState === 'completed' ? styles.noteTextCompleted :
            uiState === 'cancelled' || uiState === 'disputed' ? styles.noteTextWarning :
            undefined,
          ]}>
            {uiConfig.note}
          </Text>
        </View>

        {/* キャンセル（waiting_my_ship 以外で表示可能なケース） */}
        {canCancelTrade && uiState !== 'waiting_my_ship' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>発送前キャンセル</Text>
            <Text style={styles.noticeText}>
              双方とも未発送の間だけキャンセルできます。
            </Text>
            <Pressable
              style={[styles.dangerButton, cancellingTrade && styles.disabledButton]}
              onPress={handleCancelTrade}
              disabled={cancellingTrade}
            >
              <Text style={styles.dangerButtonText}>
                {cancellingTrade ? '処理中...' : '取引をキャンセルする'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* 問題報告 */}
        {canOpenDispute && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>問題報告</Text>
            <Text style={styles.noticeText}>
              例: 相手が発送しない / 追跡番号が無効 / 中身が違う / 状態が違う
            </Text>

            <Text style={styles.inputLabel}>問題区分</Text>
            <TextInput
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder="相手が発送しない / 追跡番号が無効 など"
              placeholderTextColor="#9A94AA"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>詳細（任意）</Text>
            <TextInput
              value={disputeDetail}
              onChangeText={setDisputeDetail}
              placeholder="状況を具体的に入力"
              placeholderTextColor="#9A94AA"
              style={[styles.input, styles.multilineInput]}
              multiline
              textAlignVertical="top"
            />

            <Pressable
              style={[styles.secondaryDangerButton, openingDispute && styles.disabledButton]}
              onPress={handleOpenDispute}
              disabled={openingDispute}
            >
              <Text style={styles.secondaryDangerButtonText}>
                {openingDispute ? '送信中...' : '問題を報告する'}
              </Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7FB',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 12,
  },

  // ── Loading / Error ──────────────────────
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  centerText: {
    marginTop: 12,
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: '#71717A',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 18,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 20,
    backgroundColor: '#6D5EF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── [1] Header ───────────────────────────
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ECE8FA',
    gap: 8,
  },
  headerCardCompleted: {
    backgroundColor: '#ECFDF3',
    borderColor: '#A7F3D0',
  },
  headerCardCancelled: {
    backgroundColor: '#F4F4F5',
    borderColor: '#D4D4D8',
  },
  headerCardDisputed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  headerBackButton: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  headerBackButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D5EF5',
  },
  uiStateHeadline: {
    fontSize: 24,
    fontWeight: '800',
    color: '#18181B',
    letterSpacing: -0.3,
  },
  headlineMyTurn: {
    color: '#4F35C2',
  },
  headlineCompleted: {
    color: '#047857',
  },
  headlineCancelled: {
    color: '#52525B',
  },
  headlineDisputed: {
    color: '#B91C1C',
  },
  counterpartLabel: {
    fontSize: 14,
    color: '#71717A',
  },
  deadlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B25A00',
  },
  deadlineTextExpired: {
    color: '#B91C1C',
  },

  // ── [2] Progress ─────────────────────────
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ECE8FA',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressStep: {
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotDone: {
    backgroundColor: '#059669',
  },
  progressDotActive: {
    backgroundColor: '#6D5EF5',
  },
  progressDotFuture: {
    backgroundColor: '#F4F4F5',
    borderWidth: 1.5,
    borderColor: '#D4D4D8',
  },
  progressDotText: {
    fontSize: 11,
    fontWeight: '800',
  },
  progressDotTextDone: {
    color: '#FFFFFF',
  },
  progressDotTextActive: {
    color: '#FFFFFF',
  },
  progressDotTextFuture: {
    color: '#A1A1AA',
  },
  progressLine: {
    flex: 1,
    height: 2,
    marginBottom: 18,
  },
  progressLineDone: {
    backgroundColor: '#059669',
  },
  progressLineFuture: {
    backgroundColor: '#E4E4E7',
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  progressLabelActive: {
    color: '#6D5EF5',
  },
  progressLabelDone: {
    color: '#059669',
  },
  progressLabelFuture: {
    color: '#A1A1AA',
  },

  // ── [3] Action ───────────────────────────
  actionCard: {
    backgroundColor: colors.tagAccentBg,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: colors.tagAccentBorder,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.tagAccentText,
    marginBottom: 6,
  },
  cancelLink: {
    marginTop: 12,
    alignItems: 'center',
  },
  cancelLinkText: {
    fontSize: 13,
    color: '#B91C1C',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // ── [4,5,6] Section Cards ────────────────
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE8FA',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#18181B',
    marginBottom: 14,
  },
  sectionSubTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B556D',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#ECE8FA',
    marginVertical: 14,
  },
  emptyInlineText: {
    fontSize: 13,
    color: '#71717A',
  },

  // ── Card rows ────────────────────────────
  cardItemRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F8F7FC',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
  },
  cardImage: {
    width: 74,
    height: 74,
    borderRadius: 14,
    backgroundColor: '#E9E5F8',
  },
  cardImageFallback: {
    width: 74,
    height: 74,
    borderRadius: 14,
    backgroundColor: '#E9E5F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageFallbackText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6D5EF5',
  },
  cardMeta: {
    flex: 1,
  },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECE8FA',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B4BC4',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#18181B',
    marginBottom: 6,
  },
  cardMetaText: {
    fontSize: 13,
    color: '#5B556D',
    marginBottom: 3,
  },

  // ── Address ──────────────────────────────
  addressNote: {
    fontSize: 13,
    color: '#71717A',
    lineHeight: 19,
    marginBottom: 12,
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  addressLabel: {
    fontSize: 13,
    color: '#8A8499',
    width: 68,
    flexShrink: 0,
  },
  addressValue: {
    flex: 1,
    fontSize: 13,
    color: '#18181B',
    fontWeight: '600',
  },

  // ── Shipment ─────────────────────────────
  shipmentBox: {
    backgroundColor: '#F8F7FC',
    borderRadius: 16,
    padding: 14,
  },
  shipmentText: {
    fontSize: 13,
    color: '#5B556D',
    marginBottom: 6,
  },

  // ── [7] Note ─────────────────────────────
  noteCard: {
    backgroundColor: '#F4F1FF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5DEFF',
  },
  noteCardCompleted: {
    backgroundColor: '#ECFDF3',
    borderColor: '#A7F3D0',
  },
  noteCardWarning: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  noteText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#4B5563',
  },
  noteTextCompleted: {
    color: '#065F46',
  },
  noteTextWarning: {
    color: '#7F1D1D',
  },

  // ── Inputs / Buttons ─────────────────────
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3F3F46',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#18181B',
    marginBottom: 14,
  },
  multilineInput: {
    minHeight: 104,
    height: 104,
    paddingTop: 14,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#71717A',
    marginBottom: 14,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#6D5EF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dangerButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryDangerButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryDangerButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#BE123C',
  },
  disabledButton: {
    opacity: 0.6,
  },
})
