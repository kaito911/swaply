// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import { ALL_MEMBERS, MemberMaster } from '../constants/members'
import {
  Card,
  CardWantedLink,
  CardWantedLinkWithWantedCard,
  LikedCard,
  LikedCardWithCard,
  computeTrustBadge,
  Offer,
  OfferOutcomeLog,
  OfferOutcomeSummary,
  OfferStatus,
  Profile,
  ShelfItem,
  TradeStatus,
  TrustBadgeLevel,
  UserOshi,
  SupplyPostStatus,
  Venue,
  VenueCheckin,
  VenueHold,
  VenueSupplyPost,
  VenueTrade,
  VenueTradeStatus,
  WantedCard,
  WantMatchScore,
} from './types'
import { scoreWantMatchV2 } from './matcher' // ★ Step 3 commit 3: v1 → v2 切替
import { findCharacterIdsByText, findItemTypeIdsByText, getWorkById } from './master' // searchCards 経路 2 の master fuzzy 解決 + 経路 1 work_id legacy fallback の aliases 取得
import { computeVenueExpiry } from './venueExpiry' // 会場出品 / Hold のイベント当日中有効 expires_at 計算
import { readAsStringAsync } from 'expo-file-system/legacy'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─────────────────────────────────────────
// Home screen
// ─────────────────────────────────────────

export async function fetchNewCards(
  limit = 20,
  excludeOwnerIds: string[] = [],
): Promise<Card[]> {
  let query = supabase
    .from('cards')
    .select('*, owner:profiles(*)')
    .eq('status', 'active')

  if (excludeOwnerIds.length > 0) {
    query = query.not('owner_user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchNewCards]', error)
    return []
  }

  return (data ?? []) as Card[]
}

// ─────────────────────────────────────────
// 成立しやすさスコア（クライアントサイド並び替え用）
// 既存 Profile データのみ使用。DB変更・RPC追加なし。
// ─────────────────────────────────────────

function easyScore(card: Card, myWants: WantedCard[]): number {
  const owner = card.owner
  if (owner == null) return 0

  let score = 0

  // トラブルがある出品者は後方へ（完全除外ではなく減点。β初期はデータが荒いため）
  if (owner.trouble_count > 0) score -= 50

  // 発送遵守率（最重要: 実際に物が届くかの指標）
  if (owner.ship_rate >= 95) score += 30
  else if (owner.ship_rate >= 90) score += 15

  // 返信速度（アクティブ度の代理指標）
  if (owner.reply_median_hours <= 12) score += 20
  else if (owner.reply_median_hours <= 24) score += 10
  else if (owner.reply_median_hours <= 72) score += 5

  // 成立件数（初心者も排除しない: 0件でもスコア減点なし）
  if (owner.trade_count >= 50) score += 20
  else if (owner.trade_count >= 10) score += 15
  else if (owner.trade_count >= 3) score += 10

  // 直近アクティブ（最近ログインしている出品者は返答可能性が高い）
  if (owner.last_active_at != null) {
    const diffHours =
      (Date.now() - new Date(owner.last_active_at).getTime()) / 3_600_000
    if (diffHours < 24) score += 25
    else if (diffHours < 72) score += 15
    else if (diffHours < 168) score += 5
  }

  // ★ Step 3 commit 3: scoreWantMatchV2 (any-overlap + overlap 数重み付け)
  // characters[] 空 → wantParserMatcher v1 fallback (legacy K-POP 用、本ファイル import 不要、v2 内で委譲)
  const bestMatch = myWants.reduce<WantMatchScore>((best, want) => {
    const s = scoreWantMatchV2(card, want)
    if (s === 'strong') return 'strong'
    if (s === 'medium' && best !== 'strong') return 'medium'
    if (s === 'weak' && best === 'none') return 'weak'
    return best
  }, 'none')

  if (bestMatch === 'strong') score += 60
  else if (bestMatch === 'medium') score += 40
  else if (bestMatch === 'weak') score += 20

  return score
}

function sortEasyCards(cards: Card[], myWants: WantedCard[]): Card[] {
  return [...cards].sort((a, b) => easyScore(b, myWants) - easyScore(a, myWants))
}

// ─────────────────────────────────────────

// myWants は呼び出し元（home.tsx）で取得して渡す。データ取得責務の分離のため。
export async function fetchEasyCards(
  userId?: string,
  myWants: WantedCard[] = [],
  excludeOwnerIds: string[] = [],
): Promise<Card[]> {
  // 多めに取得してクライアントサイドでスコアソート後に20件に絞る
  let query = supabase
    .from('cards')
    .select('*, owner:profiles(*)')
    .eq('status', 'active')
    .eq('allows_adjustment', false)

  if (userId != null) {
    query = query.neq('owner_user_id', userId)
  }
  if (excludeOwnerIds.length > 0) {
    query = query.not('owner_user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) {
    console.error('[fetchEasyCards]', error)
    return []
  }

  return sortEasyCards((data ?? []) as Card[], myWants).slice(0, 20)
}

export async function fetchRecommendedCards(
  userId: string,
  limit = 20,
  excludeOwnerIds: string[] = [],
): Promise<Card[]> {
  let query = supabase
    .from('cards')
    .select('*, owner:profiles(*)')
    .eq('status', 'active')
    .neq('owner_user_id', userId)

  if (excludeOwnerIds.length > 0) {
    query = query.not('owner_user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchRecommendedCards]', error)
    return []
  }

  return (data ?? []) as Card[]
}

// ─────────────────────────────────────────
// Listing detail
// ─────────────────────────────────────────

export async function fetchCard(cardId: string): Promise<Card | null> {
  const { data, error } = await supabase
    .from('cards')
    .select('*, owner:profiles(*)')
    .eq('id', cardId)
    .single()

  if (error) {
    console.error('[fetchCard]', error)
    return null
  }

  return data as Card
}

// ─────────────────────────────────────────
// Trust profile
// ─────────────────────────────────────────

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('[fetchProfile]', error)
    return null
  }

  return data as Profile
}

export async function fetchUserCards(
  userId: string,
  statusFilter: 'active' | 'all' = 'active'
): Promise<Card[]> {
  let query = supabase.from('cards').select('*').eq('owner_user_id', userId)

  if (statusFilter === 'active') {
    query = query.eq('status', 'active')
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchUserCards]', error)
    return []
  }

  return (data ?? []) as Card[]
}

// ─────────────────────────────────────────
// Likes (UI 上は「いいね」、♡ ボタン専用、DB: liked_cards)
//
// 求リスト (wanted_cards) とは別概念。matcher / easyScore / searchWantedCards /
// searchDirectMatch では使わない。純 UI 用途 (保存 / 参照) のみ。
// 詳細: docs/migration_rename_bookmarks_to_liked_cards.sql / lib/types.ts LikedCard
// ─────────────────────────────────────────

/**
 * いいね追加 (冪等 upsert)。
 * UNIQUE (user_id, card_id) 制約により重複 INSERT は 23505 を投げない。
 * onConflict 指定で既存行があれば no-op 動作。
 */
export async function addLike(
  userId: string,
  cardId: string,
): Promise<LikedCard> {
  const { data, error } = await supabase
    .from('liked_cards')
    .upsert(
      { user_id: userId, card_id: cardId },
      { onConflict: 'user_id,card_id' },
    )
    .select()
    .single()

  if (error) throw error
  return data as LikedCard
}

/** いいね削除 (存在しなくてもエラーにしない) */
export async function removeLike(
  userId: string,
  cardId: string,
): Promise<void> {
  const { error } = await supabase
    .from('liked_cards')
    .delete()
    .eq('user_id', userId)
    .eq('card_id', cardId)

  if (error) throw error
}

/**
 * 自分のいいね一覧 (card + owner を join、created_at DESC)。
 * /likes 画面の listing preview 表示用。
 */
export async function fetchMyLikedCards(
  userId: string,
): Promise<LikedCardWithCard[]> {
  const { data, error } = await supabase
    .from('liked_cards')
    .select('*, card:cards(*, owner:profiles(*))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchMyLikedCards]', error)
    return []
  }
  return (data ?? []) as unknown as LikedCardWithCard[]
}

/**
 * ♡ button の isLiked 判定用に card_id だけを Set で返す高速版。
 * home.tsx / listing/[id].tsx の optimistic state 初期化で使う。
 */
export async function fetchMyLikedCardIds(
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('liked_cards')
    .select('card_id')
    .eq('user_id', userId)

  if (error) {
    console.error('[fetchMyLikedCardIds]', error)
    return new Set()
  }
  return new Set((data ?? []).map((r) => r.card_id as string))
}

// ─────────────────────────────────────────
// Wanted cards (需要DB)
// ─────────────────────────────────────────

export async function fetchMyWantedCards(userId: string): Promise<WantedCard[]> {
  const { data, error } = await supabase
    .from('wanted_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchMyWantedCards]', error)
    return []
  }

  return (data ?? []) as WantedCard[]
}

/**
 * ほしいカード追加 (冪等 upsert)
 *
 * 冪等性の根拠:
 *   DB 制約 wanted_cards_unique_per_user = (user_id, card_name, group_name, member_name, series)
 *   が既に存在する場合、upsert で既存行を更新 (status='active' に戻す = archived からの復活も兼ねる)。
 *   重複 INSERT で 23505 (duplicate key) を投げない設計。
 *
 * 経緯:
 *   ホーム ♡ tap 時に「UI 上 ♡ outline (未 like) だが DB には既存行あり」のケースで
 *   INSERT が衝突するバグ (2026-05-23 発覚) を修正。
 *   呼出元: home.tsx / listing[id].tsx / onboarding.tsx の 3 箇所すべて冪等化される。
 */
export async function addWantedCard(params: {
  userId: string
  cardName: string
  groupName: string | null
  memberName: string | null
  series: string | null
  // Phase B-1: 参考画像 URL (任意、optional)
  //   - undefined: payload に含めない → 新規行は NULL、既存行は image_url 保持
  //   - null:      payload に image_url=null を明示 (画像を外したい時)
  //   - string:    payload に image_url=URL を投入
  imageUrl?: string | null
}): Promise<WantedCard> {
  const payload: Record<string, unknown> = {
    user_id: params.userId,
    card_name: params.cardName,
    group_name: params.groupName,
    member_name: params.memberName,
    series: params.series,
    status: 'active',
  }
  // 既存呼出 (onboarding 等、imageUrl 未指定) を壊さないため undefined のときは
  // payload に image_url を含めない (= upsert で既存値を保持 / 新規は NULL)。
  if (params.imageUrl !== undefined) {
    payload.image_url = params.imageUrl
  }

  const { data, error } = await supabase
    .from('wanted_cards')
    .upsert(payload, {
      onConflict: 'user_id,card_name,group_name,member_name,series',
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as WantedCard
}

// ─────────────────────────────────────────
// 求 ⇄ 譲 並列検索 (Pioneer #001 提案、2026-05)
// 「譲 + 求 並列検索」で交換相手を一発で発見する Swaply の核心機能
// ─────────────────────────────────────────

/** 求検索結果: WantedCard + 所有者 Profile */
export type WantedCardWithOwner = WantedCard & { owner: Profile }

/** 求検索: wanted_cards から検索者の譲商品名で検索、所有者 Profile を join */
export async function searchWantedCards(params: {
  query: string
  excludeUserId?: string | null
  excludeOwnerIds?: string[]
  limit?: number
}): Promise<WantedCardWithOwner[]> {
  const q = params.query.trim()
  if (q === '') return []

  let query = supabase
    .from('wanted_cards')
    .select('*, owner:profiles!wanted_cards_user_id_fkey(*)')
    .ilike('card_name', `%${q}%`)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.excludeUserId != null && params.excludeUserId !== '') {
    query = query.neq('user_id', params.excludeUserId)
  }
  const excludeOwnerIds = params.excludeOwnerIds ?? []
  if (excludeOwnerIds.length > 0) {
    // wanted_cards テーブルは user_id 列 (owner_user_id ではない)
    query = query.not('user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) {
    console.error('[searchWantedCards]', error)
    return []
  }
  return (data ?? []) as unknown as WantedCardWithOwner[]
}

/** 直接交換マッチング結果: 相手の Profile + 提供 card + 求 want */
export interface DirectMatchResult {
  user: Profile
  offering_card: Card    // 相手が持っている card (検索者の求と一致)
  wanted_card: WantedCard // 相手が欲しがっている want (検索者の譲と一致)
}

/**
 * 直接交換マッチング: 譲 + 求 並列検索 (Pioneer #001 提案)
 *
 * クエリ意味論:
 *   - userWants (= 検索者が欲しい) と cards.name を ILIKE → 相手の提供候補
 *   - userOffers (= 検索者が出す) と wanted_cards.card_name を ILIKE → 相手の欲求
 *   - 上記両方を同一ユーザーが満たす場合に「相互交換可能」と判定
 *
 * 実装: 2 段階 fetch + client-side join (Postgres function 化は Phase 2 で検討)
 *   1. cards (status=active) を userWants で ILIKE 検索、owner_user_id の集合取得
 *   2. その owner 集合に対して wanted_cards を userOffers で ILIKE 検索
 *   3. JS でユーザー単位に pair してマッチング結果生成
 */
export async function searchDirectMatch(params: {
  userOffers: string
  userWants: string
  excludeUserId?: string | null
  excludeOwnerIds?: string[]
  limit?: number
}): Promise<DirectMatchResult[]> {
  const userOffers = params.userOffers.trim()
  const userWants = params.userWants.trim()
  if (userOffers === '' || userWants === '') return []

  const excludeOwnerIds = params.excludeOwnerIds ?? []
  const excludeFilter =
    excludeOwnerIds.length > 0 ? `(${excludeOwnerIds.join(',')})` : null

  // Step 1: cards (相手が持っている、検索者が欲しい商品名) を取得
  let cardsQuery = supabase
    .from('cards')
    .select('*, owner:profiles!cards_owner_user_id_fkey(*)')
    .ilike('name', `%${userWants}%`)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100)

  if (params.excludeUserId != null && params.excludeUserId !== '') {
    cardsQuery = cardsQuery.neq('owner_user_id', params.excludeUserId)
  }
  if (excludeFilter != null) {
    cardsQuery = cardsQuery.not('owner_user_id', 'in', excludeFilter)
  }

  const { data: cardsData, error: cardsError } = await cardsQuery
  if (cardsError) {
    console.error('[searchDirectMatch] cards', cardsError)
    return []
  }
  if (cardsData == null || cardsData.length === 0) return []

  // Step 2: candidate user 集合に対して wanted_cards を検索者の譲で照合
  const candidateUserIds = Array.from(
    new Set(
      (cardsData as { owner_user_id: string }[]).map((c) => c.owner_user_id),
    ),
  )

  const { data: wantsData, error: wantsError } = await supabase
    .from('wanted_cards')
    .select('*')
    .ilike('card_name', `%${userOffers}%`)
    .eq('status', 'active')
    .in('user_id', candidateUserIds)

  if (wantsError) {
    console.error('[searchDirectMatch] wants', wantsError)
    return []
  }
  if (wantsData == null || wantsData.length === 0) return []

  // Step 3: client-side join (ユーザー単位、最初の card + 最初の want を pair)
  const wantsByUser = new Map<string, WantedCard[]>()
  for (const w of wantsData as WantedCard[]) {
    const arr = wantsByUser.get(w.user_id) ?? []
    arr.push(w)
    wantsByUser.set(w.user_id, arr)
  }

  const results: DirectMatchResult[] = []
  const usedUserIds = new Set<string>()
  for (const cardRow of cardsData as Array<Card & { owner: Profile | null }>) {
    if (usedUserIds.has(cardRow.owner_user_id)) continue
    const userWants = wantsByUser.get(cardRow.owner_user_id)
    if (userWants == null || userWants.length === 0) continue
    if (cardRow.owner == null) continue
    usedUserIds.add(cardRow.owner_user_id)
    results.push({
      user: cardRow.owner,
      offering_card: cardRow,
      wanted_card: userWants[0]!,
    })
  }

  return results.slice(0, params.limit ?? 50)
}

export async function archiveWantedCard(wantId: string): Promise<void> {
  const { error } = await supabase
    .from('wanted_cards')
    .update({ status: 'archived' })
    .eq('id', wantId)

  if (error) {
    throw error
  }
}

// ─────────────────────────────────────────
// Card-wanted links (出品と求リストの紐付け)
//
// 出品 (cards) × 求リスト (wanted_cards) の N:N 中間テーブル。
// 出品作成時に「この出品で受け付ける求」を求リストから複数選択して紐付ける。
// 詳細: docs/migration_card_wanted_links.sql / lib/types.ts CardWantedLink
//
// 非用途:
//   - matcher / easyScore / searchWantedCards / searchDirectMatch では使わない (Phase 1)
//   - liked_cards (いいね) とは別概念、混在させない
// ─────────────────────────────────────────

/**
 * 指定 card_id に対して、wantedCardIds 複数件を bulk 紐付け。
 *
 * 冪等性:
 *   UNIQUE (card_id, wanted_card_id) の重複は upsert + ignoreDuplicates で no-op 扱い。
 *   既存 link がある場合、新規 row は返らない (data には新規 INSERT 分のみ含まれる)。
 *
 * 整合性 (アプリ層担保):
 *   - ownerUserId は呼出側で auth.uid() と一致させる (RLS でも auth.uid() = owner_user_id 検査)
 *   - card_id の owner と wantedCardIds の user_id が ownerUserId と一致することは
 *     呼出側責任 (本関数では検査しない)
 *
 * @returns 新規 INSERT された link 行の配列 (重複 skip 分は含まない)
 */
export async function addCardWantedLinks(params: {
  cardId: string
  wantedCardIds: string[]
  ownerUserId: string
}): Promise<CardWantedLink[]> {
  if (params.wantedCardIds.length === 0) return []

  const rows = params.wantedCardIds.map((wcId) => ({
    card_id: params.cardId,
    wanted_card_id: wcId,
    owner_user_id: params.ownerUserId,
  }))

  const { data, error } = await supabase
    .from('card_wanted_links')
    .upsert(rows, {
      onConflict: 'card_id,wanted_card_id',
      ignoreDuplicates: true,
    })
    .select()

  if (error) {
    throw error
  }
  return (data ?? []) as CardWantedLink[]
}

/**
 * 指定 card_id の紐付き wanted_cards を取得 (active のみ)。
 * 出品詳細画面で「この出品者がとくに求めているもの」表示用。
 *
 * archived フィルタは Supabase の join select でも書けるが、RLS との相互作用 + JS 側で
 * 簡単に判定できるため、クライアント側で `wanted_card.status === 'active'` で filter する。
 * Phase 1 では archived 紐付けは表示対象外 (運用方針)、データ自体は残置。
 *
 * RLS 前提:
 *   - card_wanted_links: Anyone read (誰でも紐付き行を取得可能)
 *   - wanted_cards:      Anyone read linked (紐付き行に限り公開、その他は本人 private)
 *   - 結果: 他ユーザーが他人の出品を見た時に紐付き wanted_cards だけ表示される
 */
export async function fetchCardLinkedWants(
  cardId: string,
): Promise<CardWantedLinkWithWantedCard[]> {
  const { data, error } = await supabase
    .from('card_wanted_links')
    .select('*, wanted_card:wanted_cards(*)')
    .eq('card_id', cardId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[fetchCardLinkedWants]', error)
    return []
  }

  const rows = (data ?? []) as unknown as CardWantedLinkWithWantedCard[]
  // active のみクライアント側で filter (archived は表示対象外、Phase 1 方針)
  return rows.filter((r) => r.wanted_card != null && r.wanted_card.status === 'active')
}

/**
 * 紐付き 1 件を削除。
 *
 * owner_user_id 条件は RLS でも auth.uid() で担保されているが、二重防御として
 * 明示的に WHERE 句に含める (RLS 設定漏れ / 将来 policy 変更時の事故予防)。
 */
export async function removeCardWantedLink(params: {
  linkId: string
  ownerUserId: string
}): Promise<void> {
  const { error } = await supabase
    .from('card_wanted_links')
    .delete()
    .eq('id', params.linkId)
    .eq('owner_user_id', params.ownerUserId)

  if (error) {
    throw error
  }
}

/**
 * 指定 card_id の紐付きを丸ごと差し替える (編集画面用)。
 *
 * 既存 links を delete → 新規 wanted_card_ids を bulk insert の 2 段階。
 * トランザクション化は将来 RPC で対応検討、Phase 1 は逐次実行 (delete 失敗時は
 * 例外を投げて insert に進まない)。
 *
 * owner_user_id 条件で「自分の link だけ」を delete 対象に絞る (RLS と二重防御)。
 */
export async function replaceCardWantedLinks(params: {
  cardId: string
  wantedCardIds: string[]
  ownerUserId: string
}): Promise<CardWantedLink[]> {
  const { error: deleteError } = await supabase
    .from('card_wanted_links')
    .delete()
    .eq('card_id', params.cardId)
    .eq('owner_user_id', params.ownerUserId)

  if (deleteError) {
    throw deleteError
  }

  if (params.wantedCardIds.length === 0) return []

  return addCardWantedLinks({
    cardId: params.cardId,
    wantedCardIds: params.wantedCardIds,
    ownerUserId: params.ownerUserId,
  })
}

// ─────────────────────────────────────────
// Card creation
// ─────────────────────────────────────────

export async function createCard(params: {
  ownerUserId: string
  name: string
  imageUrl: string | null
  series: string | null
  memberName: string | null
  wantDescription: string | null
  description: string | null
  // 3.5c Phase 1: 求の構造化 (全 optional、未指定時は DB DEFAULT '{}' に任せる)
  wantCharacters?: string[]
  wantItemTypes?: string[]
  wantWorks?: string[]
}): Promise<Card> {
  const insertRow: Record<string, unknown> = {
    owner_user_id: params.ownerUserId,
    name: params.name,
    series: params.series,
    member_name: params.memberName,
    group_name: null,
    image_url: params.imageUrl,
    description: params.description,
    status: 'active',
    condition: null,
    want_description: params.wantDescription,
    allows_adjustment: false,
    adjustment_max: null,
    allows_mail: true,
    allows_handoff: true,
  }
  if (params.wantCharacters != null) insertRow.want_characters = params.wantCharacters
  if (params.wantItemTypes != null) insertRow.want_item_types = params.wantItemTypes
  if (params.wantWorks != null) insertRow.want_works = params.wantWorks

  const { data, error } = await supabase
    .from('cards')
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as Card
}

// ─────────────────────────────────────────
// Offer creation
// ─────────────────────────────────────────

// β1 複数枚提案: 1 receiver card に対して N proposer cards (1-5 枚) を提案できる。
// accept_offer_atomic_v3 RPC は array_agg + competing offers cancel で N 枚対応済 (Dashboard 上で確認済)。
// M target × N proposer (相手側複数) は未対応 (offers.target_card_id が単一列のため)。
export const MAX_PROPOSER_CARDS_PER_OFFER = 5

export async function createOffer(params: {
  proposerId: string
  receiverId: string
  proposerCardIds: string[]
  receiverCardId: string
  adjustmentAmount: number | null
  message: string | null
  parentOfferId?: string | null
}): Promise<Offer> {
  // ── 入力検証 (複数枚) ──
  if (params.proposerId === params.receiverId) {
    throw new Error('自分の出品には提案できません')
  }

  // Phase 0 追加防御 (2026-06-05): 自分がブロックした相手への自己誤提案を防ぐ。
  // user_blocks RLS は blocker_id = auth.uid() のみ select 可能なため、
  // 「B が A をブロックしているとき A から B への提案を拒否」する完全双方向化は
  // 別途 RPC 化が必要 (Phase 1 以降検討)。本チェックは A 側で誤操作を防ぐ最小限。
  const myBlockedIds = await fetchMyBlockedUserIds()
  if (myBlockedIds.includes(params.receiverId)) {
    throw new Error('ブロックしている相手には提案できません。ブロックを解除してから再度お試しください。')
  }

  if (params.proposerCardIds.length === 0) {
    throw new Error('交換に出すカードを1枚以上選んでください')
  }

  // 重複排除 (UI の二重 tap や呼び出し側の重複を黙って吸収)
  const dedupedProposerCardIds = Array.from(new Set(params.proposerCardIds))

  if (dedupedProposerCardIds.length > MAX_PROPOSER_CARDS_PER_OFFER) {
    throw new Error(`交換に出すカードは最大${MAX_PROPOSER_CARDS_PER_OFFER}枚までです`)
  }

  if (dedupedProposerCardIds.includes(params.receiverCardId)) {
    throw new Error('相手のカードと同じカードは選べません')
  }

  // ── 相手カード検証 (1 枚) ──
  const { data: currentTargetCard, error: targetCardError } = await supabase
    .from('cards')
    .select('id, owner_user_id, status')
    .eq('id', params.receiverCardId)
    .single()

  if (targetCardError) {
    throw targetCardError
  }

  if (!currentTargetCard || currentTargetCard.status !== 'active') {
    throw new Error('この出品は現在提案できません')
  }

  if (currentTargetCard.owner_user_id !== params.receiverId) {
    throw new Error('相手カードの所有者情報が不正です')
  }

  // ── 自分カード検証 (N 枚一括) ──
  const { data: proposerCardRows, error: proposerCardsError } = await supabase
    .from('cards')
    .select('id, owner_user_id, status')
    .in('id', dedupedProposerCardIds)

  if (proposerCardsError) {
    throw proposerCardsError
  }

  if (proposerCardRows == null || proposerCardRows.length !== dedupedProposerCardIds.length) {
    throw new Error('選択したカードの一部が見つかりません')
  }

  for (const row of proposerCardRows) {
    if (row.status !== 'active') {
      throw new Error('選択したあなたのカードは現在提案に使えません')
    }
    if (row.owner_user_id !== params.proposerId) {
      throw new Error('自分が所有していないカードは提案に使えません')
    }
  }

  // ── offers INSERT ──
  const { data: offer, error: offerError } = await supabase
    .from('offers')
    .insert({
      proposer_user_id: params.proposerId,
      target_card_id: params.receiverCardId,
      status: 'pending',
      message: params.message,
      adjustment_amount: params.adjustmentAmount ?? 0,
      parent_offer_id: params.parentOfferId ?? null,
    })
    .select()
    .single()

  if (offerError) {
    throw offerError
  }

  // ── offer_items INSERT (receiver 1 + proposer N) ──
  // accept_offer_atomic_v3 は target_card_id + offer_items 全件を atomic に処理するため、
  // 順序自体は機能に影響しないが、receiver を先頭に置く規約とする (リスト先頭が target).
  const offerItemsPayload = [
    { offer_id: offer.id, card_id: params.receiverCardId },
    ...dedupedProposerCardIds.map((id) => ({ offer_id: offer.id, card_id: id })),
  ]

  const { error: itemsError } = await supabase
    .from('offer_items')
    .insert(offerItemsPayload)

  if (itemsError) {
    console.error('[createOffer][offer_items insert failed]', itemsError)

    const { error: rollbackError } = await supabase
      .from('offers')
      .delete()
      .eq('id', offer.id)

    if (rollbackError) {
      console.error('[createOffer][rollback offer delete failed]', rollbackError)
    }

    throw itemsError
  }

  return offer as Offer
}

// ─────────────────────────────────────────
// 提案一覧
// ─────────────────────────────────────────

export async function fetchMyOffers(userId: string): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select(
      `
      *,
      trade:trades (
        id,
        status
      ),
      proposer:profiles!offers_proposer_user_id_fkey(*),
      target_card:cards!offers_target_card_id_fkey(
        *,
        owner:profiles(*)
      ),
      items:offer_items(
        *,
        card:cards(*)
      )
    `
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchMyOffers]', error)
    return []
  }

  const offers = (data ?? []) as Offer[]

  return offers.filter((offer) => {
    const proposerId = offer.proposer_user_id
    const receiverId = offer.target_card?.owner_user_id
    return proposerId === userId || receiverId === userId
  })
}

// 提案1件取得（fetchMyOffers と同等の SELECT で id 指定）
export async function fetchOfferById(offerId: string): Promise<Offer | null> {
  const { data, error } = await supabase
    .from('offers')
    .select(
      `
      *,
      trade:trades (
        id,
        status
      ),
      proposer:profiles!offers_proposer_user_id_fkey(*),
      target_card:cards!offers_target_card_id_fkey(
        *,
        owner:profiles(*)
      ),
      items:offer_items(
        *,
        card:cards(*)
      )
    `
    )
    .eq('id', offerId)
    .single()

  if (error) {
    console.error('[fetchOfferById]', error)
    return null
  }

  return data as Offer
}

// ─────────────────────────────────────────
// Offer actions
// ─────────────────────────────────────────

export async function acceptOffer(offerId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_offer_atomic_v3', {
    target_offer_id: offerId,
  })

  if (error) {
    throw error
  }
}

export async function declineOffer(offerId: string): Promise<void> {
  const { error } = await supabase
    .from('offers')
    .update({ status: 'declined' })
    .eq('id', offerId)

  if (error) {
    throw error
  }
}

// ─────────────────────────────────────────
// Trade detail / actions
// ─────────────────────────────────────────

export async function fetchTradeDetailByOffer(offerId: string): Promise<any> {
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  const userId = authData.user?.id ?? null
  if (!userId) {
    throw new Error('ログイン情報が取得できません')
  }

  const { data, error } = await supabase.rpc('get_trade_detail_by_offer', {
    p_offer_id: offerId,
  })

  if (error) {
    throw error
  }

  return data
}

// 配送方法 (β1):
//   - postal      = 普通郵便・ミニレター (追跡番号なし)
//   - click_post  = クリックポスト (追跡あり)
//   - letter_pack = レターパックライト / プラス (追跡あり)
//   - yamato      = ヤマト宅急便 (追跡あり)
//   - other       = その他
// shipments.shipping_method の CHECK 制約と同期。匿名配送 (Phase 1.5+) は anonymous_mail
// を将来 ALTER で追加する想定 (β1 では非対応)。
export type ShippingMethod =
  | 'postal'
  | 'click_post'
  | 'letter_pack'
  | 'yamato'
  | 'other'

export async function submitTradeShipment(params: {
  tradeId: string
  shippingMethod: ShippingMethod
  trackingNumber: string | null
  carrier: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('submit_trade_shipment', {
    p_trade_id: params.tradeId,
    p_tracking_number: params.trackingNumber,
    p_carrier: params.carrier,
    p_shipping_method: params.shippingMethod,
  })

  if (error) {
    throw error
  }
}

export async function confirmTradeReceipt(tradeId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_trade_receipt', {
    p_trade_id: tradeId,
  })

  if (error) {
    throw error
  }
}

export async function cancelTrade(
  tradeId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('cancel_trade_atomic', {
    p_trade_id: tradeId,
    p_user_id: userId,
  })

  if (error) {
    throw error
  }
}

export async function openTradeDispute(params: {
  tradeId: string
  userId: string
  disputeReason: string
  detailText?: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('open_trade_dispute', {
    p_trade_id: params.tradeId,
    p_user_id: params.userId,
    p_dispute_reason: params.disputeReason,
    p_detail_text: params.detailText ?? null,
  })

  if (error) {
    throw error
  }
}

// ─────────────────────────────────────────
// 通報 (reports)
// Phase 0 PR-B: 出品・ユーザーに対する通報を保存。
// 運営は service_role 経由で reports を確認 (β1 では DB 直接、管理画面は Phase 2+)。
// ─────────────────────────────────────────

export type ReportTargetType = 'card' | 'user'

/**
 * 通報を作成する。
 *
 * 制約 (migration_reports.sql の CHECK と整合):
 *   - reason: 1-100 文字
 *   - detail: 省略可、最大 2000 文字
 *   - target_type: 'card' | 'user'
 *
 * RLS:
 *   - INSERT は auth.uid() = reporter_id のみ許可
 *   - 未ログインの場合は呼び出し前に session を確認すること
 */
export async function createReport(params: {
  targetType: ReportTargetType
  targetId: string
  reason: string
  detail?: string | null
}): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) {
    throw authError
  }
  const reporterId = authData.user?.id
  if (reporterId == null) {
    throw new Error('AUTH_REQUIRED')
  }

  const trimmedReason = params.reason.trim()
  if (trimmedReason === '') {
    throw new Error('REASON_REQUIRED')
  }

  const cleanedDetail =
    params.detail != null && params.detail.trim() !== ''
      ? params.detail.trim()
      : null

  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    target_type: params.targetType,
    target_id: params.targetId,
    reason: trimmedReason,
    detail: cleanedDetail,
  })

  if (error) {
    throw error
  }
}

// ─────────────────────────────────────────
// ユーザーブロック (user_blocks)
// Phase 0 PR-C: 「自分がブロックした相手」を保存する単方向リスト。
// β1 では home / search / listing 一覧から相手の出品を除外する目的で使用。
// 既存 trade / offer / shipment への影響はなし (進行中取引は引き続き表示)。
// ─────────────────────────────────────────

/**
 * ユーザーをブロックする。
 *
 * 制約 (migration_user_blocks.sql):
 *   - blocker_id != blocked_user_id (自分自身は禁止)
 *   - UNIQUE (blocker_id, blocked_user_id) で重複ブロック回避
 *
 * 冪等性: UNIQUE 制約により、既存ブロックは重複作成されず 23505 エラー → 本関数では
 *   それを「既にブロック済」として無視する。
 *
 * RLS:
 *   - INSERT は auth.uid() = blocker_id のみ許可
 *   - 未ログインの場合は AUTH_REQUIRED を throw
 */
export async function addUserBlock(blockedUserId: string): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) {
    throw authError
  }
  const blockerId = authData.user?.id
  if (blockerId == null) {
    throw new Error('AUTH_REQUIRED')
  }
  if (blockerId === blockedUserId) {
    throw new Error('CANNOT_BLOCK_SELF')
  }

  const { error } = await supabase.from('user_blocks').insert({
    blocker_id: blockerId,
    blocked_user_id: blockedUserId,
  })

  if (error != null) {
    // 23505 (duplicate key) は「既にブロック済」として冪等扱い、上層では no-op
    if (error.code === '23505') {
      return
    }
    throw error
  }
}

/**
 * ユーザーのブロックを解除する。
 *
 * 解除は DELETE で実施 (UPDATE 不要、RLS でも UPDATE 拒否)。
 * 該当行がなければ no-op (DELETE は 0 行でも成功扱い)。
 */
export async function removeUserBlock(blockedUserId: string): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) {
    throw authError
  }
  const blockerId = authData.user?.id
  if (blockerId == null) {
    throw new Error('AUTH_REQUIRED')
  }

  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_user_id', blockedUserId)

  if (error != null) {
    throw error
  }
}

/**
 * 自分がブロックしたユーザー ID の一覧を取得する。
 *
 * 用途:
 *   - home / search / listing 一覧で blocked_user の出品を除外
 *   - 結果は string[] (UUID 配列)、空配列ならフィルタ不要
 *
 * 未ログイン時は空配列を返す (エラーにせず、defensive に動作)。
 */
export async function fetchMyBlockedUserIds(): Promise<string[]> {
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id
  if (userId == null) {
    return []
  }

  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_user_id')
    .eq('blocker_id', userId)

  if (error != null) {
    console.error('[fetchMyBlockedUserIds]', error)
    return []
  }

  return (data ?? []).map((row) => row.blocked_user_id as string)
}

// ─────────────────────────────────────────
// アカウント削除 (Phase 0 PR-D)
//
// アプリ内から自分のアカウントを削除する。
//   - profiles は物理削除せず匿名化保持 (相手側履歴の整合性のため)
//   - active trade (pending/accepted/in_transit/partially_received) があれば削除拒否
//   - Edge Function `delete-account` が RPC `delete_my_account` を呼び、最後に auth.users を削除
// ─────────────────────────────────────────

/**
 * 進行中の取引数を取得する (削除可否判定用)。
 *
 * 進行中とみなす trades.status: pending / in_transit / partially_received / disputed
 *   - 'accepted' は trade_status enum に存在しない (offers.status 側の値、
 *     accept_offer_atomic_v3 が trades 生成時に trades.status='pending' から開始)
 *   - 'disputed' (係争中) は Phase 0 外部レビュー指摘で追加 (2026-06-05)。
 *     係争中ユーザーが削除で逃げて相手 / 運営対応が破綻するのを防ぐ。
 *
 * 未ログイン時は 0 を返す (Edge Function 側で再判定するため defensive)。
 */
export async function fetchActiveTradeCount(): Promise<number> {
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData.user?.id
  if (userId == null) return 0

  const { count, error } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .or(`proposer_user_id.eq.${userId},receiver_user_id.eq.${userId}`)
    .in('status', ['pending', 'in_transit', 'partially_received', 'disputed'])

  if (error != null) {
    console.error('[fetchActiveTradeCount]', error)
    return 0
  }
  return count ?? 0
}

/**
 * アカウント削除 Edge Function を呼び出す。
 *
 * 成功時: Edge Function が auth.users を削除済。呼び出し側で signOut + login 画面遷移。
 *
 * エラー throw 文字列 (画面側で switch):
 *   - 'AUTH_REQUIRED'        : 未認証 (session 切れ等)
 *   - 'ACTIVE_TRADE_EXISTS'  : 進行中取引あり、削除不可
 *   - 'AUTH_DELETE_FAILED'   : RPC は完了 (匿名化済) だが auth 削除失敗、再実行可能
 *   - その他                 : 想定外、再試行を促す
 */
export async function deleteMyAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<
    | { ok: true }
    | { error: string; count?: number; message?: string }
  >('delete-account', {
    method: 'POST',
  })

  if (error != null) {
    // FunctionsHttpError 等。invoke のエラーは body が data に入ってくる場合があるため両方確認
    const body =
      data != null && typeof data === 'object' && 'error' in data
        ? data
        : null
    if (body != null && typeof body.error === 'string') {
      throw new Error(body.error)
    }
    console.error('[deleteMyAccount] invoke error', error)
    throw new Error('INTERNAL_ERROR')
  }

  if (data != null && typeof data === 'object' && 'error' in data) {
    throw new Error(data.error)
  }

  // data === { ok: true } → 削除成功
}

// ─────────────────────────────────────────
// 成立ログ（accept率分析用）
// 開発・分析用。ユーザー向け機能ではない。
// RLS により認証済みユーザーが関与する offer のみ取得される。
// ─────────────────────────────────────────

// Supabase クエリの生データ型（内部用）
type OfferOutcomeRaw = {
  id: string
  proposer_user_id: string
  target_card_id: string
  status: OfferStatus
  message: string | null
  created_at: string
  updated_at: string
  proposer: {
    trade_count: number
    ship_rate: number
    reply_median_hours: number
    trouble_count: number
    last_active_at: string | null
  } | null
  target_card: {
    name: string | null
    allows_adjustment: boolean
    owner_user_id: string
    owner: {
      trade_count: number
      ship_rate: number
      reply_median_hours: number
      trouble_count: number
      last_active_at: string | null
    } | null
  } | null
  items: Array<{
    card_id: string
    card: { name: string | null } | null
  }> | null
  trade: {
    id: string
    status: TradeStatus
    created_at: string
    completed_at: string | null
    cancelled_at: string | null
  } | null
}

/**
 * 提案の成立ログを取得する（開発・分析用）。
 *
 * @param userId - 指定した場合、そのユーザーが proposer または receiver の offer のみ返す。
 *                 省略した場合は RLS の範囲内で全件取得（認証ユーザーが関与する offer）。
 */
export async function fetchOfferOutcomeLogs(userId?: string): Promise<OfferOutcomeLog[]> {
  const { data, error } = await supabase
    .from('offers')
    .select(`
      id,
      proposer_user_id,
      target_card_id,
      status,
      message,
      created_at,
      updated_at,
      proposer:profiles!offers_proposer_user_id_fkey(
        trade_count,
        ship_rate,
        reply_median_hours,
        trouble_count,
        last_active_at
      ),
      target_card:cards!offers_target_card_id_fkey(
        name,
        allows_adjustment,
        owner_user_id,
        owner:profiles(
          trade_count,
          ship_rate,
          reply_median_hours,
          trouble_count,
          last_active_at
        )
      ),
      items:offer_items(
        card_id,
        card:cards(name)
      ),
      trade:trades(
        id,
        status,
        created_at,
        completed_at,
        cancelled_at
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchOfferOutcomeLogs]', error)
    return []
  }

  const rows = (data ?? []) as unknown as OfferOutcomeRaw[]

  const mapped = rows.map((row): OfferOutcomeLog => {
    const targetCardId = row.target_card_id

    // offer_items から提案カード（proposer 側）を抽出
    const offeredItems = (row.items ?? []).filter((item) => item.card_id !== targetCardId)

    const proposerTrustLevel: TrustBadgeLevel = row.proposer != null
      ? computeTrustBadge(row.proposer)
      : 'green'

    const receiverTrustLevel: TrustBadgeLevel = row.target_card?.owner != null
      ? computeTrustBadge(row.target_card.owner)
      : 'green'

    return {
      offer_id: row.id,
      offer_created_at: row.created_at,
      offer_updated_at: row.updated_at,
      offer_status: row.status,
      proposer_user_id: row.proposer_user_id,
      receiver_user_id: row.target_card?.owner_user_id ?? null,
      target_card_id: row.target_card_id,
      target_card_name: row.target_card?.name ?? null,
      target_card_allows_adjustment: row.target_card?.allows_adjustment ?? false,
      offered_card_ids: offeredItems.map((item) => item.card_id),
      offered_card_names: offeredItems
        .map((item) => item.card?.name ?? null)
        .filter((n): n is string => n != null),
      has_message: row.message != null && row.message.trim().length > 0,
      proposer_trust_level: proposerTrustLevel,
      receiver_trust_level: receiverTrustLevel,
      trade_id: row.trade?.id ?? null,
      trade_status: row.trade?.status ?? null,
      trade_created_at: row.trade?.created_at ?? null,
      trade_completed_at: row.trade?.completed_at ?? null,
      trade_cancelled_at: row.trade?.cancelled_at ?? null,
    }
  })

  // userId が指定された場合は proposer / receiver でフィルタ
  if (userId != null) {
    return mapped.filter(
      (log) => log.proposer_user_id === userId || log.receiver_user_id === userId
    )
  }

  return mapped
}

/**
 * OfferOutcomeLog の配列を集計してサマリを返す（純粋関数）。
 *
 * acceptRate = accepted / (accepted + declined + cancelled)
 * pending は分母に含めない（まだ結果が出ていないため）。
 */
export function summarizeOfferOutcomes(logs: OfferOutcomeLog[]): OfferOutcomeSummary {
  // trade_id の存在有無で判定（offer_status ベースより状態遷移に依存せず安定）
  const isAccepted = (log: OfferOutcomeLog) => log.trade_id != null

  const isTerminal = (log: OfferOutcomeLog) =>
    log.trade_id != null ||
    log.offer_status === 'declined' ||
    log.offer_status === 'cancelled'

  const makeStats = (subset: OfferOutcomeLog[]) => {
    const terminal = subset.filter(isTerminal)
    const accepted = subset.filter(isAccepted)
    return {
      total: subset.length,
      accepted: accepted.length,
      acceptRate: terminal.length > 0 ? accepted.length / terminal.length : 0,
    }
  }

  const trustLevels: TrustBadgeLevel[] = ['green', 'trial_blue', 'blue', 'gold_blue']

  const groupByTrust = (
    key: (log: OfferOutcomeLog) => TrustBadgeLevel
  ): Record<TrustBadgeLevel, { total: number; accepted: number; acceptRate: number }> => {
    const groups: Partial<Record<TrustBadgeLevel, OfferOutcomeLog[]>> = {}
    for (const log of logs) {
      const level = key(log)
      if (groups[level] == null) groups[level] = []
      groups[level]!.push(log)
    }
    return Object.fromEntries(
      trustLevels.map((level) => [level, makeStats(groups[level] ?? [])])
    ) as Record<TrustBadgeLevel, { total: number; accepted: number; acceptRate: number }>
  }

  const accepted = logs.filter(isAccepted)
  const terminal = logs.filter(isTerminal)

  return {
    total: logs.length,
    accepted: accepted.length,
    declined: logs.filter((l) => l.offer_status === 'declined').length,
    cancelled: logs.filter((l) => l.offer_status === 'cancelled').length,
    pending: logs.filter((l) => l.offer_status === 'pending').length,
    acceptRate: terminal.length > 0 ? accepted.length / terminal.length : 0,
    adjustmentAllowed: makeStats(logs.filter((l) => l.target_card_allows_adjustment)),
    adjustmentNotAllowed: makeStats(logs.filter((l) => !l.target_card_allows_adjustment)),
    byProposerTrust: groupByTrust((l) => l.proposer_trust_level),
    byReceiverTrust: groupByTrust((l) => l.receiver_trust_level),
    withMessage: makeStats(logs.filter((l) => l.has_message)),
    withoutMessage: makeStats(logs.filter((l) => !l.has_message)),
  }
}

// ─────────────────────────────────────────
// 配送情報
// ─────────────────────────────────────────

export async function fetchShippingAddress(userId: string): Promise<{
  shipping_name: string | null
  postal_code: string | null
  address_line1: string | null
  address_line2: string | null
} | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('shipping_name, postal_code, address_line1, address_line2')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('[fetchShippingAddress]', error)
    return null
  }

  return data
}

export async function updateShippingAddress(params: {
  userId: string
  shippingName: string
  postalCode: string
  addressLine1: string
  addressLine2: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      shipping_name: params.shippingName,
      postal_code: params.postalCode,
      address_line1: params.addressLine1,
      address_line2: params.addressLine2 ?? null,
    })
    .eq('id', params.userId)

  if (error) {
    throw error
  }
}

// ─────────────────────────────────────────
// プロフィール
// ─────────────────────────────────────────

export async function checkHandleAvailable(handle: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', handle)
    .maybeSingle()

  if (error) {
    console.error('[checkHandleAvailable]', error)
    return false
  }

  return data == null
}

export async function updateProfile(params: {
  userId: string
  handle: string
  displayName: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      handle: params.handle,
      display_name: params.displayName,
    })
    .eq('id', params.userId)

  if (error) {
    throw error
  }
}

// ─────────────────────────────────────────
// 検索
// ─────────────────────────────────────────

/**
 * 検索 cards 取得 (Phase 0.5b)。チップとフリーテキストの組み合わせで挙動が分岐。
 *
 * 3 経路:
 *   経路 1 (チップあり): single query で `.overlaps()` を chain。
 *     - characterIds + itemTypeIds 両方 → 2 つの overlaps を Postgrest が AND 結合
 *     - 確定事項 A: キャラ × アイテム = AND、キャラ同士 = OR (overlaps の意味論)、
 *                   アイテム同士 = OR (同) を SQL レベルで自然に実現
 *     - 入力中 free text (query) はチップありのとき無視 (R11)
 *
 *   経路 2 (チップ 0 + free text): 既存 3 query merge (a/b/c) を維持。
 *     - (a) characters overlap (text → master fuzzy 解決の結果が非空のとき)
 *     - (b) item_types overlap (同)
 *     - (c) name + legacy 列 (group_name/member_name/series) の ilike (常に、legacy fallback)
 *     - 結果は (a)→(b)→(c) で dedup + merge (master 解決済が上位)
 *
 *   経路 3 (全部空): 空配列即返却。
 *
 * Phase 1.5+ で RPC 関数化 (search_cards_unified) で最適化検討。
 */
export async function searchCards(params: {
  query?: string
  characterIds?: string[]
  itemTypeIds?: string[]
  workIds?: string[]
  limit?: number
  excludeOwnerIds?: string[]
}): Promise<Card[]> {
  const limit = params.limit ?? 30
  const characterIds = params.characterIds ?? []
  const itemTypeIds = params.itemTypeIds ?? []
  const workIds = params.workIds ?? []
  const query = (params.query ?? '').trim()
  const excludeOwnerIds = params.excludeOwnerIds ?? []
  const excludeFilter =
    excludeOwnerIds.length > 0 ? `(${excludeOwnerIds.join(',')})` : null

  // 経路 3: 全部空
  if (
    characterIds.length === 0 &&
    itemTypeIds.length === 0 &&
    workIds.length === 0 &&
    query === ''
  ) {
    return []
  }

  // 経路 1: チップあり (characters / item_types / works のいずれか) → 1〜2 query merge
  //   Query A: master ID overlap + work_id in (...) (新規出品ヒット)
  //   Query B: works 選択時のみ実行。group_name / series ilike で legacy 出品 fallback
  //            (cards.work_id NULL / フリーテキスト group_name の旧出品をカバー)
  if (characterIds.length > 0 || itemTypeIds.length > 0 || workIds.length > 0) {
    let qA = supabase
      .from('cards')
      .select('*, owner:profiles(*)')
      .eq('status', 'active')
    if (characterIds.length > 0) qA = qA.overlaps('characters', characterIds)
    if (itemTypeIds.length > 0) qA = qA.overlaps('item_types', itemTypeIds)
    if (workIds.length > 0) qA = qA.in('work_id', workIds)
    if (excludeFilter != null) qA = qA.not('owner_user_id', 'in', excludeFilter)

    // works 未選択 → 単一 query で完結 (既存挙動と完全互換)
    if (workIds.length === 0) {
      const { data, error } = await qA
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) {
        console.error('[searchCards/chips]', error)
        return []
      }
      return (data ?? []) as Card[]
    }

    // works 選択あり → legacy fallback query を組み立て
    // 各 work の display_name_ja / display_name_en / aliases を group_name / series に対する
    // ilike 句で OR 展開する。カンマ・括弧含む値はスキップ (Supabase .or() のセパレータ衝突回避)
    const ilikeClauses: string[] = []
    for (const id of workIds) {
      const work = getWorkById(id)
      if (work == null) continue
      const terms = [work.display_name_ja, work.display_name_en ?? '', ...work.aliases]
      for (const term of terms) {
        const t = term.trim()
        if (t === '' || t.includes(',') || t.includes('(') || t.includes(')')) continue
        ilikeClauses.push(`group_name.ilike.%${t}%`)
        ilikeClauses.push(`series.ilike.%${t}%`)
      }
    }

    type ChipQueryResult = { data: Card[] | null; error: unknown }
    const queries: PromiseLike<ChipQueryResult>[] = [
      qA
        .order('created_at', { ascending: false })
        .limit(limit)
        .then((r) => ({ data: r.data as Card[] | null, error: r.error })),
    ]
    if (ilikeClauses.length > 0) {
      let qB = supabase
        .from('cards')
        .select('*, owner:profiles(*)')
        .eq('status', 'active')
      if (characterIds.length > 0) qB = qB.overlaps('characters', characterIds)
      if (itemTypeIds.length > 0) qB = qB.overlaps('item_types', itemTypeIds)
      qB = qB.or(ilikeClauses.join(','))
      if (excludeFilter != null) qB = qB.not('owner_user_id', 'in', excludeFilter)
      queries.push(
        qB
          .order('created_at', { ascending: false })
          .limit(limit)
          .then((r) => ({ data: r.data as Card[] | null, error: r.error })),
      )
    }

    const results = await Promise.all(queries)
    const seen = new Set<string>()
    const merged: Card[] = []
    for (const result of results) {
      if (result.error) {
        console.error('[searchCards/chips]', result.error)
        continue
      }
      for (const c of result.data ?? []) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        merged.push(c)
      }
    }
    return merged.slice(0, limit)
  }

  // 経路 2: チップ 0 + free text → 既存 3 query merge
  const matchedCharIds = findCharacterIdsByText(query)
  const matchedItemTypeIds = findItemTypeIdsByText(query)

  // 注: Supabase JS の query builder は PromiseLike<T> (Thenable) を返すため
  //     Promise<T> ではなく PromiseLike<T> で型を取る (Promise.all は両対応)
  type QueryResult = { data: Card[] | null; error: unknown }
  const queries: PromiseLike<QueryResult>[] = []

  if (matchedCharIds.length > 0) {
    let q = supabase
      .from('cards')
      .select('*, owner:profiles(*)')
      .eq('status', 'active')
      .overlaps('characters', matchedCharIds)
    if (excludeFilter != null) q = q.not('owner_user_id', 'in', excludeFilter)
    queries.push(
      q
        .order('created_at', { ascending: false })
        .limit(limit)
        .then((r) => ({ data: r.data as Card[] | null, error: r.error })),
    )
  }

  if (matchedItemTypeIds.length > 0) {
    let q = supabase
      .from('cards')
      .select('*, owner:profiles(*)')
      .eq('status', 'active')
      .overlaps('item_types', matchedItemTypeIds)
    if (excludeFilter != null) q = q.not('owner_user_id', 'in', excludeFilter)
    queries.push(
      q
        .order('created_at', { ascending: false })
        .limit(limit)
        .then((r) => ({ data: r.data as Card[] | null, error: r.error })),
    )
  }

  {
    let q = supabase
      .from('cards')
      .select('*, owner:profiles(*)')
      .eq('status', 'active')
      .or(
        `name.ilike.%${query}%,group_name.ilike.%${query}%,member_name.ilike.%${query}%,series.ilike.%${query}%`,
      )
    if (excludeFilter != null) q = q.not('owner_user_id', 'in', excludeFilter)
    queries.push(
      q
        .order('created_at', { ascending: false })
        .limit(limit)
        .then((r) => ({ data: r.data as Card[] | null, error: r.error })),
    )
  }

  const results = await Promise.all(queries)

  const seen = new Set<string>()
  const merged: Card[] = []
  for (const result of results) {
    if (result.error) {
      console.error('[searchCards/freetext]', result.error)
      continue
    }
    for (const c of result.data ?? []) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      merged.push(c)
    }
  }

  return merged.slice(0, limit)
}

// ─────────────────────────────────────────
// メンバー指定検索 (Phase 1: TREASURE のみ、constants/members.ts を参照)
// ─────────────────────────────────────────

/**
 * member の aliases 全てに対する `or` 用 ilike 句を組み立てる。
 *
 * cards.member_name はフリーテキスト保存(マスタ正規化前)のため、同一人物
 * の表記揺れを aliases で吸収する。ilike なので大文字小文字非依存。
 * 部分一致 (`%`) は使わない: 「ハルト」検索が「ハルトン」等を拾わないよう
 * exact (case-insensitive) で揃える。
 */
function memberAliasOrClause(member: MemberMaster): string {
  return member.aliases.map((a) => `member_name.ilike.${a}`).join(',')
}

/**
 * autocomplete 用のメンバー候補を返す (Phase 1: in-memory フィルタ)。
 *
 * 入力に対して各メンバーの aliases いずれかが部分一致したらヒット扱い。
 * 大文字小文字非依存。Phase 2 で DB マスタ化する際は async DB 検索に
 * 差し替える想定。
 */
export function getMemberSuggestions(
  input: string,
  limit = 10
): readonly MemberMaster[] {
  const trimmed = input.trim().toLowerCase()
  if (trimmed === '') return []
  return ALL_MEMBERS.filter((m) =>
    m.aliases.some((a) => a.toLowerCase().includes(trimmed))
  ).slice(0, limit)
}

/**
 * 指定メンバーが所属するグループ候補を cards から DISTINCT 取得する。
 *
 * 結果が 0 件のとき(該当 cards が DB に未登録) は member.group のハード
 * コード値を fallback として返す。これにより β 開始直後のスパースな
 * DB でも検索 UI が機能する。DB エラー時も同じ fallback を返す。
 */
export async function getGroupsForMember(
  memberCanonical: string
): Promise<string[]> {
  const member = ALL_MEMBERS.find((m) => m.canonical === memberCanonical)
  if (member == null) return []

  const { data, error } = await supabase
    .from('cards')
    .select('group_name')
    .eq('status', 'active')
    .or(memberAliasOrClause(member))
    .not('group_name', 'is', null)

  if (error) {
    console.error('[getGroupsForMember]', error)
    return [member.group]
  }

  const groups = Array.from(
    new Set((data ?? []).map((r) => r.group_name as string))
  )
  return groups.length === 0 ? [member.group] : groups
}

/**
 * 指定メンバー(オプションでグループ指定)に該当する series 候補を cards
 * から DISTINCT 取得する。シリーズはユーザー入力フリーテキストでバリ
 * エーション豊富、またマスタ化対象でもないため fallback はなし(空配列は
 * 「直接入力」UI を表示するシグナル)。
 */
export async function getSeriesOptions(
  memberCanonical: string,
  group?: string
): Promise<string[]> {
  const member = ALL_MEMBERS.find((m) => m.canonical === memberCanonical)
  if (member == null) return []

  let query = supabase
    .from('cards')
    .select('series')
    .eq('status', 'active')
    .or(memberAliasOrClause(member))
    .not('series', 'is', null)

  if (group != null && group.trim() !== '') {
    query = query.ilike('group_name', group)
  }

  const { data, error } = await query

  if (error) {
    console.error('[getSeriesOptions]', error)
    return []
  }

  return Array.from(new Set((data ?? []).map((r) => r.series as string)))
}

/**
 * メンバー指定での cards 検索。
 *
 * - memberCanonical: ALL_MEMBERS の canonical 表記 (autocomplete で選択
 *   された結果)。マスタに存在しない canonical を渡されたら空配列。
 * - group: 任意の絞り込み (case-insensitive 完全一致)
 * - series: 任意の絞り込み (case-insensitive 完全一致)
 *
 * member_name のマッチング戦略: aliases の各表記に対して exact ilike を
 * OR 展開する (詳細は memberAliasOrClause 参照)。
 */
export async function searchCardsByMember(
  memberCanonical: string,
  group?: string,
  series?: string,
  limit = 30,
  excludeOwnerIds: string[] = [],
): Promise<Card[]> {
  const member = ALL_MEMBERS.find((m) => m.canonical === memberCanonical)
  if (member == null) return []

  let query = supabase
    .from('cards')
    .select('*, owner:profiles(*)')
    .eq('status', 'active')
    .or(memberAliasOrClause(member))

  if (group != null && group.trim() !== '') {
    query = query.ilike('group_name', group)
  }
  if (series != null && series.trim() !== '') {
    query = query.ilike('series', series)
  }
  if (excludeOwnerIds.length > 0) {
    query = query.not('owner_user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[searchCardsByMember]', error)
    return []
  }

  return (data ?? []) as Card[]
}

// ─────────────────────────────────────────
// 商品棚
// ─────────────────────────────────────────

export async function fetchShelfItems(userId: string): Promise<ShelfItem[]> {
  const { data, error } = await supabase
    .from('shelf_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchShelfItems]', error)
    return []
  }

  return (data ?? []) as ShelfItem[]
}

export async function addShelfItem(params: {
  userId: string
  cardName: string
  groupName: string | null
  memberName: string | null
  series: string | null
  note: string | null
}): Promise<ShelfItem> {
  const { data, error } = await supabase
    .from('shelf_items')
    .insert({
      user_id: params.userId,
      card_name: params.cardName,
      group_name: params.groupName,
      member_name: params.memberName,
      series: params.series,
      note: params.note,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as ShelfItem
}

export async function deleteShelfItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('shelf_items')
    .delete()
    .eq('id', itemId)

  if (error) {
    throw error
  }
}

// ─────────────────────────────────────────
// 推し
// ─────────────────────────────────────────

export async function fetchUserOshi(userId: string): Promise<UserOshi[]> {
  const { data, error } = await supabase
    .from('user_oshi')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[fetchUserOshi]', error)
    return []
  }

  return (data ?? []) as UserOshi[]
}

export async function addUserOshi(params: {
  userId: string
  groupName: string
  memberName: string | null
}): Promise<UserOshi> {
  const { data, error } = await supabase
    .from('user_oshi')
    .insert({
      user_id: params.userId,
      group_name: params.groupName,
      member_name: params.memberName,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as UserOshi
}

export async function deleteUserOshi(oshiId: string): Promise<void> {
  const { error } = await supabase
    .from('user_oshi')
    .delete()
    .eq('id', oshiId)

  if (error) {
    throw error
  }
}

// ─────────────────────────────────────────
// カウンターオファー
// ─────────────────────────────────────────

export async function createCounterOffer(params: {
  originalOfferId: string
  proposerId: string
  receiverId: string
  proposerCardId: string
  receiverCardId: string
  adjustmentAmount: number | null
  message: string | null
}): Promise<Offer> {
  // 元オファーを decline
  const { error: declineError } = await supabase
    .from('offers')
    .update({ status: 'declined' })
    .eq('id', params.originalOfferId)

  if (declineError) {
    throw declineError
  }

  // 新オファーを parent_offer_id 付きで作成
  // counter offer は 1:1 を維持 — proposerCardId を単要素配列にラップ
  return createOffer({
    proposerId: params.proposerId,
    receiverId: params.receiverId,
    proposerCardIds: [params.proposerCardId],
    receiverCardId: params.receiverCardId,
    adjustmentAmount: params.adjustmentAmount,
    message: params.message,
    parentOfferId: params.originalOfferId,
  })
}

// ─────────────────────────────────────────
// 会場モード
// ─────────────────────────────────────────

export async function fetchVenues(): Promise<Venue[]> {
  const today = new Date().toISOString().split('T')[0]
  const twoWeeksLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .gte('event_date', today)
    .lte('event_date', twoWeeksLater)
    .order('event_date', { ascending: true })

  if (error) {
    console.error('[fetchVenues]', error)
    return []
  }

  return (data ?? []) as Venue[]
}

export async function fetchMyCheckin(
  venueId: string,
  userId: string
): Promise<VenueCheckin | null> {
  const { data, error } = await supabase
    .from('venue_checkins')
    .select('*')
    .eq('venue_id', venueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[fetchMyCheckin]', error)
    return null
  }

  return data as VenueCheckin | null
}

export async function checkInVenue(
  venueId: string,
  userId: string
): Promise<VenueCheckin> {
  const { data, error } = await supabase
    .from('venue_checkins')
    .insert({ venue_id: venueId, user_id: userId })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as VenueCheckin
}

export async function fetchVenueCheckinCount(venueId: string): Promise<number> {
  const { count, error } = await supabase
    .from('venue_checkins')
    .select('*', { count: 'exact', head: true })
    .eq('venue_id', venueId)

  if (error) {
    console.error('[fetchVenueCheckinCount]', error)
    return 0
  }

  return count ?? 0
}

export async function fetchSupplyPosts(venueId: string): Promise<VenueSupplyPost[]> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('venue_supply_posts')
    .select('*')
    .eq('venue_id', venueId)
    .eq('status', 'active')
    .gt('expires_at', now)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchSupplyPosts]', error)
    return []
  }

  const posts = (data ?? []) as VenueSupplyPost[]

  // poster情報を別クエリで取得
  const userIds = [...new Set(posts.map((p) => p.user_id))]
  if (userIds.length === 0) return posts

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle, display_name, trade_count, ship_rate, trouble_count')
    .in('id', userIds)

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p])
  )

  return posts.map((post) => ({
    ...post,
    poster: profileMap[post.user_id] ?? undefined,
  }))
}

export async function addSupplyPost(params: {
  venueId: string
  userId: string
  cardName: string
  groupName: string | null
  wantCard: string | null
}): Promise<VenueSupplyPost> {
  // PR feat/venue-event-day-expiry: 30 分固定失効を廃止し、イベント当日 23:59 (JST)
  // までの有効期限に変更。event_date のみ参照し、ends_at は使わない (過去 venue の
  // ends_at が過去にあると作成直後に期限切れになる事象を回避)。
  const { data: venue, error: venueError } = await supabase
    .from('venues')
    .select('event_date')
    .eq('id', params.venueId)
    .single()
  if (venueError) throw venueError
  const expiresAt = computeVenueExpiry(venue)

  const { data, error } = await supabase
    .from('venue_supply_posts')
    .insert({
      venue_id: params.venueId,
      user_id: params.userId,
      card_name: params.cardName,
      group_name: params.groupName,
      want_card: params.wantCard,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as VenueSupplyPost
}

export async function withdrawSupplyPost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('venue_supply_posts')
    .update({ status: 'withdrawn' })
    .eq('id', postId)

  if (error) {
    throw error
  }
}

// PR2: 受信 Hold inbox 用に拡張した戻り値型。
// fetchVenueHolds が profile / supply_post を join した結果を保持する。
// 既存呼出 (venueHold として使う側) は VenueHold[] への代入で互換 (上位互換型)。
export interface VenueHoldCounterpartProfile {
  id: string
  handle: string | null
  display_name: string | null
  trade_count: number
  ship_rate: number
  trouble_count: number
}

export interface VenueHoldWithRelations extends VenueHold {
  proposer_profile?: VenueHoldCounterpartProfile | null
  receiver_profile?: VenueHoldCounterpartProfile | null
  // supply_post_id が NULL でない場合のみ参照。SET NULL FK で削除済みなら null。
  supply_post_meta?: { id: string; card_name: string; status: SupplyPostStatus } | null
  // PR4a (B1 修正): held / converted hold に対応する venue_trade。pending hold では null。
  // 画面再 mount 後も提案者 / 受信者の双方が trade に到達できるようにするため、
  // fetchVenueHolds で venue_holds.id = venue_trades.hold_id を join 取得する。
  venue_trade?: VenueTrade | null
}

export type VenueHoldDirection = 'all' | 'received' | 'sent'

/**
 * 指定 venue における自分関与の Hold を取得。
 *
 * direction:
 *   - 'all'      : proposer / receiver どちらかが自分
 *   - 'received' : receiver_id = userId (自分が受信者 = supply_post 投稿者)
 *   - 'sent'     : proposer_id = userId (自分が申請者)
 *
 * 返却に proposer / receiver の profile 概要と supply_post 概要を含めるため、
 * 1 回の本クエリ + profiles 取得 + venue_supply_posts 取得 の最大 3 回のリクエスト。
 * RLS で当事者のみ可視のため、漏洩リスクなし。
 */
export async function fetchVenueHolds(
  venueId: string,
  userId: string,
  direction: VenueHoldDirection = 'all'
): Promise<VenueHoldWithRelations[]> {
  let query = supabase
    .from('venue_holds')
    .select('*')
    .eq('venue_id', venueId)

  if (direction === 'received') {
    query = query.eq('receiver_id', userId)
  } else if (direction === 'sent') {
    query = query.eq('proposer_id', userId)
  } else {
    query = query.or(`proposer_id.eq.${userId},receiver_id.eq.${userId}`)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchVenueHolds]', error)
    return []
  }

  const holds = (data ?? []) as VenueHold[]
  if (holds.length === 0) return []

  // proposer / receiver の profile を 1 クエリで取得 (denormalize merge)
  const userIds = Array.from(new Set([
    ...holds.map((h) => h.proposer_id),
    ...holds.map((h) => h.receiver_id),
  ]))

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle, display_name, trade_count, ship_rate, trouble_count')
    .in('id', userIds)

  const profileMap: Record<string, VenueHoldCounterpartProfile> = Object.fromEntries(
    (profiles ?? []).map((p: VenueHoldCounterpartProfile) => [p.id, p])
  )

  // supply_post meta 取得 (削除済 / 取下済の表示判定に必要)
  const supplyPostIds = Array.from(new Set(
    holds.map((h) => h.supply_post_id).filter((id): id is string => id != null)
  ))

  let supplyPostMap: Record<string, { id: string; card_name: string; status: SupplyPostStatus }> = {}
  if (supplyPostIds.length > 0) {
    const { data: posts } = await supabase
      .from('venue_supply_posts')
      .select('id, card_name, status')
      .in('id', supplyPostIds)

    supplyPostMap = Object.fromEntries(
      (posts ?? []).map((p: { id: string; card_name: string; status: SupplyPostStatus }) => [p.id, p])
    )
  }

  // PR4a (B1 修正): held / converted hold に対応する venue_trade を join 取得。
  // RLS で venue_trades は当事者のみ可視のため漏洩リスクなし。提案者 / 受信者の
  // どちらでも自分関与の trade に必ず到達できる (in-memory 依存解消)。
  const heldOrConvertedHoldIds = holds
    .filter((h) => h.status === 'held' || h.status === 'converted')
    .map((h) => h.id)

  const tradeMap: Record<string, VenueTrade> = {}
  if (heldOrConvertedHoldIds.length > 0) {
    const { data: trades } = await supabase
      .from('venue_trades')
      .select('*')
      .in('hold_id', heldOrConvertedHoldIds)

    for (const t of (trades ?? []) as VenueTrade[]) {
      tradeMap[t.hold_id] = t
    }
  }

  return holds.map((h) => ({
    ...h,
    proposer_profile: profileMap[h.proposer_id] ?? null,
    receiver_profile: profileMap[h.receiver_id] ?? null,
    supply_post_meta:
      h.supply_post_id != null ? (supplyPostMap[h.supply_post_id] ?? null) : null,
    venue_trade: tradeMap[h.id] ?? null,
  }))
}

/**
 * Hold を拒否する (受信者 = supply_post 投稿者の操作)。
 * 更新クエリ側で status='pending' AND receiver_id=userId を強制 → UI 改竄や
 * race condition で他人の Hold を書き換えられない。
 */
export async function declineVenueHold(
  holdId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('venue_holds')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', holdId)
    .eq('status', 'pending')
    .eq('receiver_id', userId)

  if (error) throw error
}

/**
 * 自分が送った Hold を取り消す (申請者の操作)。
 * 更新クエリ側で status='pending' AND proposer_id=userId を強制。
 */
export async function cancelVenueHold(
  holdId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('venue_holds')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', holdId)
    .eq('status', 'pending')
    .eq('proposer_id', userId)

  if (error) throw error
}

/**
 * 自分宛の受信中 (pending かつ未失効) Hold 件数を取得。
 * venueId を渡せば当該 venue 限定。未指定なら全 venue 横断 (BadgeProvider 用)。
 * RLS でも当事者のみカウントされるため二重防御。
 */
export async function fetchReceivedHoldCount(
  userId: string,
  venueId?: string
): Promise<number> {
  const now = new Date().toISOString()
  let query = supabase
    .from('venue_holds')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', now)

  if (venueId != null) {
    query = query.eq('venue_id', venueId)
  }

  const { count, error } = await query

  if (error) {
    console.error('[fetchReceivedHoldCount]', error)
    return 0
  }

  return count ?? 0
}

/**
 * 自分の supply_post 一覧 (status / expires_at 不問、全件)。
 * /venue/my-posts 用。active / withdrawn / 期限切れ表示を呼出側で判定する。
 */
export async function fetchMySupplyPosts(
  venueId: string,
  userId: string
): Promise<VenueSupplyPost[]> {
  const { data, error } = await supabase
    .from('venue_supply_posts')
    .select('*')
    .eq('venue_id', venueId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchMySupplyPosts]', error)
    return []
  }

  return (data ?? []) as VenueSupplyPost[]
}

/**
 * 自分の supply_post id 群に対する pending Hold 件数。
 *
 * 呼出規約 (RLS 漏洩防止):
 *   - supplyPostIds は **必ず** fetchMySupplyPosts の戻り値 (= 自分の post のみ) を渡すこと。
 *   - 他人の supply_post id を混ぜると、本関数は count=0 を返す (RLS により当事者でない hold は見えない)
 *     が、論理的に「他人の supply 状況を覗く意図」になるため絶対にやってはいけない。
 *
 * 集計条件:
 *   - supply_post_id IN supplyPostIds
 *   - receiver_id = userId (自分が受信者 = supply_post 投稿者)
 *   - status = 'pending'
 *   - expires_at > now()
 */
export async function fetchHoldCountsForSupplyPosts(
  supplyPostIds: string[],
  userId: string
): Promise<Record<string, number>> {
  if (supplyPostIds.length === 0) return {}

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('venue_holds')
    .select('supply_post_id')
    .in('supply_post_id', supplyPostIds)
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', now)

  if (error) {
    console.error('[fetchHoldCountsForSupplyPosts]', error)
    return {}
  }

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const id = (row as { supply_post_id: string | null }).supply_post_id
    if (id != null) {
      counts[id] = (counts[id] ?? 0) + 1
    }
  }
  return counts
}

export async function createVenueHold(params: {
  venueId: string
  proposerId: string
  receiverId: string
  proposerCard: string
  receiverCard: string
  supplyPostId: string | null
}): Promise<VenueHold> {
  // PR feat/venue-event-day-expiry: 30 分固定失効を廃止し、イベント当日 23:59 (JST)
  // までの有効期限に変更。申請中 Hold (status='pending') の expires_at は supply_post と
  // 共通の event_date 23:59:59 JST を使う。承認後 (status='held') 以降は filter 対象外。
  const { data: venue, error: venueError } = await supabase
    .from('venues')
    .select('event_date')
    .eq('id', params.venueId)
    .single()
  if (venueError) throw venueError
  const expiresAt = computeVenueExpiry(venue)

  const { data, error } = await supabase
    .from('venue_holds')
    .insert({
      venue_id: params.venueId,
      proposer_id: params.proposerId,
      receiver_id: params.receiverId,
      proposer_card: params.proposerCard,
      receiver_card: params.receiverCard,
      supply_post_id: params.supplyPostId,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as VenueHold
}

/**
 * Hold を承認して venue_trade を生成する (PR4b で原子化 RPC に置換)。
 *
 * 旧 JS 実装の 3 ステップ (SELECT hold / UPDATE hold / INSERT trade) は廃止。
 * 全処理を accept_venue_hold(p_hold_id uuid) RPC に集約:
 *   - hold / supply_post 双方を FOR UPDATE でロック
 *   - 当事者 / 状態 / 期限 / 兄弟成立を厳密にガード
 *   - hold を 'held'、supply_post を 'held'、兄弟 pending hold を 'declined' に一括更新
 *   - offered_snapshot / wanted_snapshot を構築して venue_trade を INSERT
 *
 * エラー (raise exception 文字列):
 *   - AUTH_REQUIRED, HOLD_NOT_FOUND, NOT_RECEIVER
 *   - HOLD_NOT_PENDING:<status>, HOLD_EXPIRED
 *   - SUPPLY_POST_NOT_FOUND, SUPPLY_POST_NOT_ACTIVE:<status>, SUPPLY_POST_ALREADY_TAKEN
 *
 * 関連: docs/migration_rpc_accept_venue_hold.sql
 */
export async function acceptVenueHold(holdId: string): Promise<VenueTrade> {
  const { data, error } = await supabase.rpc('accept_venue_hold', {
    p_hold_id: holdId,
  })

  if (error) throw error
  if (data == null) {
    throw new Error('NO_TRADE_RETURNED')
  }

  // RPC は public.venue_trades 行を 1 件返す
  return data as VenueTrade
}

/**
 * 会場交換の手渡し完了確認 (PR4a で role 中立対称確定に再設計)。
 *
 * 設計方針:
 *   - status 文字列に role を含めない (旧 `${role}_confirmed` テンプレート廃止)。
 *     これにより receiver 先行確定で CHECK 違反 (Postgres 23514) になっていた既知バグ
 *     (B2) を構造的に消滅させる。
 *   - 自分 role 側の timestamp を書く + status は両 timestamp の有無で派生:
 *       両 NULL                                → pending
 *       片方のみ NOT NULL                      → partially_confirmed
 *       両 NOT NULL                            → completed (completed_at セット)
 *   - 既に完了 / キャンセル済みなら no-op (冪等)。
 *   - 自分側 timestamp が既に立っていれば no-op (二重押し対策、冪等)。
 *   - UPDATE クエリ側でも当事者条件 + 非終端状態の二重確認 (race condition / UI 改竄
 *     防御)。
 *
 * 関連:
 *   - docs/migration_venue_trades_state_partially_confirmed.sql (CHECK 制約再設計)
 *   - docs/venue_mode_requirements.md §5 / §7 (対称確定方針確定)
 */
export async function confirmVenueTrade(
  tradeId: string,
  userId: string,
  role: 'proposer' | 'receiver'
): Promise<void> {
  const now = new Date().toISOString()
  const field =
    role === 'proposer' ? 'proposer_confirmed_at' : 'receiver_confirmed_at'
  const userIdField = role === 'proposer' ? 'proposer_id' : 'receiver_id'

  // 当事者であることを fetch 時点でも確認 (二重防御の最初の壁)
  const { data: trade, error: fetchError } = await supabase
    .from('venue_trades')
    .select('*')
    .eq('id', tradeId)
    .eq(userIdField, userId)
    .single()

  if (fetchError) throw fetchError

  // 既に終端状態 → no-op (冪等、二重押し / 古いボタンタップを吸収)
  if (trade.status === 'completed' || trade.status === 'cancelled') {
    return
  }

  // 自分側の timestamp が既に立っている → no-op (二重押し対策)
  const myTimestamp: string | null =
    role === 'proposer' ? trade.proposer_confirmed_at : trade.receiver_confirmed_at
  if (myTimestamp != null) {
    return
  }

  // 相手側 timestamp で派生 status を決定
  const otherTimestamp: string | null =
    role === 'proposer' ? trade.receiver_confirmed_at : trade.proposer_confirmed_at
  const newStatus: VenueTradeStatus =
    otherTimestamp != null ? 'completed' : 'partially_confirmed'
  const completedAt = newStatus === 'completed' ? now : null

  // UPDATE クエリ側で当事者条件 + 非終端状態を再強制 (race 防御)
  const { error } = await supabase
    .from('venue_trades')
    .update({
      [field]: now,
      status: newStatus,
      ...(completedAt != null ? { completed_at: completedAt } : {}),
      updated_at: now,
    })
    .eq('id', tradeId)
    .eq(userIdField, userId)
    .in('status', ['pending', 'partially_confirmed'])

  if (error) throw error
}

// ─────────────────────────────────────────
// Storage（画像アップロード）
// ─────────────────────────────────────────

export async function uploadCardImage(params: {
  userId: string
  imageUri: string
  fileName?: string
}): Promise<string> {
  const ext = params.imageUri.split('.').pop()?.split('?')[0] ?? 'jpg'
  const fileName = params.fileName ?? `${Date.now()}.${ext}`
  const filePath = `${params.userId}/${fileName}`

  // expo-file-system でファイルをbase64として読み込む
  const base64 = await readAsStringAsync(params.imageUri, {
    encoding: 'base64',
  })

  // base64をUint8Arrayに変換
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }

  const { error } = await supabase.storage
    .from('card-images')
    .upload(filePath, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (error) {
    throw error
  }

  const { data } = supabase.storage
    .from('card-images')
    .getPublicUrl(filePath)

  return data.publicUrl
}
