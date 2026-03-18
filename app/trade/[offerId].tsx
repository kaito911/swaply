// app/trade/[offerId].tsx
import {
    cancelTrade,
    confirmTradeReceipt,
    fetchTradeDetailByOffer,
    openTradeDispute,
    submitTradeShipment,
} from '@/lib/supabase'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
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
  if (!deadline) return '発送期限未設定'

  const diffMs = new Date(deadline).getTime() - Date.now()

  if (Number.isNaN(diffMs)) return '発送期限未設定'
  if (diffMs <= 0) return '発送期限を過ぎています'

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  if (days > 0) {
    return `発送期限まで ${days}日 ${hours}時間`
  }

  return `発送期限まで ${hours}時間`
}

function getTradeStatusLabel(status?: TradeStatus): string {
  switch (status) {
    case 'pending':
      return '発送待ち'
    case 'in_transit':
      return '配送中'
    case 'partially_received':
      return '片側受取済み'
    case 'completed':
      return '取引完了'
    case 'cancelled':
      return 'キャンセル'
    case 'disputed':
      return '問題対応中'
    default:
      return '状態不明'
  }
}

function getTradeStatusTone(status?: TradeStatus) {
  switch (status) {
    case 'pending':
      return {
        bg: styles.statusPendingBg,
        text: styles.statusPendingText,
      }
    case 'in_transit':
      return {
        bg: styles.statusTransitBg,
        text: styles.statusTransitText,
      }
    case 'partially_received':
      return {
        bg: styles.statusPartialBg,
        text: styles.statusPartialText,
      }
    case 'completed':
      return {
        bg: styles.statusCompletedBg,
        text: styles.statusCompletedText,
      }
    case 'cancelled':
      return {
        bg: styles.statusCancelledBg,
        text: styles.statusCancelledText,
      }
    case 'disputed':
      return {
        bg: styles.statusDisputedBg,
        text: styles.statusDisputedText,
      }
    default:
      return {
        bg: styles.statusCancelledBg,
        text: styles.statusCancelledText,
      }
  }
}

function getShipmentLabel(status?: ShipmentStatus): string {
  switch (status) {
    case 'pending':
      return '未発送'
    case 'shipped':
      return '発送済み'
    case 'received':
      return '受取確認済み'
    case 'cancelled':
      return 'キャンセル'
    default:
      return '未設定'
  }
}

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

export default function TradeDetailScreen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>()

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

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
    } catch (error: any) {
      Alert.alert(
        '読み込みエラー',
        error?.message || '取引情報の取得に失敗しました。'
      )
    } finally {
      setLoading(false)
    }
  }, [loadTrade])

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true)
      await loadTrade()
    } catch (error: any) {
      Alert.alert(
        '更新エラー',
        error?.message || '最新状態の取得に失敗しました。'
      )
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

  useEffect(() => {
    fetchTradeDetailByOffer('__auth_check__').catch(() => undefined)
  }, [])

  const trade = detail?.trade
  const myCards = detail?.myCards ?? []
  const counterpartCards = detail?.counterpartCards ?? []
  const myShipment = detail?.myShipment ?? {}
  const counterpartShipment = detail?.counterpartShipment ?? {}
  const counterpartProfile = detail?.counterpartProfile ?? {}
  const counterpartTrust = detail?.counterpartTrust ?? {}

  useEffect(() => {
    let mounted = true

    async function loadCurrentUser() {
      const { data, error } = await import('@/lib/supabase').then(({ supabase }) =>
        supabase.auth.getUser()
      )

      if (error) return
      if (!mounted) return

      setCurrentUserId(data.user?.id ?? null)
    }

    void loadCurrentUser()

    return () => {
      mounted = false
    }
  }, [])

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

  const headerStatusTone = getTradeStatusTone(trade?.status)

  const footerMessage = useMemo(() => {
    if (!trade) return ''

    if (trade.status === 'completed') {
      return 'この取引は完了しています。双方の交換処理は終了しました。'
    }

    if (trade.status === 'cancelled') {
      return 'この取引はキャンセルされています。カード状態は復元済みの前提です。'
    }

    if (trade.status === 'disputed') {
      return 'この取引は問題対応中です。これ以上の自己判断操作は避け、状況記録を残してください。'
    }

    if (canConfirmReceipt) {
      return '相手の発送が確認できています。荷物を受け取ったあとに受取確認を行ってください。'
    }

    if (canSubmitShipment) {
      return 'あなたの発送通知がまだです。発送後に追跡番号を入力してください。'
    }

    if (myShipmentStatus === 'shipped' && counterpartShipmentStatus !== 'shipped') {
      return 'あなたは発送済みです。相手の発送または運営判断を待ってください。'
    }

    if (myShipmentStatus === 'received') {
      return 'あなたの受取確認は完了しています。相手側の確認待ちです。'
    }

    return '取引状況を確認してください。'
  }, [trade, canConfirmReceipt, canSubmitShipment, myShipmentStatus, counterpartShipmentStatus])

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
    } catch (error: any) {
      Alert.alert(
        '発送通知エラー',
        error?.message || '発送通知に失敗しました。'
      )
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
            } catch (error: any) {
              Alert.alert(
                '受取確認エラー',
                error?.message || '受取確認に失敗しました。'
              )
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
            } catch (error: any) {
              Alert.alert(
                'キャンセルエラー',
                error?.message || '取引のキャンセルに失敗しました。'
              )
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
    } catch (error: any) {
      Alert.alert(
        '問題報告エラー',
        error?.message || '問題報告に失敗しました。'
      )
    } finally {
      setOpeningDispute(false)
    }
  }, [currentUserId, disputeDetail, disputeReason, loadTrade, trade?.id])

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#6D5EF5" />
          <Text style={styles.centerText}>取引情報を読み込み中です</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!detail || !trade) {
    return (
      <SafeAreaView style={styles.safeArea}>
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.pageTitle}>取引進行</Text>
              <Text style={styles.pageSubtitle}>
                発送・受取確認・問題報告をこの画面で進めます
              </Text>
            </View>

            <Pressable style={styles.headerBackButton} onPress={() => router.back()}>
              <Text style={styles.headerBackButtonText}>戻る</Text>
            </Pressable>
          </View>

          <View style={[styles.statusChip, headerStatusTone.bg]}>
            <Text style={[styles.statusChipText, headerStatusTone.text]}>
              {getTradeStatusLabel(trade.status)}
            </Text>
          </View>

          <Text
            style={[
              styles.deadlineText,
              trade.status === 'pending' &&
              trade.ship_deadline_at &&
              new Date(trade.ship_deadline_at).getTime() < Date.now()
                ? styles.deadlineExpiredText
                : undefined,
            ]}
          >
            {formatHoursLeft(trade.ship_deadline_at)}
          </Text>
          <Text style={styles.metaText}>発送期限: {formatDateTime(trade.ship_deadline_at)}</Text>
          <Text style={styles.metaText}>offerId: {offerId}</Text>
          <Text style={styles.metaText}>tradeId: {trade.id}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>相手情報</Text>
          <Text style={styles.partnerName}>{getDisplayName(counterpartProfile)}</Text>

          <View style={styles.trustGrid}>
            <View style={styles.trustCard}>
              <Text style={styles.trustLabel}>Badge</Text>
              <Text style={styles.trustValue}>{counterpartTrust.badge || 'None'}</Text>
            </View>

            <View style={styles.trustCard}>
              <Text style={styles.trustLabel}>成立件数</Text>
              <Text style={styles.trustValue}>
                {counterpartTrust.completed_trade_count ?? 0}
              </Text>
            </View>

            <View style={styles.trustCard}>
              <Text style={styles.trustLabel}>発送率</Text>
              <Text style={styles.trustValue}>
                {counterpartTrust.shipping_compliance_rate ?? 0}%
              </Text>
            </View>
          </View>

          <Text style={styles.trustFootText}>
            受取確認速度: {counterpartTrust.receive_confirm_median_hours ?? '-'} 時間
          </Text>
        </View>

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

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>発送状況</Text>
          <ShipmentBox title="あなたの発送状況" shipment={myShipment} />
          <View style={styles.divider} />
          <ShipmentBox title="相手の発送状況" shipment={counterpartShipment} />
        </View>

        {trade.status === 'disputed' ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>この取引は問題対応中です</Text>
            <Text style={styles.warningBody}>
              追加発送や自己判断のキャンセルは避けてください。必要情報を整理し、運営判断前提で進めます。
            </Text>
          </View>
        ) : null}

        {trade.status === 'cancelled' ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>この取引はキャンセル済みです</Text>
            <Text style={styles.warningBody}>
              これ以上の発送・受取操作はできません。カード状態復元が反映されているかを確認してください。
            </Text>
          </View>
        ) : null}

        {trade.status === 'completed' ? (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>この取引は完了しています</Text>
            <Text style={styles.successBody}>
              双方の受取確認まで完了しています。以後の操作は不要です。
            </Text>
          </View>
        ) : null}

        {canSubmitShipment ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>発送通知</Text>
            <Text style={styles.noticeText}>
              追跡番号は必須です。発送後に登録してください。誤入力は dispute の原因になります。
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
              style={[
                styles.primaryButton,
                submittingShipment ? styles.disabledButton : undefined,
              ]}
              onPress={handleSubmitShipment}
              disabled={submittingShipment}
            >
              <Text style={styles.primaryButtonText}>
                {submittingShipment ? '送信中...' : '発送を通知する'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {canConfirmReceipt ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>受取確認</Text>
            <Text style={styles.noticeText}>
              相手の荷物を受け取ったあとに押してください。誤操作は Trust と dispute 導線に影響します。
            </Text>

            <Pressable
              style={[
                styles.primaryButton,
                confirmingReceipt ? styles.disabledButton : undefined,
              ]}
              onPress={handleConfirmReceipt}
              disabled={confirmingReceipt}
            >
              <Text style={styles.primaryButtonText}>
                {confirmingReceipt ? '確認中...' : '受け取りを確認する'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {canCancelTrade ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>発送前キャンセル</Text>
            <Text style={styles.noticeText}>
              双方とも未発送の間だけキャンセルできます。発送後はキャンセルではなく問題報告で処理します。
            </Text>

            <Pressable
              style={[
                styles.dangerButton,
                cancellingTrade ? styles.disabledButton : undefined,
              ]}
              onPress={handleCancelTrade}
              disabled={cancellingTrade}
            >
              <Text style={styles.dangerButtonText}>
                {cancellingTrade ? '処理中...' : '取引をキャンセルする'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {canOpenDispute ? (
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
              style={[
                styles.secondaryDangerButton,
                openingDispute ? styles.disabledButton : undefined,
              ]}
              onPress={handleOpenDispute}
              disabled={openingDispute}
            >
              <Text style={styles.secondaryDangerButtonText}>
                {openingDispute ? '送信中...' : '問題を報告する'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>現在の案内</Text>
          <Text style={styles.footerMessage}>{footerMessage}</Text>
          <Text style={styles.footerMeta}>ログインユーザー: {currentUserId || '未取得'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

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
    gap: 16,
  },
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
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ECE8FA',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  headerLeft: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#18181B',
  },
  pageSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#71717A',
  },
  headerBackButton: {
    height: 38,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F4F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5A45D6',
  },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 10,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusPendingBg: {
    backgroundColor: '#F5F3FF',
  },
  statusPendingText: {
    color: '#6D28D9',
  },
  statusTransitBg: {
    backgroundColor: '#EEF6FF',
  },
  statusTransitText: {
    color: '#1D4ED8',
  },
  statusPartialBg: {
    backgroundColor: '#FFF7ED',
  },
  statusPartialText: {
    color: '#C2410C',
  },
  statusCompletedBg: {
    backgroundColor: '#ECFDF3',
  },
  statusCompletedText: {
    color: '#047857',
  },
  statusCancelledBg: {
    backgroundColor: '#F4F4F5',
  },
  statusCancelledText: {
    color: '#52525B',
  },
  statusDisputedBg: {
    backgroundColor: '#FEF2F2',
  },
  statusDisputedText: {
    color: '#B91C1C',
  },
  deadlineText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B25A00',
    marginBottom: 8,
  },
  deadlineExpiredText: {
    color: '#B91C1C',
  },
  metaText: {
    fontSize: 12,
    color: '#8A8499',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE8FA',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#18181B',
    marginBottom: 14,
  },
  sectionSubTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#27272A',
    marginBottom: 10,
  },
  partnerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 12,
  },
  trustGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  trustCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#F8F7FC',
    justifyContent: 'center',
  },
  trustLabel: {
    fontSize: 11,
    color: '#8A8499',
    marginBottom: 4,
  },
  trustValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#18181B',
  },
  trustFootText: {
    marginTop: 12,
    fontSize: 13,
    color: '#71717A',
  },
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
  primaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#6D5EF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
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
  noticeText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#71717A',
    marginBottom: 14,
  },
  warningCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 8,
  },
  warningBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#7F1D1D',
  },
  successCard: {
    backgroundColor: '#ECFDF3',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  successTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#047857',
    marginBottom: 8,
  },
  successBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#065F46',
  },
  footerCard: {
    backgroundColor: '#F4F1FF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5DEFF',
  },
  footerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#18181B',
    marginBottom: 8,
  },
  footerMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: '#4B5563',
    marginBottom: 8,
  },
  footerMeta: {
    fontSize: 12,
    color: '#8A8499',
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
})