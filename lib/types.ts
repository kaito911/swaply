// lib/types.ts

export type TrustBadgeLevel = 'none' | 'bronze' | 'silver' | 'gold'

export type CardStatus = 'active' | 'inactive' | 'reserved' | 'traded'
export type CardCondition = 'mint' | 'near_mint' | 'good' | 'fair' | 'poor'
export type UserMode = 'oshi' | 'trading_card' | 'collection'

export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'

export type OfferItemRole = 'proposer' | 'receiver'

export type TradeStatus =
  | 'pending'
  | 'in_transit'
  | 'partially_received'
  | 'completed'
  | 'cancelled'
  | 'disputed'

export type ShipmentStatus = 'pending' | 'shipped' | 'received' | 'cancelled'

// ─────────────────────────────────────────
// profiles
// ─────────────────────────────────────────
export interface Profile {
  id: string
  handle: string
  display_name: string | null
  avatar_url: string | null
  mode: UserMode
  trade_count: number
  ship_rate: number
  reply_median_hours: number
  trouble_count: number
  adjustment_avg: number | null
  adjustment_bias: string | null
  last_active_at: string | null
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────
// cards
// ─────────────────────────────────────────
export interface Card {
  id: string
  owner_user_id: string
  name: string
  series: string | null
  member_name: string | null
  group_name: string | null
  image_url: string | null
  description: string | null
  status: CardStatus
  condition: CardCondition | null
  want_description: string | null
  allows_adjustment: boolean
  adjustment_max: number | null
  allows_mail: boolean
  allows_handoff: boolean
  created_at: string
  updated_at: string
  owner?: Profile
}

// ─────────────────────────────────────────
// offer_items
// ─────────────────────────────────────────
export interface OfferItem {
  id: string
  offer_id: string
  card_id: string
  role: OfferItemRole
  created_at?: string
  card?: Card
}

// ─────────────────────────────────────────
// offers
// ─────────────────────────────────────────
export interface Offer {
  id: string
  proposer_user_id: string
  receiver_user_id: string
  target_card_id: string
  adjustment_amount: number | null
  status: OfferStatus
  message: string | null
  created_at: string
  updated_at?: string

  proposer?: Profile
  receiver?: Profile
  target_card?: Card
  items?: OfferItem[]
}

// ─────────────────────────────────────────
// shipments
// ─────────────────────────────────────────
export interface Shipment {
  id: string
  trade_id: string
  sender_user_id: string
  recipient_user_id: string
  tracking_number: string | null
  carrier: string | null
  status: ShipmentStatus
  shipped_at: string | null
  received_at: string | null
  created_at: string
  updated_at?: string
}

// ─────────────────────────────────────────
// trades
// ─────────────────────────────────────────
export interface Trade {
  id: string
  offer_id: string
  status: TradeStatus
  ship_deadline_at: string | null
  created_at: string
  updated_at?: string
  accepted_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null

  offer?: Offer
  shipments?: Shipment[]
}

// ─────────────────────────────────────────
// Trustバッジ判定
// ─────────────────────────────────────────
export function computeTrustBadge(
  profile: Pick<
    Profile,
    'trade_count' | 'ship_rate' | 'reply_median_hours' | 'trouble_count'
  >
): TrustBadgeLevel {
  const { trade_count, ship_rate, reply_median_hours, trouble_count } = profile

  if (
    trade_count >= 150 &&
    ship_rate >= 97 &&
    trouble_count === 0
  ) {
    return 'gold'
  }

  if (
    trade_count >= 50 &&
    ship_rate >= 95 &&
    trouble_count === 0 &&
    reply_median_hours <= 24
  ) {
    return 'silver'
  }

  if (
    trade_count >= 10 &&
    ship_rate >= 90 &&
    trouble_count === 0
  ) {
    return 'bronze'
  }

  return 'none'
}

export const CONDITION_LABELS: Record<CardCondition, string> = {
  mint: '美品',
  near_mint: 'ほぼ美品',
  good: '良好',
  fair: '普通',
  poor: 'キズあり',
}

export const MODE_LABELS: Record<UserMode, string> = {
  oshi: '推し活',
  trading_card: 'トレカ',
  collection: 'コレクション',
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: '承認待ち',
  accepted: '成立',
  declined: '辞退',
  cancelled: 'キャンセル',
}

export const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
  pending: '取引開始',
  in_transit: '発送進行中',
  partially_received: '一部受取済み',
  completed: '完了',
  cancelled: 'キャンセル',
  disputed: '問題対応中',
}

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: '発送待ち',
  shipped: '発送済み',
  received: '受取済み',
  cancelled: 'キャンセル',
}

export function formatReplyTime(hours: number): string {
  if (hours < 1) return '1時間以内'
  if (hours < 24) return `${hours}時間`
  const days = Math.floor(hours / 24)
  return `${days}日`
}

export function formatLastActive(dateStr: string | null): string {
  if (!dateStr) return '不明'

  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)

  if (hours < 1) return 'たった今'
  if (hours < 24) return `${hours}時間前`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}日前`

  return `${Math.floor(days / 7)}週間前`
}