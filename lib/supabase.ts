// lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
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
  VenueTradeMessage,
  VenueTradeRead,
  VenueTradeUnreadCountRow,
  TradeMessage,
  SendTradeMessageResult,
  TradeUnreadCountRow,
  UserTrust,
  WantedCard,
  WantMatchScore,
} from './types'
import { scoreSearchMatch, scoreWantMatchV2, type SearchMatchScore } from './matcher' // ★ Step 3 commit 3: v1 → v2 切替 / PR-2a: DirectMatch score tier
import { findCharacterIdsByText, findItemTypeIdsByText, getWorkById } from './master' // searchCards 経路 2 の master fuzzy 解決 + 経路 1 work_id legacy fallback の aliases 取得
import { computeVenueExpiry } from './venueExpiry' // 会場出品 / Hold のイベント当日中有効 expires_at 計算
import { readAsStringAsync } from 'expo-file-system/legacy'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Supabase 公式 React Native パターン (https://supabase.com/docs/reference/javascript/initializing)。
//
// storage を明示指定しないと、@supabase/auth-js の GoTrueClient は
// localStorage 不在の RN 環境で memoryLocalStorageAdapter に fallback する
// (node_modules/@supabase/auth-js/dist/main/GoTrueClient.js の default storage 選択ロジック)。
// 結果としてセッションは JS runtime のメモリ内にのみ保持され、
// アプリを完全終了すると失われ、次回起動でログイン画面に戻される問題が発生する。
//
// AsyncStorage を渡すことで session を端末永続ストレージに保存し、
// (a) アプリ完全終了 → 再起動でも session 復元、
// (b) refresh_token を永続化して長期セッション継続、
// を実現する。
//
// autoRefreshToken / persistSession は auth-js のデフォルトが true だが、
// 意図を明示するため冗長に指定する。detectSessionInUrl は RN では意味を持たないため
// false (ブラウザ環境のみ true が必要)。
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Supabase 公式 RN パターン: AppState 遷移で auto-refresh を on/off する。
//
// autoRefreshToken=true でも、RN のバックグラウンド中は setInterval が実質停止するため
// フォアグラウンド復帰時のトークン再取得が自動で走らない。復帰直後に RPC を発火すると
// 期限切れ access_token で 401 を踏み、home 画面が空表示になる (旧挙動)。
//
// active 復帰時に startAutoRefresh() を呼んで即時 refresh + 定期タイマー再開、
// background/inactive 遷移時に stopAutoRefresh() でタイマー停止 (バッテリー節約 + 予測不能な
// deferred 実行を回避) することでこの問題を解消する。
//
// BadgeProvider も AppState.addEventListener を使うが、AppState は複数リスナー登録可能で
// 独立に動作する (RN の addEventListener 契約通り)。競合しない。
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})

// ─────────────────────────────────────────
// PR-V1 (venue resilience): 会場モードの読み込み系 fetch 共通タイムアウト
// ─────────────────────────────────────────
//
// 採用方式: Promise.race。
//   理由: supabase-js v2 の PostgrestBuilder は AbortSignal 非対応のため、
//         真に request を abort できない。Promise.race で「結果を捨てる」方式を採用。
//
// ⚠️ 既知の制約 (V1 妥協点):
//   タイムアウトで race から落とした request は内部で生き続け、帯域を解放しない。
//   ドーム/アリーナで数万人が同時通信する環境では、捨てたリクエストの帯域消費が
//   むしろ悪化要因として効く可能性がある (= V1 タイムアウト導入で「無限 hanging」は
//   解消するが、輻輳そのものは軽減しない)。
//
// 根本対処は V3 (再fetch 間引き + キャッシュ) で「そもそも request 本数を減らす」
// 方向で実施する。V1 では race の妥協を受け入れ、まず「画面が固まらない」状態を作る。
//
// 値の根拠 (推測): supabase-js のデフォルトは無限待機。会場 (ドーム/アリーナ) の
// 弱電波下で「8 秒応答ない = ほぼ無理」が経験則。長すぎると UX 悪化、短すぎると
// 正常リクエストまで切ってしまう。次の PR-V2 でリトライ UI を載せたとき、
// ユーザーが手動で再試行できる粒度として 8 秒を初期値とする。
export const VENUE_FETCH_TIMEOUT_MS = 8000

export class VenueFetchTimeoutError extends Error {
  constructor(operation: string) {
    super(`VENUE_FETCH_TIMEOUT: ${operation}`)
    this.name = 'VenueFetchTimeoutError'
  }
}

/**
 * Promise.race でタイムアウトを掛ける軽量ヘルパー。
 * 元の Promise は abort せず継続するが、UI 側は VenueFetchTimeoutError を見て
 * 諦めて empty 表示にする / V2 でリトライバナーを出す等の判断ができる。
 */
async function withVenueTimeout<T>(
  operation: string,
  promise: Promise<T>,
): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new VenueFetchTimeoutError(operation)),
        VENUE_FETCH_TIMEOUT_MS,
      )
    }),
  ])
}

/**
 * PR-V2-fix: ネットワーク起因の fetch 失敗を判別するヘルパー。
 *
 * React Native の fetch (whatwg-fetch ポリフィル) は到達失敗時に
 *   `TypeError: Network request failed`
 * を throw する経路 (素の fetch エラー) に加え、
 * supabase-js v2 の PostgrestBuilder は内部 fetch エラーを catch して
 *   `{ data: null, error: { message: 'TypeError: Network request failed', hint: '', code: '' } }`
 * の形に変換する経路もある (= throw されず resolve、{error} に詰めて返る)。
 *
 * 判定対象:
 *   - VenueFetchTimeoutError: 自前の 8s タイムアウトクラス (PR-V1)
 *   - VenueNetworkError: lib 内 if (error) ブロックで PostgrestError 経路の
 *     ネットワーク起因 error を専用クラスに包んで throw し直したもの (PR-V2-fix2)
 *   - TypeError かつ message に "Network request failed" を含む:
 *     supabase-js より上の層で素の TypeError が伝播してくる保険経路
 *
 * 上記 3 パターンは「ユーザーに『うまく読み込めませんでした』を出す対象」とする。
 * それ以外 (= 一般バグ、想定外の throw) は呼出側で **再 throw** して
 * Sentry 等で検知できるようにする (本物のバグは握りつぶさない切り分けが目的)。
 */
export function isVenueLoadFailure(err: unknown): boolean {
  if (err instanceof VenueFetchTimeoutError) return true
  if (err instanceof VenueNetworkError) return true
  if (
    err instanceof TypeError &&
    typeof err.message === 'string' &&
    err.message.includes('Network request failed')
  ) {
    return true
  }
  return false
}

/**
 * PR-V2-fix2: supabase-js v2 の PostgrestBuilder が内部 fetch エラーを
 * { data: null, error: { message: 'TypeError: Network request failed', hint: '', code: '' } }
 * の形で返す経路を捕まえて throw VenueNetworkError に変換するためのクラス。
 *
 * 元の supabase error は source プロパティで保持し、デバッグ / Sentry 等で
 * 「ネットワーク失敗だが詳細は何だったか」を参照可能にする。
 *
 * 「ユーザーに『うまく読み込めませんでした』を出す対象」として isVenueLoadFailure が拾う。
 */
export class VenueNetworkError extends Error {
  constructor(
    public readonly operation: string,
    public readonly source: unknown,
  ) {
    const sourceMessage =
      source != null &&
      typeof source === 'object' &&
      'message' in source &&
      typeof (source as { message?: unknown }).message === 'string'
        ? (source as { message: string }).message
        : ''
    super(`VENUE_NETWORK_ERROR: ${operation}${sourceMessage !== '' ? `: ${sourceMessage}` : ''}`)
    this.name = 'VenueNetworkError'
  }
}

/**
 * PR-V2-fix2: supabase-js が返した PostgrestError-like な error オブジェクトが
 * 「ネットワーク起因」か「DB エラー」かを判別する。
 *
 * 機内モード等の実物 (確定): { message: 'TypeError: Network request failed', hint: '', code: '' }
 *   → message に 'Network request failed' を含む & code が空文字 が特徴
 * DB エラー (例): { message: '...', hint: '...', code: 'PGRST116' / '42501' / '23514' 等 }
 *   → code に PostgrestError コード ('PGRST...' or PostgreSQL SQLSTATE) が入っている
 *
 * 判定: error.message に 'Network request failed' を含めば「ネットワーク起因」と判定。
 * code フィールドは確認には使うがメッセージ文字列を主軸にする (RN fetch 文言は安定)。
 *
 * ※ DB エラー側で 'Network request failed' を含む message を返すケースは、
 *    PostgrestError / RPC の raise exception のいずれでも観測されていない (確定論理)。
 */
function isNetworkErrorObject(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return false
  return message.includes('Network request failed')
}

// ─────────────────────────────────────────
// Home screen
// ─────────────────────────────────────────

// カード一覧/検索の共通 select。owner profile に加え、構造化求 (card_wanted_links →
// wanted_cards) を join して、カード表示 (formatCardTitle の【求】行) を want_description
// legacy 非依存で組めるようにする。DB スキーマ変更なし (nested SELECT のみ)。
const CARD_WANT_LINKS_SELECT =
  'card_wanted_links(wanted_card:wanted_cards(card_name, group_name, member_name, series))'
// ★owner profile は id/handle/display_name のみ (owner の消費は handle/display_name 表示 +
//   listing/[id] の owner.id のみ。avatar_url/mode/trust列/住所列は未使用=egress/PII 削減で除外)。
const CARD_FEED_SELECT = `*, owner:profiles(id, handle, display_name), ${CARD_WANT_LINKS_SELECT}`

export async function fetchNewCards(
  limit = 20,
  excludeOwnerIds: string[] = [],
): Promise<Card[]> {
  let query = supabase
    .from('cards')
    .select(CARD_FEED_SELECT)
    .eq('status', 'active')
    // 顔2 (is_public): 公開出品のみをフィードに出す。商品棚 (is_public=false) は除外。
    .eq('is_public', true)

  if (excludeOwnerIds.length > 0) {
    query = query.not('owner_user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchNewCards]', error)
    // 案C: 取得失敗を握って [] を返さず throw する (呼出側 try/catch が loadFailed を立てる)。
    throw error
  }

  return (data ?? []) as Card[]
}

// 「推しと一致!」レーン用: 推し (フリーテキスト) をクライアント側で master 解決した
// 文字ID/作品ID の配列を受け取り、cards.characters overlap または work_id 一致で抽出。
// 推しが 1 つも master 解決できなければ (charIds/workIds 空) → 空配列。DB変更なし。
export async function fetchOshiMatchCards(params: {
  userId: string
  workIds: string[] // 推しグループ (master_works.id slug)。★グループ一致を必須にする (AND の要)。
  excludeOwnerIds?: string[]
  limit?: number
}): Promise<Card[]> {
  const { userId, workIds, excludeOwnerIds = [], limit = 20 } = params
  // ★グループ (work_id) 一致のみで絞る。旧実装の characters.ov との OR は廃止した。
  //   member はここでは絞らず、呼出側 (home) で「一致を上位表示」のランキングにのみ使う
  //   (別グループの同名メンバーが混ざる偽陽性を構造的に排除)。
  if (workIds.length === 0) return []

  let query = supabase
    .from('cards')
    .select(CARD_FEED_SELECT)
    .eq('status', 'active')
    .eq('is_public', true)
    .neq('owner_user_id', userId)
    .in('work_id', workIds)

  if (excludeOwnerIds.length > 0) {
    query = query.not('owner_user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchOshiMatchCards]', error)
    return []
  }

  return (data ?? []) as Card[]
}

// ホーム下部の無限グリッド用: created_at 降順を offset ページングで取得。
// discovery グリッドなので自分の出品 (excludeUserId) と blocked (excludeOwnerIds) は除外。
// DB スキーマ変更なし (SELECT + .range のみ)。空配列が返れば末尾 (それ以上ロードしない)。
export async function fetchCardsPaged(params: {
  offset: number
  limit?: number
  excludeUserId?: string | null
  excludeOwnerIds?: string[]
}): Promise<Card[]> {
  const { offset, limit = 30, excludeUserId, excludeOwnerIds = [] } = params
  let query = supabase
    .from('cards')
    .select(CARD_FEED_SELECT)
    .eq('status', 'active')
    .eq('is_public', true)

  if (excludeUserId != null) query = query.neq('owner_user_id', excludeUserId)
  if (excludeOwnerIds.length > 0) {
    query = query.not('owner_user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[fetchCardsPaged]', error)
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

  // ★Trust 統計 (trouble_count / ship_rate / reply_median_hours / trade_count) は
  //   easyScore から除去した (タスクC)。理由:
  //   (1) これらの列を更新する経路が本番に存在せず seed 固定の死んだ値であり
  //       (trade_count=0 かつ ship_rate=100 が多数=計算されていない証拠)、順位を
  //       最大 ±70 動かして「成立しやすさ」と無関係な並びを作っていた。
  //   (2) 方針 #22「β1 は指標反映なし」に違反 (特に trouble_count は trade_reports
  //       由来の申告データを閾値設計をバイパスして生反映していた)。
  //   順位は下記の求一致度 (scoreWantMatchV2) のみで決まる。
  //
  // ★last_active_at 分岐 (<24h/<72h/<168h) も除去した (タスクC 追補)。理由:
  //   last_active_at も更新経路が本番に無く seed 固定 (全員 NULL または 2026-05-31、
  //   直近7日以内に動いた人は0/14)。全員が 168h 超で分岐が1度も発火しない死にコード
  //   だったため、除去しても順位は変わらない。
  //   結果: easyScore は求一致度のみ。求リスト登録者は一致度で順位化、未登録者は
  //   全カード同点 → 安定ソートで created_at desc (新着順) に縮退する。
  //   「成立しやすい交換 = 求の一致度」となり、レーン名と実装が一致する。

  // 求一致度 (scoreWantMatchV2: any-overlap + overlap 数重み付け)
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
  limit = 20,
): Promise<Card[]> {
  // スコアソートの質のため slice の 2 倍 (最低 40) を DB から取得してから絞る。
  // 既存呼出 (limit 省略) は 40 取得 → 20 slice で従来挙動と一致。「すべて見る」一覧は
  // limit を上げて全件寄りに取得する (app/list/[section].tsx)。
  const fetchLimit = Math.max(limit * 2, 40)
  let query = supabase
    .from('cards')
    .select(CARD_FEED_SELECT)
    .eq('status', 'active')
    .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
    .eq('allows_adjustment', false)

  if (userId != null) {
    query = query.neq('owner_user_id', userId)
  }
  if (excludeOwnerIds.length > 0) {
    query = query.not('owner_user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(fetchLimit)

  if (error) {
    console.error('[fetchEasyCards]', error)
    throw error // 案C: 握らず throw (呼出側 try/catch で loadFailed)
  }

  return sortEasyCards((data ?? []) as Card[], myWants).slice(0, limit)
}

// 「いいねした交換」一覧用: liked_cards ⨝ cards で自分がいいねしたカードを全件取得。
// home のロード済近似 (rec/easy/new から抽出) と異なり、liked_cards テーブルを正として
// 全件返す。owner profile も join。DB スキーマ変更なし (SELECT のみ)。
export async function fetchLikedCards(userId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from('liked_cards')
    .select(`card:cards(${CARD_FEED_SELECT})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchLikedCards]', error)
    throw error // 案C: 握らず throw (呼出側 try/catch で loadFailed)
  }
  const rows = (data ?? []) as unknown as { card: Card | null }[]
  // 判断1: active な出品のみ (traded/inactive になった過去いいねは一覧から除外)。
  // ★is_public: 非公開 (棚) 化されたカードは他人向け一覧から除外 (RLS 未実装③のためクライアントで gate)。
  //   CARD_FEED_SELECT は `*` で is_public を含むため、明示 false のみ除外する。
  return rows
    .map((r) => r.card)
    .filter(
      (c): c is Card =>
        c != null && c.status === 'active' && c.is_public !== false,
    )
}

export async function fetchRecommendedCards(
  userId: string,
  limit = 20,
  excludeOwnerIds: string[] = [],
): Promise<Card[]> {
  let query = supabase
    .from('cards')
    .select(CARD_FEED_SELECT)
    .eq('status', 'active')
    .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
    .neq('owner_user_id', userId)

  if (excludeOwnerIds.length > 0) {
    query = query.not('owner_user_id', 'in', `(${excludeOwnerIds.join(',')})`)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchRecommendedCards]', error)
    throw error // 案C: 握らず throw (呼出側 try/catch で loadFailed)
  }

  return (data ?? []) as Card[]
}

// ─────────────────────────────────────────
// Listing detail
// ─────────────────────────────────────────

export async function fetchCard(cardId: string): Promise<Card | null> {
  const { data, error } = await supabase
    .from('cards')
    .select(CARD_FEED_SELECT)
    .eq('id', cardId)
    .single()

  if (error) {
    console.error('[fetchCard]', error)
    return null
  }

  const card = data as Card
  // ★is_public gate: 非公開 (棚) カードは所有者本人以外には返さない (id 直取得の漏れを塞ぐ)。
  //   本人は自分の非公開カードを見られる (fetchUserCards と同じ設計思想=可視性軸は所有と直交)。
  //   RLS 側は is_public 未実装 (③) のため DB は行を返す → クライアントで gate する。
  //   uid は getSession (ローカル参照・ネットワーク不要) から取得し、fetchCard の
  //   シグネチャを変えない (呼出側 listing/[id] 等の変更ゼロ)。
  if (card.is_public === false) {
    const { data: sessionData } = await supabase.auth.getSession()
    const viewerId = sessionData.session?.user?.id ?? null
    if (viewerId !== card.owner_user_id) return null
  }

  return card
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
    throw error // 案C/STEP2: 握らず throw (呼出側 try/catch で loadFailed)
  }

  return data as Profile
}

export async function fetchUserCards(
  userId: string,
  statusFilter: 'active' | 'all' = 'active'
): Promise<Card[]> {
  let query = supabase
    .from('cards')
    .select(`*, ${CARD_WANT_LINKS_SELECT}`)
    .eq('owner_user_id', userId)

  if (statusFilter === 'active') {
    query = query.eq('status', 'active')
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchUserCards]', error)
    throw error // 案C/STEP2: 握らず throw (呼出側 try/catch で loadFailed)
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
    .select('*, card:cards(*, owner:profiles(id, handle, display_name))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchMyLikedCards]', error)
    return []
  }
  const rows = (data ?? []) as unknown as LikedCardWithCard[]
  // ★status/is_public フィルタ (従来は未フィルタ)。/likes は他人の公開出品の保存一覧のため、
  //   active かつ公開 (is_public !== false) のみ残す。card join は防御的に null チェック。
  return rows.filter(
    (r) =>
      r.card != null &&
      r.card.status === 'active' &&
      r.card.is_public !== false,
  )
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
    throw error // 案C: 握らず throw (呼出側 try/catch で loadFailed)
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
    throw error // 案C/STEP2: 握らず throw (呼出側 try/catch で loadFailed)
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
    .select('*, owner:profiles!wanted_cards_user_id_fkey(id, handle, display_name)')
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

/** 双方向マッチ照合の入力軸 (自分の譲 / 求)。master ID chip 配列 (PR-2a)。 */
export interface DirectMatchAxes {
  characters: string[]
  works: string[]
  itemTypes: string[]
}

/**
 * 直接交換マッチング結果: 相手の Profile + 提供 card。
 * ★PR-2a で wanted_card(wanted_cards 由来) を廃止。相手の求は offering_card.want_* で表現し、
 *   表示側は formatStructuredWant で組む (②統一と整合)。
 */
export interface DirectMatchResult {
  user: Profile
  offering_card: Card // 相手が持つ card (双方向: 自分の求と一致 かつ 相手の求が自分の譲と一致)
  score: number // 噛み合い度 (scoreOf: characters tier + item_types/works overlap 加点)。PR-2c の集約/並びで使用。
}

/**
 * 直接交換マッチング (PR-2a: master ID の双方向 overlap を 1 クエリで判定)。
 *
 * 双方向条件 (characters 一致でフィルタ、overlap≧1):
 *   - cards.characters      && myWants.characters   … 相手の譲が自分の求メンバーを含む
 *   - cards.want_characters && myOffers.characters  … 相手の求が自分の譲メンバーを含む
 *   両方満たす card = 相互交換可能。どちらかの characters が空なら成立不能 → 早期 []。
 *
 * item_types はフィルタに使わず (絞らない)、score 加点で上位へ (種別まで合うほど先頭)。
 * works は任意で score 加点。並びは scoreSearchMatch(単独優先 tier) + item_types/works overlap。
 *
 * legacy 保険: characters[] 空の旧 card は overlap で落ちるため、offer 側のみ
 *   name ILIKE(myWants の char 表示名) を OR 併存 (低コスト)。ただし want_characters も
 *   空の完全 legacy card は want 側 AND で結局落ちる (bidirectional 不能)。
 *
 * 入力は master ID chip 配列 (DirectMatchAxes)。検索 UI(PR-2b) / ホーム(PR-2c) が
 *   入力源を変えて同一エンジンを叩けるよう設計。overlap は GIN index-backed (既存)。
 */
export async function searchDirectMatch(params: {
  myOffers: DirectMatchAxes
  myWants: DirectMatchAxes
  excludeUserId?: string | null
  excludeOwnerIds?: string[]
  limit?: number
  // owner 単位集約。既定 true = 1 オーナー最上位 1 件 (マッチタブ/ホーム)。
  //   false = 集約せず該当カード全件 (求タブ・譲タブと挙動統一)。後方互換。
  dedupByOwner?: boolean
}): Promise<DirectMatchResult[]> {
  const { myOffers, myWants } = params
  // ★指定された軸だけを条件に積む (必須軸なし)。全6軸空なら何も返さない (案A)。
  const axisTotal =
    myOffers.works.length +
    myOffers.characters.length +
    myOffers.itemTypes.length +
    myWants.works.length +
    myWants.characters.length +
    myWants.itemTypes.length
  if (axisTotal === 0) return []

  const excludeOwnerIds = params.excludeOwnerIds ?? []
  const excludeFilter =
    excludeOwnerIds.length > 0 ? `(${excludeOwnerIds.join(',')})` : null

  let query = supabase
    .from('cards')
    .select(`*, owner:profiles!cards_owner_user_id_fkey(id, handle, display_name), ${CARD_WANT_LINKS_SELECT}`)
    .eq('status', 'active')
    .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)

  // myWants 側 = 相手の譲 (card offers) が自分の求を含む。指定軸のみ AND。
  //   work_id は単一 text (scalar) なので overlap でなく in (card の作品 ∈ 自分の求作品)。
  if (myWants.works.length > 0) query = query.in('work_id', myWants.works)
  if (myWants.characters.length > 0) query = query.overlaps('characters', myWants.characters)
  if (myWants.itemTypes.length > 0) query = query.overlaps('item_types', myWants.itemTypes)

  // myOffers 側 = 相手の求 (card wants) が自分の譲を含む。want_* は text[] なので overlap。
  if (myOffers.works.length > 0) query = query.overlaps('want_works', myOffers.works)
  if (myOffers.characters.length > 0) query = query.overlaps('want_characters', myOffers.characters)
  if (myOffers.itemTypes.length > 0) query = query.overlaps('want_item_types', myOffers.itemTypes)

  query = query.order('created_at', { ascending: false }).limit(100)

  if (params.excludeUserId != null && params.excludeUserId !== '') {
    query = query.neq('owner_user_id', params.excludeUserId)
  }
  if (excludeFilter != null) {
    query = query.not('owner_user_id', 'in', excludeFilter)
  }

  const { data, error } = await query
  if (error) {
    console.error('[searchDirectMatch]', error)
    throw error // 案C: 握らず throw (呼出側 try/catch で loadFailed)
  }
  const cards = (data ?? []) as (Card & { owner: Profile | null })[]

  // score: characters tier (scoreSearchMatch 単独優先) + item_types/works overlap 加点。
  const tierScore: Record<SearchMatchScore, number> = {
    strong: 30,
    medium: 20,
    weak: 10,
    none: 0,
  }
  const overlapCount = (a: string[] | undefined | null, b: string[]): number => {
    if (a == null || a.length === 0 || b.length === 0) return 0
    const set = new Set(b)
    return a.filter((x) => set.has(x)).length
  }
  const scoreOf = (card: Card): number => {
    let s = tierScore[scoreSearchMatch(card, myWants.characters, myWants.itemTypes)]
    // 種別まで合うほど上位 (双方向: 相手の譲種別∋自分の求種別 / 相手の求種別∋自分の譲種別)。
    s += overlapCount(card.item_types, myWants.itemTypes) * 15
    s += overlapCount(card.want_item_types, myOffers.itemTypes) * 15
    // works 一致 (任意・微加点)。
    s += overlapCount(card.want_works, myOffers.works) * 5
    if (card.work_id != null && myWants.works.includes(card.work_id)) s += 5
    return s
  }

  // score 降順で並べる。score は result に露出する (PR-2c)。
  const dedupByOwner = params.dedupByOwner ?? true
  const scored = cards.map((card) => ({ card, s: scoreOf(card) }))
  scored.sort((a, b) => b.s - a.s)
  const results: DirectMatchResult[] = []
  const usedUserIds = new Set<string>()
  for (const { card, s } of scored) {
    if (card.owner == null) continue
    // dedupByOwner=true (既定): 1 オーナー最上位 1 件のみ (マッチタブ/ホーム不変)。
    //   false: owner 集約せず該当カードを全件出す (求タブ・譲タブと挙動統一)。
    if (dedupByOwner) {
      if (usedUserIds.has(card.owner_user_id)) continue
      usedUserIds.add(card.owner_user_id)
    }
    results.push({ user: card.owner, offering_card: card, score: s })
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
    is_public: true, // 顔2: 通常出品は公開 (商品棚=false は顔2本体で別途)
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
      proposer:profiles!offers_proposer_user_id_fkey(id, handle, display_name),
      target_card:cards!offers_target_card_id_fkey(
        *,
        owner:profiles(id, handle, display_name)
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
    throw error // 案C: 握らず throw (呼出側 try/catch で loadFailed)
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
      proposer:profiles!offers_proposer_user_id_fkey(id, handle, display_name),
      target_card:cards!offers_target_card_id_fkey(
        *,
        owner:profiles(id, handle, display_name)
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
// コンテンツ通報 (content_reports) — 審査要件 Apple 1.2 の本格版。
// 器・RPC は本番適用済 (create_content_report / get_content_reports /
//   operator_resolve_content_report / operator_accounts)。ここはその薄いクライアント。
// ※ 旧 createReport (reports テーブル) は content_reports に一本化のため書込停止。
//    createReport 関数自体は非破壊で残置 (未使用)。
// ─────────────────────────────────────────

// card 6 + user 5 (other 共有) = 10 値。UI で対象別に出し分ける。
export type ContentReportCategory =
  | 'prohibited_item'
  | 'counterfeit'
  | 'inappropriate_image'
  | 'spam'
  | 'miscategorized'
  | 'harassment'
  | 'monetary_demand'
  | 'impersonation'
  | 'inappropriate_profile'
  | 'other'

export type ContentReportStatus = 'open' | 'actioned' | 'dismissed'

// get_content_reports RPC の返す 1 行 (card/reporter/対象user を join 済)。
export type ContentReportRow = {
  id: string
  reporter_id: string
  reporter_handle: string | null
  reporter_display_name: string | null
  reported_card_id: string | null
  card_name: string | null
  card_image_url: string | null
  card_is_public: boolean | null
  card_owner_id: string | null
  reported_user_id: string | null
  reported_user_handle: string | null
  reported_user_display_name: string | null
  category: ContentReportCategory
  note: string | null
  status: ContentReportStatus
  created_at: string
  resolved_at: string | null
}

/**
 * コンテンツ通報を作成する (create_content_report RPC、SECURITY DEFINER)。
 * reporter=auth.uid() はサーバ導出。cardId / userId のどちらか一方のみ渡す (XOR)。
 * 想定エラー(error.message): AUTH_REQUIRED / TARGET_REF_INVALID / INVALID_CATEGORY /
 *   TARGET_NOT_FOUND / SELF_REPORT_NOT_ALLOWED / ALREADY_REPORTED。
 */
export async function createContentReport(params: {
  cardId?: string | null
  userId?: string | null
  category: ContentReportCategory
  note?: string | null
}): Promise<void> {
  const cardId = params.cardId ?? null
  const userId = params.userId ?? null
  if ((cardId == null) === (userId == null)) {
    // 両 NULL / 両指定は RPC でも弾かれるが、往復コストを避けて先に投げる
    throw new Error('TARGET_REF_INVALID')
  }
  const { error } = await supabase.rpc('create_content_report', {
    p_card_id: cardId,
    p_user_id: userId,
    p_category: params.category,
    p_note: params.note ?? null,
  })
  if (error != null) {
    throw new Error(error.message !== '' ? error.message : 'CREATE_CONTENT_REPORT_FAILED')
  }
}

/**
 * 運営用: 通報一覧を取得する (get_content_reports RPC、operator_accounts ゲート)。
 * 非 operator が呼ぶと NOT_OPERATOR。status 省略で全件、指定で絞り込み。
 */
export async function getContentReports(
  status?: ContentReportStatus,
): Promise<ContentReportRow[]> {
  const { data, error } = await supabase.rpc('get_content_reports', {
    p_status: status ?? null,
  })
  if (error != null) {
    throw new Error(error.message !== '' ? error.message : 'GET_CONTENT_REPORTS_FAILED')
  }
  return (data as ContentReportRow[]) ?? []
}

/**
 * 運営用: 通報を対処する (operator_resolve_content_report RPC、operator ゲート)。
 * 'unpublish' = 対象出品を is_public=false + status='actioned'、
 * 'dismiss'   = status='dismissed'。非 operator は NOT_OPERATOR。
 */
export async function operatorResolveContentReport(
  reportId: string,
  action: 'unpublish' | 'dismiss',
): Promise<void> {
  const { error } = await supabase.rpc('operator_resolve_content_report', {
    p_report_id: reportId,
    p_action: action,
  })
  if (error != null) {
    throw new Error(error.message !== '' ? error.message : 'RESOLVE_CONTENT_REPORT_FAILED')
  }
}

/**
 * 自分が運営 (operator_accounts に登録) かを判定する。
 * operator_accounts は "Anyone can read" RLS のため authenticated が自分の行を直読み可能。
 * 運営リンク/画面の表示制御用 (実際の権限は各 RPC の operator ゲートで二重に担保)。
 */
export async function isOperator(): Promise<boolean> {
  const { data: authData } = await supabase.auth.getUser()
  const uid = authData.user?.id
  if (uid == null) return false
  const { data, error } = await supabase
    .from('operator_accounts')
    .select('user_id')
    .eq('user_id', uid)
    .maybeSingle()
  if (error != null) {
    console.error('[isOperator]', error)
    return false
  }
  return data != null
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
  // 住所分離 Step C-1 (2026-07-06): 住所は profiles から user_shipping_addresses に分離。
  //   本人限定 RLS のテーブルを参照。未登録ユーザーは 0 行のため single() ではなく
  //   maybeSingle() を使い、行が無くても error にせず null を返す (呼出側は ?? '' 空表示済)。
  const { data, error } = await supabase
    .from('user_shipping_addresses')
    .select('shipping_name, postal_code, address_line1, address_line2')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[fetchShippingAddress]', error)
    return null
  }

  return data ?? null
}

export async function updateShippingAddress(params: {
  userId: string
  shippingName: string
  postalCode: string
  addressLine1: string
  addressLine2: string | null
}): Promise<void> {
  // 住所分離 Step C-2 (2026-07-06): 住所は user_shipping_addresses に分離。
  //   旧 .update().eq() は「profiles 行が必ず存在」前提だったが、新テーブルは
  //   初回未登録で行が無いため upsert (user_id を conflict target) に変更。
  const { error } = await supabase
    .from('user_shipping_addresses')
    .upsert(
      {
        user_id: params.userId,
        shipping_name: params.shippingName,
        postal_code: params.postalCode,
        address_line1: params.addressLine1,
        address_line2: params.addressLine2 ?? null,
      },
      { onConflict: 'user_id' },
    )

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
      .select(CARD_FEED_SELECT)
      .eq('status', 'active')
      .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
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
        throw error // 案C: 握らず throw (呼出側 try/catch で loadFailed)
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
        .select(CARD_FEED_SELECT)
        .eq('status', 'active')
        .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
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
        // 案C: 部分成功を返さず throw (機内=全失敗。部分失敗も「読み込めませんでした」を優先)。
        throw result.error
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
      .select(CARD_FEED_SELECT)
      .eq('status', 'active')
      .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
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
      .select(CARD_FEED_SELECT)
      .eq('status', 'active')
      .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
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
      .select(CARD_FEED_SELECT)
      .eq('status', 'active')
      .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
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
      // 案C: 部分成功を返さず throw (機内=全失敗。部分失敗も「読み込めませんでした」を優先)。
      throw result.error
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
    .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
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
    .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
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
    .select(CARD_FEED_SELECT)
    .eq('status', 'active')
    .eq('is_public', true) // 顔2: 公開出品のみ (商品棚除外)
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
    throw error // 案C/STEP3: 握らず throw (呼出側 try/catch で loadFailed)。caller: home✓/oshi-edit✓/shelf(dead・防御catch)
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
  // PR-V2: 会場一覧画面の主要 fetch。タイムアウト時は VenueFetchTimeoutError throw、
  //   呼出側 (app/venue/index.tsx) が catch して venuesLoadFailed=true に倒し、
  //   「うまく読み込めませんでした [再試行]」を表示する。
  //   network 以外のエラーは既存通り console.error + 空配列 silent fallback。
  return withVenueTimeout('fetchVenues', (async () => {
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
      // PR-V2-fix2: ネットワーク起因なら throw して上位の failed UI を起動。
      //   DB エラー (PostgrestError 等) は従来通り silent fallback (空配列) で抑制。
      //   再試行で解決し得るか否かで切り分ける (DB エラーは再試行ループに陥るため silent)。
      if (isNetworkErrorObject(error)) {
        throw new VenueNetworkError('fetchVenues', error)
      }
      console.error('[fetchVenues]', error)
      return []
    }

    return (data ?? []) as Venue[]
  })())
}

/**
 * 単一 venue 行取得 (venues は RLS 上 SELECT 全員可、migration_venue.sql)。
 * 会場詳細画面 (app/venue/[id].tsx) の文脈ヘッダー (イベント名・日付・開催中状態) で使用。
 * 取得失敗 / 未存在は null 返却で UI 側がヘッダー非表示にフォールバックする。
 */
export async function fetchVenue(venueId: string): Promise<Venue | null> {
  // PR-3.6a: work_id を選択列に追加 (master_works 紐付けの土台)。
  // ⚠️ 適用順序: docs/migration_venue_add_work_id.sql を本番 DB に先に適用してから
  //   本コードを merge すること。未適用の DB だと PostgREST が
  //   'column work_id does not exist' で 400 を返し fetchVenue が null となり、
  //   会場文脈ヘッダーが silent に非表示になる。詳細は migration ファイル冒頭参照。
  // PR-V1: withVenueTimeout で 8s タイムアウト。timeout 時は VenueFetchTimeoutError を
  //   throw、呼出側 (loadVenueContext) が catch して既存 null fallback と同じ挙動。
  //   PostgrestBuilder は thenable だが Promise<T> ではないため IIFE で包んで Promise 化。
  return withVenueTimeout('fetchVenue', (async () => {
    const { data, error } = await supabase
      .from('venues')
      .select(
        'id, title, venue_name, event_date, starts_at, ends_at, status, created_at, work_id',
      )
      .eq('id', venueId)
      .single()

    if (error) {
      // PR-V2-fix2: ネットワーク起因なら throw、DB エラーは従来通り null fallback。
      if (isNetworkErrorObject(error)) {
        throw new VenueNetworkError('fetchVenue', error)
      }
      console.error('[fetchVenue]', error)
      return null
    }

    return data as Venue
  })())
}

export async function fetchMyCheckin(
  venueId: string,
  userId: string
): Promise<VenueCheckin | null> {
  // PR-V2: 会場一覧画面の付随 fetch (個別 venue の自分のチェックイン有無)。
  //   タイムアウト時は VenueFetchTimeoutError throw、呼出側 (app/venue/index.tsx)
  //   が Promise.allSettled で個別 catch して null fallback (= 「未チェックイン」扱い)。
  //   主要 fetch (fetchVenues) が成功していれば画面全体は失敗扱いにしない。
  return withVenueTimeout('fetchMyCheckin', (async () => {
    const { data, error } = await supabase
      .from('venue_checkins')
      .select('*')
      .eq('venue_id', venueId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      // PR-V2-fix2: ネットワーク起因なら throw、DB エラーは従来通り null fallback。
      if (isNetworkErrorObject(error)) {
        throw new VenueNetworkError('fetchMyCheckin', error)
      }
      console.error('[fetchMyCheckin]', error)
      return null
    }

    return data as VenueCheckin | null
  })())
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
  // PR-V1: withVenueTimeout で 8s タイムアウト。timeout 時は VenueFetchTimeoutError を
  //   throw、呼出側が catch して checkinCountFailed flag をセット (「— 人参加中」表示)。
  //   PostgrestBuilder は thenable だが Promise<T> ではないため IIFE で包んで Promise 化。
  // C安全系①(④): venue_checkins への直 count head (全行 SELECT を要する) を廃し、
  //   SECURITY DEFINER RPC get_venue_checkin_count に差し替え。件数のみ返り user_id は
  //   一切露出しない。SELECT policy を当事者限定に絞った後 (③) も RPC は RLS を跨ぐため
  //   同じ件数を返す (絞り前後で不変)。インターフェース (Promise<number>・失敗 fallback) は据え置き。
  return withVenueTimeout('fetchVenueCheckinCount', (async () => {
    const { data, error } = await supabase.rpc('get_venue_checkin_count', {
      p_venue_id: venueId,
    })

    if (error) {
      // PR-V2-fix2: ネットワーク起因なら throw、DB エラーは従来通り 0 fallback。
      if (isNetworkErrorObject(error)) {
        throw new VenueNetworkError('fetchVenueCheckinCount', error)
      }
      console.error('[fetchVenueCheckinCount]', error)
      return 0
    }

    return (data as number | null) ?? 0
  })())
}

// 会場の active 出品数を SECURITY DEFINER RPC で取得 (熱量/点火の集計元)。
// get_venue_checkin_count と同型: 件数のみ返り user_id 非露出、RLS を跨ぐ。
// グレースフル劣化: RPC 未適用/失敗時は 0 を返す (熱量リングは控えめ表示になるだけ)。
export async function fetchVenueSupplyCount(venueId: string): Promise<number> {
  return withVenueTimeout('fetchVenueSupplyCount', (async () => {
    const { data, error } = await supabase.rpc('get_venue_supply_count', {
      p_venue_id: venueId,
    })

    if (error) {
      if (isNetworkErrorObject(error)) {
        throw new VenueNetworkError('fetchVenueSupplyCount', error)
      }
      console.error('[fetchVenueSupplyCount]', error)
      return 0
    }

    return (data as number | null) ?? 0
  })())
}

/**
 * 当日掲示板 (Live Supply Board) に表示する supply_post を取得。
 *
 * 当日掲示板は「他人の post を探す場所」として運用するため、`excludeUserId` を
 * 渡すと自分の post を server-side で除外する (後方互換: 未指定 / null なら除外なし)。
 * 自分の post 管理は /venue/my-posts (`fetchMySupplyPosts`) に集約する。
 */
export async function fetchSupplyPosts(
  venueId: string,
  excludeUserId?: string | null
): Promise<VenueSupplyPost[]> {
  // PR-V1: 2 段クエリ (supply_posts SELECT + profiles SELECT) の合計を 1 タイマーで
  //   包む。8s 超えたら VenueFetchTimeoutError を throw、呼出側 (loadSupply) が catch
  //   して既存の空配列 fallback と同じ挙動。
  return withVenueTimeout('fetchSupplyPosts', (async () => {
    const now = new Date().toISOString()

    let query = supabase
      .from('venue_supply_posts')
      .select('*')
      .eq('venue_id', venueId)
      .eq('status', 'active')
      .gt('expires_at', now)
      .order('created_at', { ascending: false })

    if (excludeUserId != null) {
      query = query.neq('user_id', excludeUserId)
    }

    const { data, error } = await query

    if (error) {
      // PR-V2-fix2: ネットワーク起因なら throw、DB エラーは従来通り空配列 fallback。
      if (isNetworkErrorObject(error)) {
        throw new VenueNetworkError('fetchSupplyPosts', error)
      }
      console.error('[fetchSupplyPosts]', error)
      return []
    }

    const posts = (data ?? []) as VenueSupplyPost[]

    // poster情報を別クエリで取得
    const userIds = [...new Set(posts.map((p) => p.user_id))]
    if (userIds.length === 0) return posts

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, handle, display_name, trade_count, ship_rate, trouble_count')
      .in('id', userIds)

    if (profilesError) {
      // PR-V2-fix2: 2 段目もネットワーク起因なら throw (1 段目成功 + 2 段目ネットワーク失敗は
      //   事実上の網羅的ネットワーク不調、failed UI に倒すのが妥当)。
      //   DB エラーなら従来通り continue (profile 情報なしで posts は表示する)。
      if (isNetworkErrorObject(profilesError)) {
        throw new VenueNetworkError('fetchSupplyPosts.profiles', profilesError)
      }
      console.error('[fetchSupplyPosts] profiles', profilesError)
    }

    const profileMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p])
    )

    return posts.map((post) => ({
      ...post,
      poster: profileMap[post.user_id] ?? undefined,
    }))
  })())
}

export async function addSupplyPost(params: {
  venueId: string
  userId: string
  cardName: string
  groupName: string | null
  wantCard: string | null
  // PR3: 会場投稿の画像 publicUrl (任意)。事前に uploadCardImage で上げて
  // 戻り値の publicUrl を渡す想定。
  imageUrl?: string | null
  // PR-3.6b: 通常出品 cards と同じハイブリッドマスタ構造化 (master slug + freeText 混在)。
  // 全て optional、未指定なら DB default (work_id=NULL, *[]='{}') が入る。
  // 詳細: docs/migration_venue_supply_posts_master.sql
  workId?: string | null
  characters?: string[]
  itemTypes?: string[]
  wantCharacters?: string[]
  wantItemTypes?: string[]
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

  // PR-3.6b: 新規列は値が渡されたときだけ insert payload に含める。
  // 未指定 (undefined) なら payload に key 自体を入れず、DB の default に委ねる。
  // (migration 未適用環境で payload に未知の列を送ると PostgREST が
  //  'column ... does not exist' エラーを返すため、明示的に指定された場合のみ送る)
  const payload: Record<string, unknown> = {
    venue_id: params.venueId,
    user_id: params.userId,
    card_name: params.cardName,
    group_name: params.groupName,
    want_card: params.wantCard,
    image_url: params.imageUrl ?? null,
    expires_at: expiresAt,
  }
  if (params.workId !== undefined) payload.work_id = params.workId
  if (params.characters !== undefined) payload.characters = params.characters
  if (params.itemTypes !== undefined) payload.item_types = params.itemTypes
  if (params.wantCharacters !== undefined) payload.want_characters = params.wantCharacters
  if (params.wantItemTypes !== undefined) payload.want_item_types = params.wantItemTypes

  const { data, error } = await supabase
    .from('venue_supply_posts')
    .insert(payload)
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
    throw error // 案C: 握らず throw (呼出側 try/catch で loadFailed)。付随 profile/supply join は best-effort のまま。
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
  // Critical③ ③-A: 直接 UPDATE を廃し decline_venue_hold DEFINER RPC に集約。
  //   actor は サーバが auth.uid() から導出 (userId 引数はシグネチャ互換のため残すが未送信)。
  //   既存ガード (受信者本人 + pending) は RPC 内に移植済。
  //   docs/migration_rpc_venue_holds_trades_writes.sql
  void userId
  const { error } = await supabase.rpc('decline_venue_hold', {
    p_hold_id: holdId,
  })

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
  // Critical③ ③-A: 直接 UPDATE を廃し cancel_venue_hold DEFINER RPC に集約。
  //   actor は サーバが auth.uid() から導出 (userId 引数はシグネチャ互換のため残すが未送信)。
  //   既存ガード (申請者本人 + pending) は RPC 内に移植済。
  //   docs/migration_rpc_venue_holds_trades_writes.sql
  void userId
  const { error } = await supabase.rpc('cancel_venue_hold', {
    p_hold_id: holdId,
  })

  if (error) throw error
}

// ─────────────────────────────────────────
// PR-5: venue_trade キャンセル申請モデル (4 RPC)
//   docs/migration_venue_trades_cancel_request.sql (列追加)
//   docs/migration_rpc_venue_trade_cancel.sql (4 RPC 定義)
//   各関数は更新後の venue_trades 行 1 件を返す。
//   エラーは raise exception の文字列 (TRADE_NOT_PENDING / CANCEL_NOT_REQUESTED 等) で
//   返るので、UI 側は error.message で分岐する。
// ─────────────────────────────────────────

/** キャンセル申請 (pending かつ未申請のみ可、当事者どちらでも申請可) */
export async function requestVenueTradeCancel(
  tradeId: string,
  userId: string,
): Promise<VenueTrade> {
  const { data, error } = await supabase.rpc('request_venue_trade_cancel', {
    p_trade_id: tradeId,
    p_user_id: userId,
  })
  if (error) throw error
  if (data == null) throw new Error('NO_TRADE_RETURNED')
  return data as VenueTrade
}

/** 申請の取り下げ (申請者本人のみ、pending に戻す) */
export async function withdrawVenueTradeCancel(
  tradeId: string,
  userId: string,
): Promise<VenueTrade> {
  const { data, error } = await supabase.rpc('withdraw_venue_trade_cancel', {
    p_trade_id: tradeId,
    p_user_id: userId,
  })
  if (error) throw error
  if (data == null) throw new Error('NO_TRADE_RETURNED')
  return data as VenueTrade
}

/** キャンセル申請への応答 (申請者以外のみ、accept=true で cancelled、false で pending 復帰) */
export async function respondVenueTradeCancel(
  tradeId: string,
  userId: string,
  accept: boolean,
): Promise<VenueTrade> {
  const { data, error } = await supabase.rpc('respond_venue_trade_cancel', {
    p_trade_id: tradeId,
    p_user_id: userId,
    p_accept: accept,
  })
  if (error) throw error
  if (data == null) throw new Error('NO_TRADE_RETURNED')
  return data as VenueTrade
}

/** 2 時間タイムアウト後の申請者による確定 (申請者本人のみ、cancelled に倒す) */
export async function confirmVenueTradeCancel(
  tradeId: string,
  userId: string,
): Promise<VenueTrade> {
  const { data, error } = await supabase.rpc('confirm_venue_trade_cancel', {
    p_trade_id: tradeId,
    p_user_id: userId,
  })
  if (error) throw error
  if (data == null) throw new Error('NO_TRADE_RETURNED')
  return data as VenueTrade
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
  // PR-V1: withVenueTimeout で 8s タイムアウト。timeout 時は VenueFetchTimeoutError を
  //   throw、呼出側 (loadHoldCount) が catch して既存の 0 fallback と同じ挙動。
  return withVenueTimeout('fetchReceivedHoldCount', (async () => {
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
      // PR-V2-fix2: ネットワーク起因なら throw、DB エラーは従来通り 0 fallback。
      if (isNetworkErrorObject(error)) {
        throw new VenueNetworkError('fetchReceivedHoldCount', error)
      }
      console.error('[fetchReceivedHoldCount]', error)
      return 0
    }

    return count ?? 0
  })())
}

/**
 * 自分の supply_post 一覧 (status / expires_at 不問、全件)。
 * /venue/my-posts 用。active / withdrawn / 期限切れ表示を呼出側で判定する。
 */
export async function fetchMySupplyPosts(
  venueId: string,
  userId: string
): Promise<VenueSupplyPost[]> {
  // PR-V1: withVenueTimeout で 8s タイムアウト。timeout 時は VenueFetchTimeoutError を
  //   throw、呼出側 (loadMySupplyPosts) が catch して既存の空配列 fallback と同じ挙動。
  //   PostgrestBuilder は thenable だが Promise<T> ではないため IIFE で包んで Promise 化。
  return withVenueTimeout('fetchMySupplyPosts', (async () => {
    const { data, error } = await supabase
      .from('venue_supply_posts')
      .select('*')
      .eq('venue_id', venueId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      // PR-V2-fix2: ネットワーク起因なら throw、DB エラーは従来通り空配列 fallback。
      if (isNetworkErrorObject(error)) {
        throw new VenueNetworkError('fetchMySupplyPosts', error)
      }
      console.error('[fetchMySupplyPosts]', error)
      return []
    }

    return (data ?? []) as VenueSupplyPost[]
  })())
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
  // 申請者 (proposer) が添付した「自分が出す商品」画像の publicUrl (任意)。
  // 画像なしの従来挙動は proposerImageUrl 省略 / null で維持される。
  // 詳細: docs/migration_venue_holds_add_proposer_image_url.sql
  proposerImageUrl?: string | null
}): Promise<VenueHold> {
  // Critical③ ③-A: 直接 INSERT を廃し create_venue_hold DEFINER RPC に集約。
  //   - proposer_id はサーバが auth.uid() 固定 (params.proposerId は送らない = なりすまし排除)。
  //   - expires_at はサーバ側計算 (event_date の JST 23:59:59 → UTC)。
  //   docs/migration_rpc_venue_holds_trades_writes.sql
  const { data, error } = await supabase.rpc('create_venue_hold', {
    p_venue_id: params.venueId,
    p_receiver_id: params.receiverId,
    p_proposer_card: params.proposerCard,
    p_receiver_card: params.receiverCard,
    p_supply_post_id: params.supplyPostId,
    p_proposer_image_url: params.proposerImageUrl ?? null,
  })

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
 * 会場交換の完了確認 (PR4a で role 中立対称確定に再設計)。
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
  // Critical③ ③-A: SELECT+UPDATE の対称確定を confirm_venue_trade DEFINER RPC に集約。
  //   - role はサーバが auth.uid() から導出 (判断点2: クライアント role を信用しない)。
  //     userId / role 引数はシグネチャ互換のため残すが未送信。
  //   - 冪等性 (終端状態 / 自分側確定済は no-op)、対称派生 status
  //     (片方→partially_confirmed / 両方→completed)、race 防御は RPC 内に移植済。
  //   docs/migration_rpc_venue_holds_trades_writes.sql
  void userId
  void role
  const { error } = await supabase.rpc('confirm_venue_trade', {
    p_trade_id: tradeId,
  })

  if (error) throw error
}

// ─────────────────────────────────────────
// venue_trade 専用 DM (PR5)
//
// 詳細:
//   - docs/venue_mode_requirements.md §8
//   - docs/migration_venue_trade_dm_tables.sql (B1: 2 tables + RLS + grants)
//   - docs/migration_rpc_venue_trade_dm.sql (B2: 4 RPCs)
//   - docs/migration_trigger_venue_trade_system_message.sql (B3: system message trigger)
//
// 設計:
//   - messages / reads テーブルは SELECT only RLS + テーブル GRANT SELECT のみ。
//   - 書き込みは send_venue_trade_message / mark_venue_trade_thread_read RPC のみ。
//   - 送信窓 (P0) は pending / partially_confirmed のみ。RPC が allowlist 判定。
//   - 未読は kind='user' AND sender_id <> auth.uid() のみ対象。
// ─────────────────────────────────────────

/**
 * 指定 trade のメッセージを created_at ASC で取得する。
 *
 * RLS で participant 以外は 0 行になる前提。
 * 上限なしで取得 (β1 段階の取引メッセージは少量、件数膨張は P1 で paging 化検討)。
 */
export async function fetchVenueTradeMessages(
  tradeId: string
): Promise<VenueTradeMessage[]> {
  const { data, error } = await supabase
    .from('venue_trade_messages')
    .select('id, trade_id, sender_id, kind, body, system_event, created_at')
    .eq('trade_id', tradeId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[fetchVenueTradeMessages]', error)
    throw error
  }

  return (data ?? []) as VenueTradeMessage[]
}

/**
 * venue_trade DM のユーザ送信。
 *
 * RPC は send_venue_trade_message(p_trade_id, p_body)。
 * 失敗時の raise exception 文字列を Error.message として呼び出し側に伝える:
 *   - AUTH_REQUIRED, BODY_EMPTY, BODY_TOO_LONG, TRADE_NOT_FOUND,
 *     NOT_PARTICIPANT, SEND_WINDOW_CLOSED, TRADE_CANCELLED
 * UI 側はこの文字列で日本語メッセージを切り替える。
 */
export async function sendVenueTradeMessage(
  tradeId: string,
  body: string
): Promise<VenueTradeMessage> {
  const { data, error } = await supabase.rpc('send_venue_trade_message', {
    p_trade_id: tradeId,
    p_body: body,
  })

  if (error) throw error
  if (data == null) {
    throw new Error('NO_MESSAGE_RETURNED')
  }

  return data as VenueTradeMessage
}

/**
 * venue_trade DM の既読位置 (last_read_at) を now() で upsert する。
 *
 * RPC は mark_venue_trade_thread_read(p_trade_id)。
 * raise exception:
 *   - AUTH_REQUIRED, NOT_PARTICIPANT
 */
export async function markVenueTradeThreadRead(
  tradeId: string
): Promise<VenueTradeRead> {
  const { data, error } = await supabase.rpc('mark_venue_trade_thread_read', {
    p_trade_id: tradeId,
  })

  if (error) throw error
  if (data == null) {
    throw new Error('NO_READ_RECORD_RETURNED')
  }

  return data as VenueTradeRead
}

/**
 * 自分が participant の全 venue_trade を合算した未読メッセージ数 (グローバル)。
 *
 * RPC は get_venue_trade_unread_count()、未認証で auth.uid() が NULL の場合は 0。
 * BottomTabBar の会場タブバッジで使用 (受信 Hold 件数と合算)。
 */
export async function fetchVenueTradeUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_venue_trade_unread_count')

  if (error) {
    console.error('[fetchVenueTradeUnreadCount]', error)
    throw error
  }

  if (typeof data !== 'number') return 0
  return data
}

/**
 * per-trade 未読数を一括取得 (N+1 回避)。
 *
 * RPC は get_venue_trade_unread_counts()、行: (trade_id uuid, unread_count int)。
 * 戻り値は Map<trade_id, unread_count>。未読 0 件の trade は行が返らないので、
 * 呼び出し側は map.get(id) ?? 0 で取り回す。
 */
export async function fetchVenueTradeUnreadCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('get_venue_trade_unread_counts')

  if (error) {
    console.error('[fetchVenueTradeUnreadCounts]', error)
    throw error
  }

  const result = new Map<string, number>()
  for (const row of (data ?? []) as VenueTradeUnreadCountRow[]) {
    if (row.trade_id != null) {
      result.set(row.trade_id, Number(row.unread_count) || 0)
    }
  }
  return result
}

// ─────────────────────────────────────────
// 取引 DM (trade_messages / trade_reads) — PR-DM
//   会場 DM と同型だが列名 sender_user_id / RPC は trade 版。
//   全 RPC は auth.uid() 前提で p_user_id を送らない (RLS/participant はサーバ側)。
// ─────────────────────────────────────────

/** 取引スレッドのメッセージ全件を時系列で取得 (RLS で participant 以外 0 行)。 */
export async function fetchTradeMessages(tradeId: string): Promise<TradeMessage[]> {
  const { data, error } = await supabase
    .from('trade_messages')
    .select('id, trade_id, sender_user_id, kind, body, system_event, created_at')
    .eq('trade_id', tradeId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[fetchTradeMessages]', error)
    throw error
  }
  return (data ?? []) as TradeMessage[]
}

/**
 * 取引 DM のユーザ送信。RPC send_trade_message(p_trade_id, p_body)。
 * ★戻り値は json { message, cod_warning }。cod_warning=true のとき送信は通しつつ
 *   呼び出し側が「元払いのみ」警告ポップアップを出す。
 * raise exception: AUTH_REQUIRED / BODY_EMPTY / BODY_TOO_LONG / TRADE_NOT_FOUND /
 *   NOT_PARTICIPANT / SEND_WINDOW_CLOSED / MESSAGE_BLOCKED:<category>
 * ※禁止ワード検知はサーバ側 detect_blocked_category が唯一の源。JS 側で再実装しない。
 */
export async function sendTradeMessage(
  tradeId: string,
  body: string
): Promise<SendTradeMessageResult> {
  const { data, error } = await supabase.rpc('send_trade_message', {
    p_trade_id: tradeId,
    p_body: body,
  })

  if (error) throw error
  if (data == null) {
    throw new Error('NO_MESSAGE_RETURNED')
  }

  const row = data as { message?: unknown; cod_warning?: unknown }
  if (row.message == null) {
    throw new Error('NO_MESSAGE_RETURNED')
  }
  return {
    message: row.message as TradeMessage,
    cod_warning: row.cod_warning === true,
  }
}

/** 取引 DM の既読位置 (last_read_at) を now() で upsert。RPC mark_trade_thread_read(p_trade_id)。 */
export async function markTradeThreadRead(tradeId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_trade_thread_read', {
    p_trade_id: tradeId,
  })
  if (error) throw error
}

/** 指定取引の未読メッセージ数 (自分宛・自分が送っていない user メッセージ)。 */
export async function fetchTradeUnreadCount(tradeId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_trade_unread_count', {
    p_trade_id: tradeId,
  })
  if (error) {
    console.error('[fetchTradeUnreadCount]', error)
    throw error
  }
  if (typeof data !== 'number') return 0
  return data
}

/** per-trade 未読数を一括取得 (N+1 回避)。戻り値は Map<trade_id, unread_count>。 */
export async function fetchTradeUnreadCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('get_trade_unread_counts')
  if (error) {
    console.error('[fetchTradeUnreadCounts]', error)
    throw error
  }
  const result = new Map<string, number>()
  for (const row of (data ?? []) as TradeUnreadCountRow[]) {
    if (row.trade_id != null) {
      result.set(row.trade_id, Number(row.unread_count) || 0)
    }
  }
  return result
}

/**
 * 指定 venue_trade を 1 件取得 (DM 画面の上部詳細用)。
 *
 * RLS "Participants can manage their venue trades" (FOR ALL) で
 * 非 participant は 0 行になる前提。
 *
 * 取得列は DM 画面で必要な最小セット:
 *   id / venue_id / hold_id / proposer_id / receiver_id
 *   / proposer_card / receiver_card / status
 *   / proposer_confirmed_at / receiver_confirmed_at
 *   / completed_at / created_at / updated_at
 *   / offered_snapshot / wanted_snapshot
 */
export async function fetchVenueTradeById(
  tradeId: string
): Promise<VenueTrade | null> {
  const { data, error } = await supabase
    .from('venue_trades')
    .select(
      'id, venue_id, hold_id, proposer_id, receiver_id, proposer_card, receiver_card, status, proposer_confirmed_at, receiver_confirmed_at, completed_at, created_at, updated_at, offered_snapshot, wanted_snapshot, cancel_requested_at, cancel_requested_by'
    )
    .eq('id', tradeId)
    .maybeSingle()

  if (error) {
    console.error('[fetchVenueTradeById]', error)
    throw error
  }

  return (data as VenueTrade | null) ?? null
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

// ─────────────────────────────────────────
// Trade Reports (Trust 質 PR、β1 は収集のみ・表示なし)
// migration_trade_reports.sql / migration_rpc_create_trade_report.sql と対応。
// 申告フォーム UI (Phase 1.5+) から使用予定。
// ─────────────────────────────────────────

export type TradeReportCategory =
  | 'state_mismatch'
  | 'wrong_item'
  | 'poor_packaging'
  | 'late_shipping'
  | 'no_contact'
  | 'not_received'
  | 'venue_noshow'
  | 'other'

export type TradeReport = {
  id: string
  reporter_id: string
  reported_id: string
  normal_trade_id: string | null
  venue_trade_id: string | null
  category: TradeReportCategory
  note: string | null
  photo_path: string | null
  created_at: string
}

/**
 * 取引の質への申告を送信する (Trust 質 PR、β1 は収集のみ)。
 *
 * reported_id / trade_type はサーバ (RPC create_trade_report) で auth.uid() と
 * trade_id から導出されるため、クライアントからは渡さない (成りすまし防止)。
 *
 * 呼出側は normal_trade_id / venue_trade_id のどちらか一方のみ渡す:
 *   - 通常取引の申告: normalTradeId を渡す
 *   - 会場取引の申告: venueTradeId を渡す
 *
 * 申告可能条件は RPC 内で二重検証される:
 *   - 通常 trade: status='completed' かつ completed_at + 7 days > now()
 *   - venue_trade completed: 同上 (venue_noshow を除く 7 カテゴリ)
 *   - venue_trade cancelled + venue_noshow: cancel_requested_at + 7 days > now()
 *
 * 想定エラー: RPC 側の raise exception 文字列がそのまま error.message に載る。
 *   AUTH_REQUIRED / TRADE_REF_INVALID / INVALID_CATEGORY /
 *   VENUE_NOSHOW_INVALID / TRADE_NOT_FOUND / NOT_TRADE_PARTICIPANT /
 *   TRADE_NOT_ELIGIBLE / SELF_REPORT_NOT_ALLOWED / ALREADY_REPORTED
 */
export async function createTradeReport(params: {
  normalTradeId?: string | null
  venueTradeId?: string | null
  category: TradeReportCategory
  note?: string | null
  photoPath?: string | null
}): Promise<TradeReport> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) {
    throw authError
  }
  if (authData.user?.id == null) {
    throw new Error('AUTH_REQUIRED')
  }

  const normalId = params.normalTradeId ?? null
  const venueId = params.venueTradeId ?? null
  if ((normalId == null) === (venueId == null)) {
    // 両方 NULL / 両方 NOT NULL は RPC でも弾かれるが、往復コストを避けて先に投げる
    throw new Error('TRADE_REF_INVALID')
  }

  const { data, error } = await supabase.rpc('create_trade_report', {
    p_normal_trade_id: normalId,
    p_venue_trade_id: venueId,
    p_category: params.category,
    p_note: params.note ?? null,
    p_photo_path: params.photoPath ?? null,
  })

  if (error != null) {
    throw new Error(error.message !== '' ? error.message : 'CREATE_TRADE_REPORT_FAILED')
  }
  return data as TradeReport
}

// ─────────────────────────────────────────
// 交換人数 (Trust 質 PR)
// migration_rpc_get_distinct_partner_count.sql と対応。
// INVOKER RPC のため、常に呼出者自身の数値のみ返る (他人の数値を取る余地なし)。
// ソート・ランキングには使わない前提 (「これまでに X 人と交換」の表示専用)。
// ─────────────────────────────────────────

/**
 * 自分がこれまでに交換した distinct 相手数を返す。
 *
 * 対象:
 *   - trades.status='completed' の参加者相手
 *   - venue_trades.status='completed' の参加者相手
 *   - 両方 UNION の distinct 数
 *
 * INVOKER + 引数なしのため、他人の数値を取る余地はゼロ。
 */
export async function fetchDistinctPartnerCount(): Promise<number> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) {
    throw authError
  }
  if (authData.user?.id == null) {
    throw new Error('AUTH_REQUIRED')
  }

  const { data, error } = await supabase.rpc('get_distinct_partner_count')

  if (error != null) {
    throw new Error(error.message !== '' ? error.message : 'FETCH_PARTNER_COUNT_FAILED')
  }
  return typeof data === 'number' ? data : 0
}

/**
 * ユーザーの Trust 数値を都度算出して取得。RPC get_user_trust(p_user_id) → jsonb。
 * ★profiles の死列 (trade_count / ship_rate / reply_median_hours / trouble_count /
 *   last_active_at) は一切使わない。trades / shipments / venue_trades / trade_reports
 *   から毎回算出される (SECURITY DEFINER)。段階・回復・チャラは全て DB 側で計算済み。
 */
export async function fetchUserTrust(userId: string): Promise<UserTrust> {
  const { data, error } = await supabase.rpc('get_user_trust', {
    p_user_id: userId,
  })
  if (error != null) {
    console.error('[fetchUserTrust]', error)
    throw error
  }
  return data as UserTrust
}

/**
 * 最終アクティブ時刻を更新。RPC touch_last_active() (引数なし・auth.uid() サーバ側)。
 * ★スロットル (前回更新から1時間以内は no-op) は DB 側に内蔵。クライアントで頻度制御しない。
 * best-effort: 失敗しても throw せず warn のみ (バックグラウンド更新のため)。
 */
export async function touchLastActive(): Promise<void> {
  const { error } = await supabase.rpc('touch_last_active')
  if (error != null) {
    console.warn('[touchLastActive]', error)
  }
}
