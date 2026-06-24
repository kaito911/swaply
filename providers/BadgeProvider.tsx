// providers/BadgeProvider.tsx
// 未読バッジ数の管理
import {
  fetchReceivedHoldCount,
  fetchVenueTradeUnreadCount,
  supabase,
} from '@/lib/supabase'
import { useAuthContext } from '@/providers/AuthProvider'
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { AppState, AppStateStatus } from 'react-native'

interface BadgeContextValue {
  pendingOfferCount: number
  receivedHoldCount: number
  venueTradeUnreadCount: number
  // 通知ベル / 通知画面で使う合算カウント。
  // 「今対応が必要なこと」の総数として 3 軸を合計した派生値。
  // 新規 fetcher は追加せず、既存 state からのみ算出。
  totalNotificationCount: number
  refreshBadge: () => Promise<void>
}

const BadgeContext = createContext<BadgeContextValue>({
  pendingOfferCount: 0,
  receivedHoldCount: 0,
  venueTradeUnreadCount: 0,
  totalNotificationCount: 0,
  refreshBadge: async () => {},
})

export function BadgeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null
  const [pendingOfferCount, setPendingOfferCount] = useState(0)
  // PR2 feat/venue-hold-inbox: 全 venue 横断で「自分宛 pending Hold (未失効)」の総数。
  // 会場タブ (BottomTabBar) のバッジで使用。venueId 指定の per-venue カウントは
  // /venue/[id] 側で fetchReceivedHoldCount(userId, venueId) を直接呼ぶ。
  const [receivedHoldCount, setReceivedHoldCount] = useState(0)
  // PR5 feat/venue-trade-dm: 自分が participant の全 venue_trade の合算未読数。
  // RPC get_venue_trade_unread_count() で kind='user' AND sender_id <> auth.uid()
  // のみカウント。BottomTabBar の会場タブで受信 Hold 件数と合算表示。
  const [venueTradeUnreadCount, setVenueTradeUnreadCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (userId == null) {
      setPendingOfferCount(0)
      setReceivedHoldCount(0)
      setVenueTradeUnreadCount(0)
      return
    }

    // 自分が出品したカードへのpending offerをカウント
    // まず自分のカードIDを取得してからofferを検索する
    const { data: myCards, error: cardsError } = await supabase
      .from('cards')
      .select('id')
      .eq('owner_user_id', userId)
      .eq('status', 'active')

    if (cardsError) {
      console.error('[BadgeProvider] fetchMyCards', cardsError)
    } else {
      const myCardIds = (myCards ?? []).map((c: { id: string }) => c.id)

      if (myCardIds.length === 0) {
        setPendingOfferCount(0)
      } else {
        const { count, error } = await supabase
          .from('offers')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .in('target_card_id', myCardIds)
          .neq('proposer_user_id', userId)

        if (error) {
          console.error('[BadgeProvider] fetchOfferCount', error)
        } else {
          setPendingOfferCount(count ?? 0)
        }
      }
    }

    // venue 受信 Hold 件数 (全 venue 横断)
    // PR-V2-fix2: lib/supabase.ts 側で fetchReceivedHoldCount がネットワーク起因失敗時に
    //   throw するよう変更されるため、ここで受け止めて silent fallback (0) する。
    //   グローバル BadgeProvider は UI 表示なし (タブバッジ管理のみ)、再試行 UI も不要、
    //   全エラーを catch して 0 fallback で十分 (隣の fetchVenueTradeUnreadCount と同思想)。
    try {
      const holdCount = await fetchReceivedHoldCount(userId)
      setReceivedHoldCount(holdCount)
    } catch (error) {
      console.warn('[BadgeProvider] fetchReceivedHoldCount', error)
      setReceivedHoldCount(0)
    }

    // venue_trade DM 合算未読数。RPC エラーは握りつぶさず warn し、表示は 0 にフォールバック。
    try {
      const unread = await fetchVenueTradeUnreadCount()
      setVenueTradeUnreadCount(unread)
    } catch (error) {
      console.warn('[BadgeProvider] fetchVenueTradeUnreadCount', error)
      setVenueTradeUnreadCount(0)
    }
  }, [userId])

  // 初回・userId変更時に取得
  useEffect(() => {
    fetchCount()
  }, [fetchCount])

  // アプリがフォアグラウンドに戻ったときに再取得
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          fetchCount()
        }
      }
    )
    return () => subscription.remove()
  }, [fetchCount])

  // 「対応が必要な件数」合算 — 通知ベル / 通知画面で利用。
  const totalNotificationCount =
    pendingOfferCount + receivedHoldCount + venueTradeUnreadCount

  return (
    <BadgeContext.Provider
      value={{
        pendingOfferCount,
        receivedHoldCount,
        venueTradeUnreadCount,
        totalNotificationCount,
        refreshBadge: fetchCount,
      }}
    >
      {children}
    </BadgeContext.Provider>
  )
}

export function useBadge(): BadgeContextValue {
  return useContext(BadgeContext)
}
