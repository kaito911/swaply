// providers/BadgeProvider.tsx
// 未読バッジ数の管理
import { fetchReceivedHoldCount, supabase } from '@/lib/supabase'
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
  refreshBadge: () => Promise<void>
}

const BadgeContext = createContext<BadgeContextValue>({
  pendingOfferCount: 0,
  receivedHoldCount: 0,
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

  const fetchCount = useCallback(async () => {
    if (userId == null) {
      setPendingOfferCount(0)
      setReceivedHoldCount(0)
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
    const holdCount = await fetchReceivedHoldCount(userId)
    setReceivedHoldCount(holdCount)
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

  return (
    <BadgeContext.Provider
      value={{ pendingOfferCount, receivedHoldCount, refreshBadge: fetchCount }}
    >
      {children}
    </BadgeContext.Provider>
  )
}

export function useBadge(): BadgeContextValue {
  return useContext(BadgeContext)
}
