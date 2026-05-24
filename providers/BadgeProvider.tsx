// providers/BadgeProvider.tsx
// 未読バッジ数の管理
import { supabase } from '@/lib/supabase'
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
  refreshBadge: () => Promise<void>
}

const BadgeContext = createContext<BadgeContextValue>({
  pendingOfferCount: 0,
  refreshBadge: async () => {},
})

export function BadgeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null
  const [pendingOfferCount, setPendingOfferCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (userId == null) {
      setPendingOfferCount(0)
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
      return
    }

    const myCardIds = (myCards ?? []).map((c: any) => c.id)

    if (myCardIds.length === 0) {
      setPendingOfferCount(0)
      return
    }

    const { count, error } = await supabase
      .from('offers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .in('target_card_id', myCardIds)
      .neq('proposer_user_id', userId)

    if (error) {
      console.error('[BadgeProvider] fetchCount', error)
      return
    }

    setPendingOfferCount(count ?? 0)
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
    <BadgeContext.Provider value={{ pendingOfferCount, refreshBadge: fetchCount }}>
      {children}
    </BadgeContext.Provider>
  )
}

export function useBadge(): BadgeContextValue {
  return useContext(BadgeContext)
}
