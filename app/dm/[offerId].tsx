// app/dm/[offerId].tsx
// PR-DM b-1 / 通常取引 (trade_messages) 専用 DM 画面。
//
// 設計の要点 (K 確定・本番実体ベース):
//   - ルートは /dm/<offerId>。通知の飛び先 (/trade/<offer_id>) は変更しない。
//     取引画面 (b-2) の「メッセージ」ボタンから in-app 遷移で開く。
//   - offerId から trade を解決するのは取引画面と同一経路 fetchTradeDetailByOffer
//     (RPC get_trade_detail_by_offer)。新規クエリは作らない。
//     メッセージ系 RPC は trade.id (UUID) を渡す (offer_id ではない)。
//   - 見た目は通常UI (明るい基調)。会場DM(app/venue/trade/[id].tsx) からは構造のみ流用。
//   - Realtime 不使用。取得は mount(useEffect)+復帰(useFocusEffect) の全置換 + pull-to-refresh。
//   - 送信は楽観追記 → await → 置換/除去 (会場版に手本が無いため新規設計)。
//   - 禁止ワード検知は JS 側で再実装しない。サーバ (send_trade_message) が唯一の源。
//     error.message が 'MESSAGE_BLOCKED' で始まるかのみ見る (カテゴリ名は参照しない)。
//   - trade_messages/trade_reads へ直接 INSERT/UPDATE しない (SECURITY DEFINER RPC 経由のみ)。
//
// 送信可否 (サーバ実条件と一致):
//   trades.status in ('pending','in_transit','partially_received') のみ送信可。
//   completed / cancelled / disputed は read-only。

import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import {
  fetchTradeDetailByOffer,
  fetchTradeMessages,
  markTradeThreadRead,
  sendTradeMessage,
} from '@/lib/supabase'
import { TradeMessage } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { useBadge } from '@/providers/BadgeProvider'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

// 取引ステータス (app/trade/[offerId].tsx と同一の enum 文字列)。
type TradeStatus =
  | 'pending'
  | 'in_transit'
  | 'partially_received'
  | 'completed'
  | 'cancelled'
  | 'disputed'

// サーバ実条件と一致: この 3 状態のみ送信可。
function canSend(status: TradeStatus): boolean {
  return (
    status === 'pending' ||
    status === 'in_transit' ||
    status === 'partially_received'
  )
}

// 読み取り専用時のバナー文言 (K 確定)。
function readOnlyMessage(status: TradeStatus): string {
  switch (status) {
    case 'completed':
      return 'この取引は完了しています。メッセージの送信はできません。'
    case 'cancelled':
      return 'この取引はキャンセルされました。メッセージの送信はできません。'
    case 'disputed':
      return 'この取引は現在確認中のため、メッセージの送信を停止しています。'
    default:
      return 'メッセージの送信はできません。'
  }
}

type CounterpartProfile = {
  display_name?: string | null
  handle?: string | null
  avatar_url?: string | null
}

function counterpartLabel(profile: CounterpartProfile | null): string {
  if (profile == null) return 'ユーザー'
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

// エラーオブジェクトから message 文字列を頑健に取り出す (会場版と同方式)。
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (
    typeof error === 'object' &&
    error != null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return ''
}

export default function TradeDMScreen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>()
  const offerIdStr = typeof offerId === 'string' ? offerId : null

  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null
  const { refreshBadge } = useBadge()

  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, 12)

  // offerId から解決した trade の実体。
  const [tradeId, setTradeId] = useState<string | null>(null)
  const [status, setStatus] = useState<TradeStatus | null>(null)
  const [counterpart, setCounterpart] = useState<CounterpartProfile | null>(null)
  const [messages, setMessages] = useState<TradeMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // ★取得失敗と「0 件」を区別する。エラーを 0 件として描画しない (嘘表示の防止)。
  const [messagesError, setMessagesError] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const scrollRef = useRef<ScrollView | null>(null)
  const markingRef = useRef(false)
  // 二重送信抑止 (state 更新の非同期性に依存しない即時ガード)。
  const sendingRef = useRef(false)
  // 楽観追記の一時 ID を一意にするためのカウンタ。
  const optimisticSeqRef = useRef(0)

  // 既読化 + グローバルバッジ更新 (b-3 と接続。現状 trade 未読は BadgeProvider 未集計だが
  // refreshBadge 自体は既存機能なので呼んで安全)。
  const markRead = useCallback(
    async (resolvedTradeId: string | null) => {
      if (resolvedTradeId == null) return
      if (markingRef.current) return
      markingRef.current = true
      try {
        await markTradeThreadRead(resolvedTradeId)
        await refreshBadge()
      } catch (error) {
        console.warn('[TradeDM] markTradeThreadRead', error)
      } finally {
        markingRef.current = false
      }
    },
    [refreshBadge]
  )

  // trade 解決 + メッセージ取得。silent=true のとき全画面ローダーを出さない (pull-to-refresh 用)。
  const reload = useCallback(
    async (silent = false): Promise<string | null> => {
      if (offerIdStr == null || userId == null) {
        setLoading(false)
        return null
      }
      // ★競合対策(a): 送信の await 中は全置換 reload をスキップする。
      //   送信中に focus/pull-to-refresh が走ると、setMessages(msgs) が一時行を
      //   消し、送信完了後の置換対象を失う (メッセージが消える/二重化する) ため。
      //   スキップしても送信完了後や次の focus/refresh で最新化されるので実害はない。
      //   null を返す (呼出側 markRead(null) は no-op。送信中は送信成功側で別途 markRead 済み)。
      if (sendingRef.current) return null
      if (!silent) setLoading(true)
      try {
        const detail = await fetchTradeDetailByOffer(offerIdStr)
        const trade = detail?.trade ?? null
        if (trade == null || typeof trade.id !== 'string') {
          setTradeId(null)
          setStatus(null)
          setCounterpart(null)
          setMessages([])
          return null
        }
        setTradeId(trade.id)
        setStatus(trade.status as TradeStatus)
        setCounterpart((detail?.counterpartProfile ?? null) as CounterpartProfile | null)

        // ★メッセージ取得は独立した try で扱い、「取得失敗」を「0 件」と混同しない。
        try {
          const msgs = await fetchTradeMessages(trade.id)
          // 全置換 (会場版と同じ)。楽観追記した行も次回 reload で正が上書きするため二重表示しない。
          setMessages(msgs)
          setMessagesError(false)
        } catch (msgErr) {
          // 生 error を JSON で出力 (code/message/details/hint を読めるように)。
          console.error(
            '[TradeDM] fetchTradeMessages failed',
            JSON.stringify(msgErr)
          )
          setMessagesError(true)
        }
        return trade.id
      } catch (error) {
        // trade 詳細の解決自体が失敗したケース (稀)。こちらも JSON で出す。
        console.error('[TradeDM] reload (detail) failed', JSON.stringify(error))
        Alert.alert(
          '読み込みエラー',
          '取引情報の取得に失敗しました。画面を戻ってもう一度開いてください。'
        )
        return null
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [offerIdStr, userId]
  )

  // 初回 mount
  useEffect(() => {
    reload().then((tid) => markRead(tid))
  }, [reload, markRead])

  // 画面復帰
  useFocusEffect(
    useCallback(() => {
      reload().then((tid) => markRead(tid))
    }, [reload, markRead])
  )

  // メッセージ更新時に最下部へスクロール
  useEffect(() => {
    if (messages.length === 0) return
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false })
    }, 50)
    return () => clearTimeout(t)
  }, [messages])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    const tid = await reload(true)
    await markRead(tid)
    setRefreshing(false)
  }, [reload, markRead])

  // 取得失敗表示の「再試行」。silent reload でヘッダーを保ったまま再取得する。
  const onRetryMessages = useCallback(async () => {
    if (retrying) return
    setRetrying(true)
    const tid = await reload(true)
    await markRead(tid)
    setRetrying(false)
  }, [retrying, reload, markRead])

  const handleSend = useCallback(async () => {
    if (tradeId == null || status == null) return
    if (!canSend(status)) return
    const body = draft.trim()
    if (body.length === 0) return
    if (sendingRef.current) return // 二重送信抑止
    sendingRef.current = true
    setSending(true)

    // (1) 楽観追記: 一時行を先に積む。一時 ID は 'optimistic:' プレフィックス
    //     (サーバ ID は UUID なので衝突しない)。
    optimisticSeqRef.current += 1
    const optimisticId = `optimistic:${Date.now()}:${optimisticSeqRef.current}`
    const optimisticMsg: TradeMessage = {
      id: optimisticId,
      trade_id: tradeId,
      sender_user_id: userId,
      kind: 'user',
      body,
      system_event: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])
    setDraft('')

    try {
      // (2) 送信
      const result = await sendTradeMessage(tradeId, body)
      // (3) 成功: 一時行を実 message へ反映。★冪等マージ (競合対策の insurance):
      //   - 通常: 一時行を除去 → 実行を末尾に追加 (= 置換)。
      //   - 万一 reload が割り込み実行を既に取り込んでいた場合: 実 ID が既存なら
      //     二重追加しない。一時行が消えていても実行を必ず1件だけ残す。
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticId)
        if (withoutOptimistic.some((m) => m.id === result.message.id)) {
          return withoutOptimistic
        }
        return [...withoutOptimistic, result.message]
      })
      // 送信成功後の既読化 (自分の送信で last_read_at を進める)。
      await markRead(tradeId)
      // (4) cod_warning: 置換した「後で」Alert を出す (送信は成功している)。
      if (result.cod_warning) {
        Alert.alert(
          'Swaplyは元払いのみです',
          '送料は、送る側が負担してください。着払い・代金引換は利用できません。\n※このメッセージは送信されました'
        )
      }
    } catch (error) {
      // (5) 失敗: 一時行を必ず除去してから Alert (送れていない行を残さない)。
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      const raw = extractErrorMessage(error)

      if (raw.startsWith('MESSAGE_BLOCKED')) {
        // カテゴリ名 (:monetary 等) は参照しない。プレフィックス一致のみ。
        Alert.alert(
          'この内容は送信できません',
          'Swaplyでは、金銭のやり取りや、アプリ外での連絡先の交換はできません。'
        )
      } else if (raw.includes('SEND_WINDOW_CLOSED')) {
        Alert.alert(
          'この取引は終了しています',
          'メッセージの送信はできません。',
          [
            {
              text: 'OK',
              onPress: () => {
                // 入力欄が生きたまま同じエラーを繰り返させない。最新状態に切り替える。
                void reload(true)
              },
            },
          ]
        )
      } else {
        // ★識別できないエラーは安全側: 一時行は既に除去済み。汎用エラーを出す。
        //   「識別できなかったから送信成功扱い」には絶対にしない。
        console.error('[TradeDM] handleSend unclassified', error)
        Alert.alert(
          'エラー',
          'メッセージの送信に失敗しました。時間をおいて再度お試しください。'
        )
      }
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [tradeId, status, draft, userId, markRead, reload])

  // ── 画面状態の分岐 ──
  if (offerIdStr == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="メッセージ" />
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>取引が指定されていません</Text>
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

  if (tradeId == null || status == null) {
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

  const sendWindowOpen = canSend(status)
  const isMine = (m: TradeMessage) =>
    m.kind === 'user' && m.sender_user_id != null && m.sender_user_id === userId

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={counterpartLabel(counterpart)} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* スレッド冒頭の固定システムメッセージ (DB には保存しない・クライアント固定描画)。 */}
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              このやり取りは通報できます。{'\n'}
              個人情報や、アプリ外の連絡先を教える必要はありません。
            </Text>
          </View>

          {messagesError ? (
            // ★取得失敗: 「0 件」とは別の状態。再試行導線を出す (嘘の空表示をしない)。
            <View style={styles.messagesErrorBox}>
              <Text style={styles.messagesErrorTitle}>
                メッセージを読み込めませんでした
              </Text>
              <Text style={styles.messagesErrorSub}>
                通信状況を確認して、もう一度お試しください。
              </Text>
              <Pressable
                onPress={onRetryMessages}
                disabled={retrying}
                style={({ pressed }) => [
                  styles.retryButton,
                  retrying && styles.retryButtonDisabled,
                  pressed && styles.retryButtonPressed,
                ]}
              >
                {retrying ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.retryButtonText}>再試行</Text>
                )}
              </Pressable>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyMessagesText}>
                まだメッセージはありません。
              </Text>
            </View>
          ) : (
            <View style={styles.messagesList}>
              {messages.map((m) => {
                // kind='system' はユーザーの吹き出しにしない (中央表示)。現状 body が空でも将来に備える。
                if (m.kind === 'system') {
                  return (
                    <View key={m.id} style={styles.systemRow}>
                      {m.body !== '' && (
                        <Text style={styles.systemText}>{m.body}</Text>
                      )}
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
                          mine
                            ? styles.bubbleTextMine
                            : styles.bubbleTextTheirs,
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
          <View style={[styles.readOnlyBanner, { paddingBottom: bottomPad }]}>
            <Text style={styles.readOnlyText}>{readOnlyMessage(status)}</Text>
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

  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },

  noticeCard: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },

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

  // ★取得失敗表示 (0 件とは別状態・再試行付き)。
  messagesErrorBox: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.base,
    alignItems: 'center',
    gap: spacing.sm,
  },
  messagesErrorTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  messagesErrorSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: spacing.xs,
    minWidth: 96,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonDisabled: { opacity: 0.5 },
  retryButtonPressed: { opacity: 0.7 },
  retryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
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
})
