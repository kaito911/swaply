// hooks/useVenueSupplyRealtime.ts
//
// venue_supply_posts の Realtime 購読フック。会場モードのライブ演出の心臓部。
// - INSERT: 新着出品 → EXCHANGE DROP (滑り込み) + 熱量リング脈打ち
// - UPDATE (status active→held): Hold 成立 → 熱量リング脈打ち
//
// ★RLS 前提: Realtime は購読者の RLS でフィルタされる。venue_supply_posts の SELECT は
//   「チェックイン済み or Hold 関与」で読めるため、会場に入った人にだけ他人の
//   INSERT/UPDATE が届く (checkin は当事者限定で Realtime に乗らない → 別途ポーリング)。
// ★グレースフル劣化: 該当テーブルの Realtime が本番で未有効化でも、購読が発火しないだけで
//   エラーにはしない (ライブ脈打ちが無いだけ、ポーリング/初回 fetch は従来どおり動く)。
//
// replica identity full を入れる前提なので UPDATE payload の old.status も参照できる。
import { supabase } from '@/lib/supabase'
import { useEffect, useRef } from 'react'

export interface VenueSupplyRealtimeRow {
  id: string
  venue_id: string
  user_id: string
  status: string
  [key: string]: unknown
}

interface Params {
  /** 指定時はその会場のみ購読 (会場の中)。未指定は全会場 (会場一覧) を購読し venue_id で振り分け。 */
  venueId?: string | null
  /** 新着 active 出品が INSERT された時。 */
  onInsert?: (row: VenueSupplyRealtimeRow) => void
  /** status が active→held に UPDATE された時 (Hold 成立)。 */
  onHeld?: (row: VenueSupplyRealtimeRow) => void
  /** 購読を有効にするか (未ログイン等で切る用)。 */
  enabled?: boolean
}

export function useVenueSupplyRealtime({ venueId, onInsert, onHeld, enabled = true }: Params) {
  // コールバックを ref 経由で参照し、依存で購読を張り直さない (安定した channel を保つ)。
  const onInsertRef = useRef(onInsert)
  const onHeldRef = useRef(onHeld)
  onInsertRef.current = onInsert
  onHeldRef.current = onHeld

  useEffect(() => {
    if (!enabled) return

    const filter = venueId != null ? `venue_id=eq.${venueId}` : undefined
    const channelName = venueId != null ? `venue_supply:${venueId}` : 'venue_supply:all'

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'venue_supply_posts', ...(filter ? { filter } : {}) },
        (payload) => {
          const row = payload.new as VenueSupplyRealtimeRow
          if (row?.status === 'active') onInsertRef.current?.(row)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'venue_supply_posts', ...(filter ? { filter } : {}) },
        (payload) => {
          const row = payload.new as VenueSupplyRealtimeRow
          const old = payload.old as Partial<VenueSupplyRealtimeRow> | undefined
          // active→held への遷移のみ Hold 脈打ちとして拾う (replica identity full で old.status 取得)。
          if (row?.status === 'held' && old?.status !== 'held') onHeldRef.current?.(row)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [venueId, enabled])
}
