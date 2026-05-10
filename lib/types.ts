// lib/types.ts
import { parseWantText } from './wantParser' // ★ added

export type TrustBadgeLevel = 'green' | 'trial_blue' | 'blue' | 'gold_blue'
export type CardStatus = 'active' | 'inactive' | 'reserved' | 'traded'
export type CardCondition = 'mint' | 'near_mint' | 'good' | 'fair' | 'poor'
export type UserMode = 'oshi' | 'trading_card' | 'collection'

// マスタカテゴリ (cards.category と master_works.category で共有)
export type MasterCategory = 'anime' | 'idol' | 'character' | 'manga' | 'other'

// user_keyword_history.source
export type KeywordHistorySource = 'search' | 'listing_input'

export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'completed'

export type TradeStatus =
  | 'pending'
  | 'in_transit'
  | 'partially_received'
  | 'completed'
  | 'cancelled'
  | 'disputed'

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
  shipping_name: string | null
  postal_code: string | null
  address_line1: string | null
  address_line2: string | null

  // fetchMyOffers / get_trade_detail_by_offer で返る可能性がある補助項目
  username?: string | null
  full_name?: string | null
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
  image_back_url: string | null
  description: string | null
  status: CardStatus
  condition: CardCondition | null
  want_description: string | null
  allows_adjustment: boolean
  adjustment_max: number | null
  allows_mail: boolean
  allows_handoff: boolean
  // items 拡張 (refactor_plan v1.11 章 3.9 / Step 2.5 commit 1 c601667 で配列化)
  // 既存データは空配列、新規出品で値を要求 (UI 層で最低 1 個必須)。
  // work_id / characters[] / item_types[] は論理的に master_* を参照するが
  // FK 制約は付けず、ハイブリッドマスタとしてフリー入力 fallback を許容する。
  // characters[] / item_types[] はセット出品 (1 行 = N キャラ) と単独出品 (1 行 = 1 キャラ)
  // を統一表現するため配列。N=1 もセット形式の最小ケースとして扱う。
  category: MasterCategory | null
  work_id: string | null
  characters: string[]
  item_types: string[]
  created_at: string
  updated_at: string
  owner?: Profile
}

// ─────────────────────────────────────────
// master_works (大カテゴリマスタ、画像なし)
// 設計: refactor_plan v1.9 章 3.10、Day 1 必須項目 #5 (image_url 持たない)
// ─────────────────────────────────────────
export interface MasterWork {
  id: string                         // slug PK (例: 'kimetsu', 'conan', 'sanrio')
  display_name_ja: string
  display_name_en: string | null
  aliases: string[]                  // 表記ゆれ吸収用
  category: MasterCategory
  sort_order: number
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────
// master_characters (主要キャラマスタ、画像なし)
// ─────────────────────────────────────────
export interface MasterCharacter {
  id: string                         // slug PK
  work_id: string                    // master_works.id への参照
  display_name_ja: string
  display_name_en: string | null
  aliases: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────
// master_item_types (アイテム種別マスタ、ハイブリッド = フリー入力許容)
// 設計: 当初は cards.item_type の CHECK enum 案だったが、
// 「ガチャガチャ系が今熱い」「今後どんどん追加していけるように」の指摘を受けマスタ化
// ─────────────────────────────────────────
export interface MasterItemType {
  id: string                         // slug PK (例: 'acrylic_stand', 'can_badge', 'gacha')
  display_name_ja: string
  display_name_en: string | null
  aliases: string[]
  category_hint: MasterCategory | null  // 主な使用カテゴリのヒント
  sort_order: number
  is_active: boolean                 // 廃止フラグ
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────
// user_keyword_history (検索/入力履歴、master 拡張判断材料)
// ─────────────────────────────────────────
export interface UserKeywordHistory {
  id: string                         // uuid
  user_id: string
  keyword: string
  source: KeywordHistorySource
  searched_at: string
}

// ─────────────────────────────────────────
// offer_items
// ─────────────────────────────────────────
export interface OfferItem {
  id: string
  offer_id: string
  card_id: string
  created_at?: string
  card?: Card
}

// ─────────────────────────────────────────
// trades
// ─────────────────────────────────────────
export interface Trade {
  id: string
  offer_id?: string
  proposer_user_id?: string
  receiver_user_id?: string
  status: TradeStatus
  ship_deadline_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
  created_at?: string
  updated_at?: string
  offer?: Offer
}

// ─────────────────────────────────────────
// offers
// ─────────────────────────────────────────
export interface Offer {
  id: string
  proposer_user_id: string
  target_card_id: string
  status: OfferStatus
  message: string | null
  adjustment_amount: number | null
  parent_offer_id: string | null
  created_at: string
  updated_at?: string

  proposer?: Profile
  target_card?: Card
  items?: OfferItem[]
  trade?: Trade | null
}

// ─────────────────────────────────────────
// wanted_cards
// ─────────────────────────────────────────
export type WantedCardStatus = 'active' | 'fulfilled' | 'archived'

export interface WantedCard {
  id: string
  user_id: string
  card_name: string
  group_name: string | null
  member_name: string | null
  series: string | null
  status: WantedCardStatus
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────
// shelf_items
// ─────────────────────────────────────────

export interface ShelfItem {
  id: string
  user_id: string
  card_name: string
  group_name: string | null
  member_name: string | null
  series: string | null
  note: string | null
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────
// user_oshi
// ─────────────────────────────────────────

export interface UserOshi {
  id: string
  user_id: string
  group_name: string
  member_name: string | null
  created_at: string
}

// ─────────────────────────────────────────
// venue
// ─────────────────────────────────────────

export type VenueStatus = 'upcoming' | 'open' | 'closed'
export type SupplyPostStatus = 'active' | 'withdrawn' | 'held'
export type VenueHoldStatus = 'pending' | 'held' | 'expired' | 'cancelled' | 'converted'
export type VenueTradeStatus = 'pending' | 'proposer_confirmed' | 'completed' | 'cancelled'

export interface Venue {
  id: string
  title: string
  venue_name: string
  event_date: string
  starts_at: string | null
  ends_at: string | null
  status: VenueStatus
  created_at: string
}

export interface VenueCheckin {
  id: string
  venue_id: string
  user_id: string
  created_at: string
}

export interface VenueSupplyPost {
  id: string
  venue_id: string
  user_id: string
  card_name: string
  group_name: string | null
  want_card: string | null
  status: SupplyPostStatus
  expires_at: string
  created_at: string
  poster?: {
    handle: string | null
    display_name: string | null
    trade_count: number
    ship_rate: number
    trouble_count: number
  }
}

export interface VenueHold {
  id: string
  venue_id: string
  proposer_id: string
  receiver_id: string
  proposer_card: string
  receiver_card: string
  supply_post_id: string | null
  status: VenueHoldStatus
  expires_at: string
  created_at: string
  updated_at: string
}

export interface VenueTrade {
  id: string
  venue_id: string
  hold_id: string
  proposer_id: string
  receiver_id: string
  proposer_card: string
  receiver_card: string
  status: VenueTradeStatus
  proposer_confirmed_at: string | null
  receiver_confirmed_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type WantMatchScore = 'strong' | 'medium' | 'weak' | 'none' // ★ added

// ★ added: 正規化＋strong/medium/weak の段階的一致スコアリング
export function scoreWantMatch(card: Card, want: WantedCard): WantMatchScore {
  const cardText = [card.name, card.group_name, card.member_name, card.series]
    .filter(Boolean).join(' ')
  const wantText = [want.card_name, want.group_name, want.member_name, want.series]
    .filter(Boolean).join(' ')

  const cardParsed = parseWantText(cardText)
  const wantParsed = parseWantText(wantText)

  const groupMatch =
    cardParsed.parsedGroupName !== null &&
    wantParsed.parsedGroupName !== null &&
    cardParsed.parsedGroupName === wantParsed.parsedGroupName

  const memberMatch =
    cardParsed.parsedMemberName !== null &&
    wantParsed.parsedMemberName !== null &&
    cardParsed.parsedMemberName === wantParsed.parsedMemberName

  // ★ updated: 両者null or 完全一致のみ strong。片方nullは medium へ落とす。
  const seriesExactMatch =
    cardParsed.parsedSeries === wantParsed.parsedSeries

  const bothSeriesNull =
    cardParsed.parsedSeries === null && wantParsed.parsedSeries === null

  if (groupMatch && memberMatch && (seriesExactMatch || bothSeriesNull)) return 'strong'
  if (groupMatch && memberMatch) return 'medium'
  // ★ updated: card側はDB構造化データのためconfidence判定不要。want側のみで判定。
  if (memberMatch && wantParsed.parseConfidence >= 0.60) return 'weak'
  return 'none'
}

// ★ updated: scoreWantMatch を内部で呼ぶ。既存呼び出し元との互換を維持。
export function isWantMatch(card: Card, want: WantedCard): boolean {
  return scoreWantMatch(card, want) !== 'none'
}

// ─────────────────────────────────────────
// Trustバッジ判定
// ─────────────────────────────────────────

// last_active_at が指定日数以内なら true（computeTrustBadge 内部用ヘルパー）
function isRecentlyActive(lastActiveAt: string | null, days: number): boolean {
  if (lastActiveAt == null) return false
  const diffMs = Date.now() - new Date(lastActiveAt).getTime()
  return diffMs < days * 24 * 60 * 60 * 1000
}

export function computeTrustBadge(
  profile: Pick<
    Profile,
    | 'trade_count'
    | 'ship_rate'
    | 'reply_median_hours'
    | 'trouble_count'
    | 'last_active_at'
  >
): TrustBadgeLevel {
  const { trade_count, ship_rate, trouble_count, last_active_at } = profile

  // gold_blue: 50件以上 + 97%以上 + 直近60日アクティブ
  if (
    trade_count >= 50 &&
    ship_rate >= 97 &&
    isRecentlyActive(last_active_at, 60)
  ) {
    return 'gold_blue'
  }

  // blue: 10件以上 + 95%以上 + トラブル0件
  if (trade_count >= 10 && ship_rate >= 95 && trouble_count === 0) {
    return 'blue'
  }

  // trial_blue: 1〜9件
  if (trade_count >= 1) {
    return 'trial_blue'
  }

  // green: 取引なし
  return 'green'
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
  completed: '完了',
}

export const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
  pending: '発送待ち',
  in_transit: '発送中',
  partially_received: '一部受取',
  completed: '完了',
  cancelled: 'キャンセル',
  disputed: 'トラブル',
}

// バッジ表示ラベルの単一情報源（TrustBadge / offer-insights / 他で共有）
export const TRUST_BADGE_LABELS: Record<TrustBadgeLevel, string> = {
  green: '新規',
  trial_blue: 'お試し',
  blue: '安定',
  gold_blue: '高信頼',
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

// ─────────────────────────────────────────
// 成立ログ（accept率分析用）
// 開発・分析用。ユーザー向け機能ではない。
// ─────────────────────────────────────────

/**
 * 1件の提案に関する結果ログ。
 *
 * 注意事項:
 * - accepted_at の実体は trade.created_at（accept_offer_atomic_v3 が trade を作成するため近似）
 * - declined_at の実体は offer.updated_at（status 更新時刻を近似として使用）
 * - adjustment_amount は現在 createOffer が DB に保存していないため欠落（未実装）
 * - target_card_allows_adjustment は相手カードの差額設定であり、実際の提案に差額が含まれたかの代理値
 */
export interface OfferOutcomeLog {
  // 識別
  offer_id: string
  offer_created_at: string
  offer_updated_at: string  // declined/cancelled 時刻の近似値
  offer_status: OfferStatus

  // 当事者
  proposer_user_id: string
  receiver_user_id: string | null  // target_card.owner_user_id から導出

  // カード
  target_card_id: string
  target_card_name: string | null
  target_card_allows_adjustment: boolean  // 相手カードの差額設定（代理値）
  offered_card_ids: string[]             // target_card_id を除いた offer_items
  offered_card_names: string[]

  // 補助
  has_message: boolean

  // Trust帯（profiles から後計算）
  proposer_trust_level: TrustBadgeLevel
  receiver_trust_level: TrustBadgeLevel

  // Trade
  trade_id: string | null
  trade_status: TradeStatus | null
  trade_created_at: string | null   // accepted_at の近似値
  trade_completed_at: string | null
  trade_cancelled_at: string | null
}

/** 複数の OfferOutcomeLog を集計したサマリ */
export interface OfferOutcomeSummary {
  total: number
  accepted: number   // status: accepted または completed
  declined: number
  cancelled: number
  pending: number    // まだ結果が出ていない提案
  /** accepted / (accepted + declined + cancelled) */
  acceptRate: number

  // 差額条件別（target_card.allows_adjustment ベース）
  adjustmentAllowed: { total: number; accepted: number; acceptRate: number }
  adjustmentNotAllowed: { total: number; accepted: number; acceptRate: number }

  // Trust帯別（proposer）
  byProposerTrust: Record<TrustBadgeLevel, { total: number; accepted: number; acceptRate: number }>
  // Trust帯別（receiver）
  byReceiverTrust: Record<TrustBadgeLevel, { total: number; accepted: number; acceptRate: number }>

  // メッセージ有無別
  withMessage: { total: number; accepted: number; acceptRate: number }
  withoutMessage: { total: number; accepted: number; acceptRate: number }
}
