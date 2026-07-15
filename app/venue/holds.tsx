// app/venue/holds.tsx
// Venue Hold一覧（PR2: 受信 / 送信 / 成立済の 3 タブ構成）
//
// タブ分離:
//   - received: 自分が受信者 (= supply_post 投稿者) の Hold。承認 / 拒否ボタン。
//   - sent:     自分が申請者の Hold。取消ボタン。
//   - converted: held / converted (= venue_trade 生成後)。完了確認 (legacy)。
//
// lazy expiry:
//   - pending かつ expires_at < now() を UI 上「期限切れ」扱いで承認 / 拒否 / 取消ボタン非表示。
//   - DB 上は pending のまま (PR2 では expired への遷移はしない。P1 で pg_cron)。
//
// 完了確認 (converted タブ) は B1 (in-memory trade) / B2 (receiver 先行 CHECK 違反)
// バグを残したまま温存。PR4a で再設計予定。
import {
  acceptVenueHold,
  cancelVenueHold,
  confirmVenueTrade,
  declineVenueHold,
  fetchVenueHolds,
  fetchVenueTradeUnreadCounts,
  type VenueHoldWithRelations,
} from '@/lib/supabase'
import {
  computeTrustBadge,
  VENUE_HOLD_STATUS_LABELS,
  VenueHoldStatus,
} from '@/lib/types'
import { formatVenueTimeLeft, isVenueExpired } from '@/lib/venueExpiry'
import { TrustBadge } from '@/components/TrustBadge'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
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

type Tab = 'received' | 'sent' | 'converted'

// PR-5-b: キャンセル申請バッジ用 accent (= app/venue/[id].tsx の VENUE_COLORS.accent
// 同値、本ファイル局所利用)。export されていないトークンなのでローカル定数として持つ。
const ACCENT_COLOR = '#FF3E6C'
const INK3_COLOR = '#9CA0AD'

const HOLD_STATUS_COLORS: Record<VenueHoldStatus, string> = {
  pending: '#D97706',
  held: '#059669',
  expired: '#6B7280',
  cancelled: '#6B7280',
  converted: '#4F46E5',
  declined: '#6B7280',
}

// pending hold が期限切れかどうかは「status='pending' かつ expires_at < now()」で判定する。
// 期限切れ判定そのものは lib/venueExpiry.ts の isVenueExpired に集約。
function isPendingExpired(hold: VenueHoldWithRelations): boolean {
  return hold.status === 'pending' && isVenueExpired(hold.expires_at)
}

function isConvertedLike(hold: VenueHoldWithRelations): boolean {
  // held は legacy だが PR4 まで残置。converted と同じ「成立済」扱い。
  return hold.status === 'held' || hold.status === 'converted'
}

// declined / cancelled は「解決済みで以後アクション不能」= 終端非アクティブ。
// 受信 / 送信リストから除外する (cancelled と同じ扱いで declined も消す)。
// 注: expired (= pending だが期限切れ) は意図的に残す (「期限切れ」表示 + ボタン無効で
//     申請者に状態を伝えるため、isPendingExpired 側で処理)。ここでは巻き込まない。
function isInactiveHold(hold: VenueHoldWithRelations): boolean {
  return hold.status === 'declined' || hold.status === 'cancelled'
}

function counterpartName(
  profile: { handle: string | null; display_name: string | null } | null | undefined
): string {
  if (profile == null) return '削除済みユーザー'
  return profile.handle ?? profile.display_name ?? 'ユーザー'
}

// PR4b: accept_venue_hold RPC が raise exception で返すエラー文字列を日本語化する。
// 関連: docs/migration_rpc_accept_venue_hold.sql
function venueAcceptErrorMessage(rawMessage: string): { title: string; body: string } {
  if (rawMessage.startsWith('HOLD_EXPIRED')) {
    return {
      title: '期限切れ',
      body: 'この提案は期限切れです。申請者に再度提案してもらってください。',
    }
  }
  if (rawMessage.startsWith('SUPPLY_POST_ALREADY_TAKEN')) {
    return {
      title: '成立済み',
      body: 'この会場投稿は既に別の相手と成立しています。',
    }
  }
  if (rawMessage.startsWith('SUPPLY_POST_NOT_FOUND')) {
    return {
      title: '投稿が見つかりません',
      body: '元の会場投稿が削除された可能性があります。',
    }
  }
  if (rawMessage.startsWith('SUPPLY_POST_NOT_ACTIVE')) {
    const status = rawMessage.split(':')[1] ?? 'unknown'
    return {
      title: '受付終了',
      body: `元の会場投稿は受付中ではありません（${status}）。`,
    }
  }
  if (rawMessage.startsWith('HOLD_NOT_PENDING')) {
    const status = rawMessage.split(':')[1] ?? 'unknown'
    return {
      title: '承認できません',
      body: `この提案は既に処理されています（${status}）。一度画面を更新してください。`,
    }
  }
  if (rawMessage.startsWith('NOT_RECEIVER')) {
    return {
      title: '権限がありません',
      body: 'この提案の受信者でないため承認できません。',
    }
  }
  if (rawMessage.startsWith('AUTH_REQUIRED')) {
    return {
      title: '認証エラー',
      body: 'もう一度ログインしてください。',
    }
  }
  return { title: 'エラー', body: '承認に失敗しました。' }
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
  // PR4a (B1 修正): venueTrades の in-memory state を廃止。trade は fetchVenueHolds が
  // join 取得した hold.venue_trade を直接利用する (画面再 mount 後も双方が trade に到達可)。
  // PR5: 成立済タブの per-trade unread badge 用。get_venue_trade_unread_counts() 一括 RPC
  // を 1 回だけ呼び Map<trade_id, unread_count> を構築 (N+1 回避)。未読 0 の trade は
  // 行が返らないので map.get(id) ?? 0 で取り回す。
  const [unreadByTradeId, setUnreadByTradeId] = useState<Map<string, number>>(
    new Map()
  )

  const reload = useCallback(async () => {
    if (venueId == null || userId == null) return
    setLoading(true)
    const fresh = await fetchVenueHolds(venueId, userId, 'all')
    setHolds(fresh)
    // unread 取得は失敗しても hold 一覧の表示は止めない (warn のみ)
    try {
      const counts = await fetchVenueTradeUnreadCounts()
      setUnreadByTradeId(counts)
    } catch (error) {
      console.warn('[VenueHolds] fetchVenueTradeUnreadCounts', error)
      setUnreadByTradeId(new Map())
    }
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
    if (t === 'received')
      return h.receiver_id === userId && !isConvertedLike(h) && !isInactiveHold(h)
    if (t === 'sent')
      return h.proposer_id === userId && !isConvertedLike(h) && !isInactiveHold(h)
    return false
  }

  const receivedCount = holds.filter((h) => matchTab(h, 'received')).length
  const sentCount = holds.filter((h) => matchTab(h, 'sent')).length
  const convertedCount = holds.filter((h) => matchTab(h, 'converted')).length
  // PR-5-b: 成立済タブのうち「相手からキャンセル申請が届いて自分がまだ応答していない」件数。
  // タブラベル横の赤ドットで対応必要を可視化する。
  const convertedUrgentCount = holds.filter((h) => {
    if (!matchTab(h, 'converted')) return false
    const t = h.venue_trade
    return (
      t != null &&
      t.cancel_requested_at != null &&
      t.cancel_requested_by !== userId &&
      t.status === 'pending'
    )
  }).length

  const visible = holds.filter((h) => matchTab(h, tab))

  const handleAccept = (hold: VenueHoldWithRelations) => {
    Alert.alert(
      '交換の提案を承認しますか？',
      '承認すると成立します。イベント当日中に会場で交換してください。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '承認する',
          onPress: async () => {
            try {
              setActingId(hold.id)
              const trade = await acceptVenueHold(hold.id)
              // PR4a: 戻り値の trade を hold オブジェクトに埋め込む (再 fetch なしで
              // 即座に成立タブの「交換の完了を確認」ボタンへ到達可能にする)
              setHolds((prev) =>
                prev.map((h) =>
                  h.id === hold.id
                    ? { ...h, status: 'held', venue_trade: trade }
                    : h
                )
              )
              // accept 後は成立済タブへ自動切替
              setTab('converted')
            } catch (error) {
              console.error('[VenueHolds][handleAccept]', error)
              const rawMessage =
                error instanceof Error
                  ? error.message
                  : typeof error === 'object' &&
                    error != null &&
                    'message' in error &&
                    typeof (error as { message?: unknown }).message === 'string'
                  ? (error as { message: string }).message
                  : ''
              const { title, body } = venueAcceptErrorMessage(rawMessage)
              Alert.alert(title, body)
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
      '交換の提案を拒否しますか？',
      '拒否すると相手には「拒否済み」と表示されます。',
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
      '交換の提案を取り消しますか？',
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
    // PR4a: trade は hold.venue_trade から取得 (fetchVenueHolds で join 取得済)
    const trade = hold.venue_trade
    if (trade == null || userId == null) return

    const role = hold.proposer_id === userId ? 'proposer' : 'receiver'

    Alert.alert(
      '交換の完了を確認しますか？',
      'カードを受け取ったことを確認します。双方が確認すると取引完了となりTrustが更新されます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '確認する',
          onPress: async () => {
            try {
              setActingId(hold.id)
              await confirmVenueTrade(trade.id, userId, role)
              // PR4a: completed への遷移は両者確認時のみ。partially_confirmed の
              // 場合は status='held' のまま (venue_trade.status のみ更新済)。
              // hold.venue_trade を最新化して以降の判定を正しく動かす。
              const otherTimestamp =
                role === 'proposer'
                  ? trade.receiver_confirmed_at
                  : trade.proposer_confirmed_at
              const becameCompleted = otherTimestamp != null
              // 申告導線: 双方確認で completed になった時のみ「問題なし/あり」を1枚挟む。
              //   相手待ち(partially)は従来どおりの Alert を維持(非破壊)。
              if (becameCompleted) {
                Alert.alert(
                  '取引完了',
                  '問題なく取引できましたか？',
                  [
                    { text: '問題なく完了', style: 'cancel' },
                    {
                      text: '問題があった',
                      onPress: () =>
                        router.push({
                          pathname: '/trade/report',
                          params: { venueTradeId: trade.id },
                        } as never),
                    },
                  ],
                )
              } else {
                Alert.alert('確認しました', '相手の確認待ちです。')
              }
              setHolds((prev) =>
                prev.map((h) => {
                  if (h.id !== hold.id) return h
                  const updatedTrade = {
                    ...trade,
                    proposer_confirmed_at:
                      role === 'proposer'
                        ? new Date().toISOString()
                        : trade.proposer_confirmed_at,
                    receiver_confirmed_at:
                      role === 'receiver'
                        ? new Date().toISOString()
                        : trade.receiver_confirmed_at,
                    status: becameCompleted
                      ? ('completed' as const)
                      : ('partially_confirmed' as const),
                    completed_at: becameCompleted
                      ? new Date().toISOString()
                      : trade.completed_at,
                  }
                  return {
                    ...h,
                    status: becameCompleted ? 'converted' : h.status,
                    venue_trade: updatedTrade,
                  }
                })
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

  // PR-5-b: 成立済タブのみ urgent (対応待ち件数) を持たせる。他タブは undefined のまま
  // で描画時に赤ドットが出ない。
  const TABS: { key: Tab; label: string; count: number; urgent?: number }[] = [
    { key: 'received', label: '受けた提案', count: receivedCount },
    { key: 'sent', label: '送った提案', count: sentCount },
    {
      key: 'converted',
      label: '成立',
      count: convertedCount,
      urgent: convertedUrgentCount,
    },
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
            <View style={styles.tabLabelRow}>
              <Text
                style={[
                  styles.tabLabel,
                  tab === t.key && styles.tabLabelActive,
                ]}
              >
                {t.label}（{t.count}）
              </Text>
              {/* PR-5-b: urgent (キャンセル申請応答待ち) 件数を赤ドットで可視化。
                  urgent が undefined / 0 のタブには出ない (received/sent はそのまま)。 */}
              {t.urgent != null && t.urgent > 0 && (
                <View style={styles.tabUrgentDot}>
                  <Text style={styles.tabUrgentDotText}>{t.urgent}</Text>
                </View>
              )}
            </View>
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
              ? '受けた提案はありません'
              : tab === 'sent'
              ? '送った提案はありません'
              : '成立した交換はありません'}
          </Text>
          <Text style={styles.emptyBody}>
            {tab === 'received'
              ? 'あなたの会場投稿に届いた提案がここに表示されます'
              : tab === 'sent'
              ? '会場で気になる相手に交換を提案すると、ここに表示されます'
              : '成立した交換がここに集まります'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {visible.map((hold) => {
            const expired = isPendingExpired(hold)
            const displayStatus: VenueHoldStatus = expired
              ? 'expired'
              : hold.status
            const displayLabel = VENUE_HOLD_STATUS_LABELS[displayStatus]
            const displayColor = HOLD_STATUS_COLORS[displayStatus]
            const counterpart =
              tab === 'received' ? hold.proposer_profile : hold.receiver_profile
            const isActing = actingId === hold.id
            const trade = hold.venue_trade

            // PR-5-b: キャンセル申請バッジ判定 (成立済タブで trade があるカードのみ意味を持つ)。
            //   isCancelRequested  : trade に申請が立っている
            //   isMyCancelRequest  : 申請者は自分
            //   needsCancelResponse: 相手の申請 + 自分が未応答 (trade.status='pending')
            //                        → 「⚠️ キャンセル申請が届いています」を出す
            const isCancelRequested =
              trade != null && trade.cancel_requested_at != null
            const isMyCancelRequest =
              isCancelRequested && trade?.cancel_requested_by === userId
            const needsCancelResponse =
              isCancelRequested &&
              !isMyCancelRequest &&
              trade?.status === 'pending'

            const showAccept =
              tab === 'received' && hold.status === 'pending' && !expired
            const showDecline = showAccept
            const showCancel =
              tab === 'sent' && hold.status === 'pending' && !expired
            // PR4a: held / converted どちらでも、まだ自分側が未確認の trade があれば
            // ボタンを出す。trade.status が 'completed' になっていれば自分の側も完了済。
            const myConfirmed =
              trade != null
                ? (hold.proposer_id === userId
                    ? trade.proposer_confirmed_at != null
                    : trade.receiver_confirmed_at != null)
                : false
            const confirmEligible =
              tab === 'converted' &&
              trade != null &&
              trade.status !== 'completed' &&
              trade.status !== 'cancelled' &&
              !myConfirmed
            // バグ2 修正: キャンセル申請中は完了系アクションを隠す (誤って完了しない)。
            // 申請が拒否/取下げされ cancel_requested_at が NULL に戻ると reload で復活する。
            const showConfirmTrade = confirmEligible && !isCancelRequested
            // 完全な無表示は避け、「申請中は完了できない」ことを一文で伝える (案Y)。
            const showCancelBlockedHint = confirmEligible && isCancelRequested

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
                      {formatVenueTimeLeft(hold.expires_at)}
                    </Text>
                  ) : null}
                </View>

                {/* PR-5-b: キャンセル申請バッジ。
                    needsCancelResponse: 相手の申請に未応答 → coral 強調バッジ。
                    isMyCancelRequest  : 自分の申請待ち応答 → ink3 控えめバッジ。
                    どちらでもないカードには何も出さない (= キャンセル文脈なし)。 */}
                {needsCancelResponse && (
                  <View style={styles.cancelRequestBadge}>
                    <Text style={styles.cancelRequestBadgeText}>
                      ⚠️ キャンセル申請が届いています
                    </Text>
                  </View>
                )}
                {isMyCancelRequest && (
                  <View style={styles.cancelPendingBadge}>
                    <Text style={styles.cancelPendingBadgeText}>
                      キャンセル申請中
                    </Text>
                  </View>
                )}

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

                {/* 申請者 (proposer) 側商品画像 (任意): 受信タブで承認者が
                    「相手が出してくれる商品」を承認前に画像で確認できる。
                    申請モーダルで添付された画像が venue_holds.proposer_image_url に
                    保存され、tab を問わずどちらにも有用なため両 tab で表示する。
                    承認後 (status='held' / 'converted') は accept_venue_hold RPC が
                    offered_snapshot.image_url に同値をコピーするため、hold 行が
                    後で消えても venue_trade 画面で参照可能。 */}
                {hold.proposer_image_url != null && (
                  <Image
                    source={{ uri: hold.proposer_image_url }}
                    style={styles.snapshotImage}
                    resizeMode="cover"
                  />
                )}

                {/* PR3: snapshot からの画像表示 (受信者カードのもの、low-risk 拡張)。
                    accept_venue_hold RPC が wanted_snapshot.image_url に supply_post の
                    image_url を入れているので、supply_post が後で削除されても残る。 */}
                {(() => {
                  const wantedImageUrl =
                    typeof hold.venue_trade?.wanted_snapshot?.image_url === 'string'
                      ? (hold.venue_trade.wanted_snapshot.image_url as string)
                      : null
                  if (wantedImageUrl == null) return null
                  return (
                    <Image
                      source={{ uri: wantedImageUrl }}
                      style={styles.snapshotImage}
                      resizeMode="cover"
                    />
                  )
                })()}

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
                        交換の完了を確認する
                      </Text>
                    )}
                  </Pressable>
                )}

                {/* バグ2 修正 (案Y): キャンセル申請中は完了ボタンを隠し、理由を一文で明示。 */}
                {showCancelBlockedHint && (
                  <Text style={styles.cancelBlockedHint}>
                    キャンセル申請中のため、完了できません
                  </Text>
                )}

                {/* PR5: 成立済タブから venue_trade 専用 DM へ遷移。
                    cancelled trade でも閲覧 (read-only) のため表示する。 */}
                {tab === 'converted' && trade != null && (() => {
                  const unread = unreadByTradeId.get(trade.id) ?? 0
                  return (
                    <Pressable
                      style={[
                        styles.openMessagesButton,
                        isActing && styles.buttonDisabled,
                      ]}
                      onPress={() => router.push(`/venue/trade/${trade.id}`)}
                      disabled={isActing}
                    >
                      <Text style={styles.openMessagesButtonText}>
                        メッセージを開く
                      </Text>
                      {unread > 0 && (
                        <View style={styles.openMessagesBadge}>
                          <Text style={styles.openMessagesBadgeText}>
                            {unread > 99 ? '99+' : String(unread)}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  )
                })()}

                {/* PR4a: B1 解消後、trade は DB から取得済 (null は理論上発生しない)。
                    万一 null の場合 (RLS / データ欠落) は念のため案内のみ。 */}
                {tab === 'converted' &&
                  hold.status === 'held' &&
                  trade == null && (
                    <Text style={styles.legacyNote}>
                      ※ 取引情報を取得できませんでした。一度この画面を離れて戻ると再試行できます。
                    </Text>
                  )}

                {/* PR4a: 自分の確認は完了済、相手の確認待ち */}
                {tab === 'converted' &&
                  trade != null &&
                  trade.status === 'partially_confirmed' &&
                  myConfirmed && (
                    <Text style={styles.partiallyHint}>
                      ✓ あなたの完了確認は記録されました。相手の確認待ちです。
                    </Text>
                  )}

                {/* PR4a: 完了済 trade */}
                {tab === 'converted' &&
                  trade != null &&
                  trade.status === 'completed' && (
                    <Text style={styles.completedHint}>
                      ✓ 取引完了。双方が完了を確認しました。
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
  // PR-5-b: タブラベル + 赤ドットの横並びコンテナ。
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textTertiary,
  },
  tabLabelActive: { color: colors.primary, fontWeight: fontWeight.bold },
  // PR-5-b: タブ右端の赤ドット (キャンセル申請応答待ち件数)。
  tabUrgentDot: {
    backgroundColor: ACCENT_COLOR,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  tabUrgentDotText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // PR-5-b: カード上のキャンセル申請バッジ (受け側、coral 強調)。
  cancelRequestBadge: {
    backgroundColor: ACCENT_COLOR + '18',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  cancelRequestBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT_COLOR,
  },
  // PR-5-b: カード上のキャンセル申請中バッジ (自分側、ink3 控えめ)。
  cancelPendingBadge: {
    backgroundColor: INK3_COLOR + '18',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  cancelPendingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: INK3_COLOR,
  },
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
  // PR3: wanted_snapshot.image_url を表示する snapshot 画像 (画面を広げないサイズ感)
  snapshotImage: {
    width: '50%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    alignSelf: 'center',
    marginVertical: spacing.xs,
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
  // PR5: 成立済タブから venue_trade DM へ遷移するボタン (確定ボタンの下に配置)。
  openMessagesButton: {
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  openMessagesButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  openMessagesBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openMessagesBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  buttonDisabled: { opacity: 0.6 },
  legacyNote: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  partiallyHint: {
    fontSize: fontSize.xs,
    color: '#059669',
    fontWeight: fontWeight.semibold,
  },
  completedHint: {
    fontSize: fontSize.xs,
    color: '#4F46E5',
    fontWeight: fontWeight.semibold,
  },
  expiredHint: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  // バグ2 修正 (案Y): キャンセル申請中に完了ボタンの代わりに出す説明テキスト。
  cancelBlockedHint: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
})
