// app/venue/trade/[id].tsx
// PR5 / venue_trade 専用 DM 画面 (P0 最小)。
//
// 詳細仕様: docs/venue_mode_requirements.md §8
// DB:       docs/migration_venue_trade_dm_tables.sql
//           docs/migration_rpc_venue_trade_dm.sql
//           docs/migration_trigger_venue_trade_system_message.sql
//
// P0 で実装する範囲:
//   - venue_trade 詳細取得 (status / snapshot / 相手 id)
//   - 相手 profile 表示 (tombstone なら「削除済みユーザー」)
//   - snapshot 表示 (proposer/receiver card + wanted_snapshot.image_url)
//   - メッセージ一覧 (created_at ASC、kind='system' は中央表示、user は左右に分岐)
//   - 入力欄 (multiline 1-3 行、空送信不可)
//   - 送信窓 P0 allowlist: pending / partially_confirmed のみ入力欄表示
//   - completed / cancelled は read-only バナー
//   - 既読化: mount / useFocusEffect / 送信成功後の 3 タイミング
//   - 既読化後に refreshBadge() で会場タブのグローバル未読バッジを更新
//
// P0 でやらない:
//   - Realtime / push / 画像 DM / 定型文チップ / 通常 trade DM 刷新
//   - completed + 48h 送信猶予 (P0.5/P1)

import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import {
  confirmVenueTradeCancel,
  fetchProfile,
  fetchVenueTradeById,
  fetchVenueTradeMessages,
  markVenueTradeThreadRead,
  requestVenueTradeCancel,
  respondVenueTradeCancel,
  sendVenueTradeMessage,
  withdrawVenueTradeCancel,
} from '@/lib/supabase'
import {
  Profile,
  VenueTrade,
  VenueTradeMessage,
  VenueTradeStatus,
} from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { useBadge } from '@/providers/BadgeProvider'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

const STATUS_LABELS: Record<VenueTradeStatus, string> = {
  pending: '進行中',
  partially_confirmed: '片側確認済み',
  completed: '取引完了',
  cancelled: 'キャンセル済み',
}

const STATUS_COLORS: Record<VenueTradeStatus, string> = {
  pending: '#D97706',
  partially_confirmed: '#0EA5E9',
  completed: '#059669',
  cancelled: '#6B7280',
}

// 送信窓 P0 allowlist: pending / partially_confirmed のみ送信可。
// completed / cancelled は read-only。RPC 側でも弾くが UI でも入力欄を隠す。
function canSendInWindow(status: VenueTradeStatus): boolean {
  return status === 'pending' || status === 'partially_confirmed'
}

// send RPC が raise exception で返す文字列を日本語化。
function sendErrorMessage(rawMessage: string): { title: string; body: string } {
  if (rawMessage.startsWith('SEND_WINDOW_CLOSED')) {
    return {
      title: '送信できません',
      body: 'この取引は完了済みのため、メッセージの送信窓は閉じています。',
    }
  }
  if (rawMessage.startsWith('TRADE_CANCELLED')) {
    return {
      title: '送信できません',
      body: 'この取引はキャンセル済みのため、メッセージは送信できません。',
    }
  }
  if (rawMessage.startsWith('NOT_PARTICIPANT')) {
    return {
      title: '権限がありません',
      body: 'この取引の当事者ではないためメッセージを送信できません。',
    }
  }
  if (rawMessage.startsWith('BODY_EMPTY')) {
    return {
      title: '本文が空です',
      body: 'メッセージを入力してください。',
    }
  }
  if (rawMessage.startsWith('BODY_TOO_LONG')) {
    return {
      title: '文字数が多すぎます',
      body: '2000 文字以内で入力してください。',
    }
  }
  if (rawMessage.startsWith('TRADE_NOT_FOUND')) {
    return {
      title: '取引が見つかりません',
      body: '画面を更新してください。',
    }
  }
  if (rawMessage.startsWith('AUTH_REQUIRED')) {
    return {
      title: '認証エラー',
      body: 'もう一度ログインしてください。',
    }
  }
  return { title: 'エラー', body: 'メッセージの送信に失敗しました。' }
}

function counterpartLabel(profile: Profile | null): string {
  if (profile == null) return '削除済みユーザー'
  if (profile.display_name != null && profile.display_name !== '') {
    return profile.display_name
  }
  if (profile.handle != null && profile.handle !== '') {
    return `@${profile.handle}`
  }
  return 'ユーザー'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function snapshotText(
  snapshot: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  if (snapshot == null) return null
  const v = snapshot[key]
  if (typeof v === 'string' && v.length > 0) return v
  return null
}

function snapshotImageUrl(
  snapshot: Record<string, unknown> | null | undefined
): string | null {
  return snapshotText(snapshot, 'image_url')
}

export default function VenueTradeDMScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const tradeId = typeof id === 'string' ? id : null

  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null
  const { refreshBadge } = useBadge()
  // SafeAreaView は edges={['top']} のみで bottom 側は非適用 → 入力欄/read-only バナー側で
  // 個別に bottom inset を反映する。ホームインジケーター被りと「下に張り付きすぎる」見た目
  // を同時に回避する目的。
  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, 12)

  const [trade, setTrade] = useState<VenueTrade | null>(null)
  const [counterpart, setCounterpart] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<VenueTradeMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // PR-5: キャンセル申請モデル (request/withdraw/respond/confirm) 中の loading 抑止。
  // 1 つの flag で 4 RPC を共有 (CTA はいずれか 1 つしか同時表示されないため衝突しない)。
  const [cancelLoading, setCancelLoading] = useState(false)

  const scrollRef = useRef<ScrollView | null>(null)
  // mark read 多重実行抑止 (mount + focus の二重起動などを吸収)
  const markingRef = useRef(false)

  // 既読化 + グローバルバッジ更新。失敗時は warn のみ。
  const markRead = useCallback(async () => {
    if (tradeId == null) return
    if (markingRef.current) return
    markingRef.current = true
    try {
      await markVenueTradeThreadRead(tradeId)
      await refreshBadge()
    } catch (error) {
      console.warn('[VenueTradeDM] markVenueTradeThreadRead', error)
    } finally {
      markingRef.current = false
    }
  }, [tradeId, refreshBadge])

  const reload = useCallback(async () => {
    if (tradeId == null || userId == null) {
      setLoading(false)
      return
    }
    setLoading(true)

    try {
      const fetched = await fetchVenueTradeById(tradeId)
      setTrade(fetched)

      if (fetched == null) {
        setCounterpart(null)
        setMessages([])
        return
      }

      const counterpartId =
        fetched.proposer_id === userId
          ? fetched.receiver_id
          : fetched.proposer_id

      const [profile, msgs] = await Promise.all([
        fetchProfile(counterpartId),
        fetchVenueTradeMessages(tradeId),
      ])
      setCounterpart(profile)
      setMessages(msgs)
    } catch (error) {
      console.error('[VenueTradeDM] reload', error)
      Alert.alert(
        '読み込みエラー',
        'メッセージの取得に失敗しました。画面を戻ってもう一度開いてください。'
      )
    } finally {
      setLoading(false)
    }
  }, [tradeId, userId])

  // 初回 mount での読込 + 既読化
  useEffect(() => {
    reload().then(() => {
      markRead()
    })
  }, [reload, markRead])

  // フォアグラウンド復帰 / 戻り時の再読込 + 既読化
  useFocusEffect(
    useCallback(() => {
      reload().then(() => {
        markRead()
      })
    }, [reload, markRead])
  )

  // メッセージ更新時に最下部にスクロール
  useEffect(() => {
    if (messages.length === 0) return
    // 描画後にスクロールするため次フレームに送る
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false })
    }, 50)
    return () => clearTimeout(t)
  }, [messages])

  const handleSend = useCallback(async () => {
    if (tradeId == null || trade == null) return
    if (!canSendInWindow(trade.status)) return
    const body = draft.trim()
    if (body.length === 0) return

    setSending(true)
    try {
      const newMsg = await sendVenueTradeMessage(tradeId, body)
      setMessages((prev) => [...prev, newMsg])
      setDraft('')
      // 送信成功後の既読化 (自分の送信で last_read_at を進めておく)
      await markRead()
    } catch (error) {
      console.error('[VenueTradeDM] handleSend', error)
      const rawMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'object' &&
            error != null &&
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : ''
      const { title, body: alertBody } = sendErrorMessage(rawMessage)
      Alert.alert(title, alertBody)
    } finally {
      setSending(false)
    }
  }, [tradeId, trade, draft, markRead])

  if (tradeId == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="メッセージ" />
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>取引 ID が指定されていません</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="メッセージ" />
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (trade == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="メッセージ" />
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>取引が見つかりません</Text>
          <Text style={styles.errorSubText}>
            既に削除されているか、あなたが当事者ではない可能性があります。
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  const offeredImage = snapshotImageUrl(trade.offered_snapshot)
  const wantedImage = snapshotImageUrl(trade.wanted_snapshot)
  const sendWindowOpen = canSendInWindow(trade.status)
  const isMine = (m: VenueTradeMessage) =>
    m.kind === 'user' && m.sender_id != null && m.sender_id === userId

  // PR-5: キャンセル申請モデルの UI 状態ヘルパー。
  //   isCancelRequested: 申請中フラグ (cancel_requested_at が NOT NULL)
  //   isMyRequest: 自分が申請者
  //   canRequestCancel: 申請可 (pending + 未申請)
  //   canWithdraw: 取り下げ可 (自分の申請を取り消し)
  //   canRespond: 相手の申請に応答可 (承認 / 拒否)
  //   isCancelExpired: 申請から 2h 経過 → 申請者は確定可
  //   partially_confirmed / completed / cancelled では CTA を一切出さない (status='pending' のみ表示)
  const isCancelRequested = trade.cancel_requested_at != null
  const isMyRequest =
    isCancelRequested && trade.cancel_requested_by === userId
  const cancelExpiredAt =
    trade.cancel_requested_at != null
      ? new Date(
          new Date(trade.cancel_requested_at).getTime() + 2 * 60 * 60 * 1000,
        )
      : null
  const isCancelExpired =
    cancelExpiredAt != null ? new Date() > cancelExpiredAt : false
  const canRequestCancel =
    trade.status === 'pending' && !isCancelRequested
  const canWithdraw =
    trade.status === 'pending' && isCancelRequested && isMyRequest
  const canRespond =
    trade.status === 'pending' && isCancelRequested && !isMyRequest
  const canConfirmCancel =
    trade.status === 'pending' &&
    isCancelRequested &&
    isMyRequest &&
    isCancelExpired

  // PR-5: 4 RPC のハンドラ。共通エラー UI と reload で trade を最新化。
  const handleCancelRpc = async (
    rpc: () => Promise<VenueTrade>,
    label: string,
  ) => {
    if (cancelLoading) return
    setCancelLoading(true)
    try {
      await rpc()
      await reload()
    } catch (error) {
      console.error(`[VenueTradeDM] ${label}`, error)
      const msg = error instanceof Error ? error.message : '操作に失敗しました'
      Alert.alert('エラー', msg)
    } finally {
      setCancelLoading(false)
    }
  }
  const handleRequestCancel = () => {
    if (tradeId == null || userId == null) return
    Alert.alert(
      'キャンセルを申請しますか？',
      '相手の応答を待ち、承認されると取引はキャンセルされます。2 時間経過すると自分で確定できます。',
      [
        { text: 'やめる', style: 'cancel' },
        {
          text: '申請する',
          style: 'destructive',
          onPress: () =>
            handleCancelRpc(
              () => requestVenueTradeCancel(tradeId, userId),
              'requestVenueTradeCancel',
            ),
        },
      ],
    )
  }
  const handleWithdrawCancel = () => {
    if (tradeId == null || userId == null) return
    handleCancelRpc(
      () => withdrawVenueTradeCancel(tradeId, userId),
      'withdrawVenueTradeCancel',
    )
  }
  const handleRespondCancel = (accept: boolean) => {
    if (tradeId == null || userId == null) return
    handleCancelRpc(
      () => respondVenueTradeCancel(tradeId, userId, accept),
      `respondVenueTradeCancel(${accept ? 'accept' : 'decline'})`,
    )
  }
  const handleConfirmCancel = () => {
    if (tradeId == null || userId == null) return
    Alert.alert(
      'キャンセルを確定しますか？',
      '相手が 2 時間応答しなかったため、申請者の判断で取引をキャンセルできます。',
      [
        { text: 'やめる', style: 'cancel' },
        {
          text: '確定する',
          style: 'destructive',
          onPress: () =>
            handleCancelRpc(
              () => confirmVenueTradeCancel(tradeId, userId),
              'confirmVenueTradeCancel',
            ),
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={counterpartLabel(counterpart)} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* 状態バナー */}
        <View
          style={[
            styles.statusBanner,
            { backgroundColor: STATUS_COLORS[trade.status] + '18' },
          ]}
        >
          <Text
            style={[styles.statusText, { color: STATUS_COLORS[trade.status] }]}
          >
            {STATUS_LABELS[trade.status]}
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            // 最後のメッセージが入力欄/バナーに隠れないように。入力欄高 ≒ 56、bannerPaddingY ≒ 28
            // の差分を吸収しつつ、ある程度の余裕を持たせる。
            { paddingBottom: spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* snapshot カード */}
          <View style={styles.snapshotCard}>
            <View style={styles.snapshotRow}>
              <View style={styles.snapshotCol}>
                <Text style={styles.snapshotLabel}>あなたへ</Text>
                {wantedImage != null && (
                  <Image
                    source={{ uri: wantedImage }}
                    style={styles.snapshotImage}
                    resizeMode="cover"
                  />
                )}
                <Text style={styles.snapshotCard_name}>
                  {trade.receiver_id === userId
                    ? trade.receiver_card
                    : trade.proposer_card}
                </Text>
                {(() => {
                  const wantSnapKey =
                    trade.receiver_id === userId
                      ? 'wanted_snapshot'
                      : 'offered_snapshot'
                  const snap =
                    wantSnapKey === 'wanted_snapshot'
                      ? trade.wanted_snapshot
                      : trade.offered_snapshot
                  const groupName = snapshotText(snap, 'group_name')
                  return groupName != null ? (
                    <Text style={styles.snapshotSub}>{groupName}</Text>
                  ) : null
                })()}
              </View>
              <Text style={styles.arrowText}>⇄</Text>
              <View style={styles.snapshotCol}>
                <Text style={styles.snapshotLabel}>相手へ</Text>
                {offeredImage != null && (
                  <Image
                    source={{ uri: offeredImage }}
                    style={styles.snapshotImage}
                    resizeMode="cover"
                  />
                )}
                <Text style={styles.snapshotCard_name}>
                  {trade.receiver_id === userId
                    ? trade.proposer_card
                    : trade.receiver_card}
                </Text>
              </View>
            </View>
          </View>

          {/* メッセージ一覧 */}
          {messages.length === 0 ? (
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyMessagesText}>
                まだメッセージはありません。{'\n'}
                合流場所や目印を送りあって会いましょう。
              </Text>
            </View>
          ) : (
            <View style={styles.messagesList}>
              {messages.map((m) => {
                if (m.kind === 'system') {
                  return (
                    <View key={m.id} style={styles.systemRow}>
                      <Text style={styles.systemText}>{m.body}</Text>
                      <Text style={styles.systemTime}>
                        {formatTime(m.created_at)}
                      </Text>
                    </View>
                  )
                }
                const mine = isMine(m)
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.bubbleRow,
                      mine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
                    ]}
                  >
                    <View
                      style={[
                        styles.bubble,
                        mine ? styles.bubbleMine : styles.bubbleTheirs,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bubbleText,
                          mine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
                        ]}
                      >
                        {m.body}
                      </Text>
                    </View>
                    <Text style={styles.bubbleTime}>
                      {formatTime(m.created_at)}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>

        {/* PR-5: キャンセル CTA (status='pending' のみ表示、優先順 1〜4)。
            partially_confirmed では何も表示しない (送信欄のみ)。 */}
        {trade.status === 'pending' && (
          canConfirmCancel ? (
            <View style={styles.cancelCtaBox}>
              <Text style={styles.cancelCtaHint}>
                相手が 2 時間応答しませんでした。
              </Text>
              <Pressable
                onPress={handleConfirmCancel}
                disabled={cancelLoading}
                style={({ pressed }) => [
                  styles.cancelConfirmButton,
                  cancelLoading && styles.cancelButtonDisabled,
                  pressed && styles.cancelButtonPressed,
                ]}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.cancelConfirmText}>
                    キャンセルを確定する
                  </Text>
                )}
              </Pressable>
            </View>
          ) : canWithdraw ? (
            <View style={styles.cancelCtaBox}>
              <Text style={styles.cancelCtaHint}>
                キャンセルを申請中です。相手の応答を待っています。
              </Text>
              <Pressable
                onPress={handleWithdrawCancel}
                disabled={cancelLoading}
                style={({ pressed }) => [
                  styles.cancelOutlineButton,
                  cancelLoading && styles.cancelButtonDisabled,
                  pressed && styles.cancelButtonPressed,
                ]}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color="#9CA0AD" />
                ) : (
                  <Text style={styles.cancelOutlineText}>
                    申請を取り下げる
                  </Text>
                )}
              </Pressable>
            </View>
          ) : canRespond ? (
            <View style={styles.cancelCtaBox}>
              <Text style={styles.cancelCtaHint}>
                相手からキャンセル申請が届きました。
              </Text>
              <View style={styles.cancelRespondRow}>
                <Pressable
                  onPress={() => handleRespondCancel(false)}
                  disabled={cancelLoading}
                  style={({ pressed }) => [
                    styles.cancelOutlineButton,
                    styles.cancelRespondHalf,
                    cancelLoading && styles.cancelButtonDisabled,
                    pressed && styles.cancelButtonPressed,
                  ]}
                >
                  <Text style={styles.cancelOutlineText}>拒否する</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleRespondCancel(true)}
                  disabled={cancelLoading}
                  style={({ pressed }) => [
                    styles.cancelConfirmButton,
                    styles.cancelRespondHalf,
                    cancelLoading && styles.cancelButtonDisabled,
                    pressed && styles.cancelButtonPressed,
                  ]}
                >
                  {cancelLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.cancelConfirmText}>
                      キャンセルを承認する
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : canRequestCancel ? (
            <View style={styles.cancelCtaBox}>
              <Pressable
                onPress={handleRequestCancel}
                disabled={cancelLoading}
                style={({ pressed }) => [
                  styles.cancelOutlineButton,
                  cancelLoading && styles.cancelButtonDisabled,
                  pressed && styles.cancelButtonPressed,
                ]}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color="#9CA0AD" />
                ) : (
                  <Text style={styles.cancelOutlineText}>
                    キャンセルを申請する
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null
        )}

        {/* 入力欄 / read-only バナー */}
        {sendWindowOpen ? (
          <View style={[styles.inputBar, { paddingBottom: bottomPad }]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="メッセージを入力"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={2}
              maxLength={2000}
              editable={!sending}
            />
            <Pressable
              onPress={handleSend}
              disabled={sending || draft.trim().length === 0}
              style={({ pressed }) => [
                styles.sendButton,
                (sending || draft.trim().length === 0) &&
                  styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sendButtonText}>送信</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View
            style={[styles.readOnlyBanner, { paddingBottom: bottomPad }]}
          >
            <Text style={styles.readOnlyText}>
              {trade.status === 'completed'
                ? 'この取引は完了済みです。メッセージは閲覧のみ可能です。'
                : 'この取引はキャンセル済みです。メッセージは閲覧のみ可能です。'}
            </Text>
            {/* 申告導線 (常設): 完了/キャンセル取引で問題があれば運営に申告できる
                (任意・非公開・収集のみ)。DB は completed 7日 / cancelled 14日 で受付。 */}
            {(trade.status === 'completed' || trade.status === 'cancelled') && (
              <Pressable
                style={styles.reportLink}
                onPress={() =>
                  router.push({
                    pathname: '/trade/report',
                    params: { venueTradeId: trade.id },
                  } as never)
                }
              >
                <Text style={styles.reportLinkText}>取引に問題を報告する</Text>
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  errorSubText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  statusBanner: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  statusText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },

  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  snapshotCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  snapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  snapshotCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  snapshotLabel: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
  snapshotImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    marginVertical: 4,
  },
  snapshotCard_name: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  snapshotSub: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  arrowText: { fontSize: 20, color: colors.textTertiary },

  emptyMessages: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyMessagesText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  messagesList: { gap: spacing.sm },

  systemRow: {
    alignItems: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  systemText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  systemTime: {
    fontSize: 10,
    color: colors.textTertiary,
  },

  bubbleRow: { gap: 2 },
  bubbleRowMine: { alignItems: 'flex-end' },
  bubbleRowTheirs: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.backgroundMuted,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: fontSize.base, lineHeight: 20 },
  bubbleTextMine: { color: colors.textInverse },
  bubbleTextTheirs: { color: colors.textPrimary },
  bubbleTime: {
    fontSize: 10,
    color: colors.textTertiary,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  // PR-5: キャンセル CTA セクション。入力欄 (またはバナー) の上に挿入。
  cancelCtaBox: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: 0,
    gap: spacing.xs,
    backgroundColor: colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelCtaHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  cancelOutlineButton: {
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#9CA0AD',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelOutlineText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: '#9CA0AD',
  },
  cancelConfirmButton: {
    height: 40,
    borderRadius: radius.md,
    backgroundColor: '#FF3E6C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelConfirmText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  cancelRespondRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelRespondHalf: {
    flex: 1,
  },
  cancelButtonDisabled: {
    opacity: 0.5,
  },
  cancelButtonPressed: {
    opacity: 0.8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.lg,
  },
  sendButton: {
    minWidth: 60,
    height: 40,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonPressed: { opacity: 0.7 },
  sendButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },

  readOnlyBanner: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.backgroundMuted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  readOnlyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // 申告導線 (常設・控えめ)。
  reportLink: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  reportLinkText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
    textDecorationLine: 'underline',
  },
})
