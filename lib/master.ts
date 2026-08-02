// lib/master.ts
//
// Master 系 (works / characters / item_types) のクライアント側キャッシュと
// fuzzy filter 関数群、user_keyword_history への記録。
//
// 設計方針 (refactor_plan v1.11 章 3.10、Step 3 Phase 2 設計):
//   - β1 master 規模 (works 3 + chars 73 + types 24 = 100 行) は trivial size
//   - 起動時に全マスタを eager load してメモリキャッシュ (~7KB)
//   - matcher v2 (lib/matcher.ts) は本ファイルの sync 関数を呼ぶため eager 必須
//   - fuzzy filter は display_name_ja / display_name_en / aliases 横断、JS 側 includes
//   - ハイブリッドマスタ: cards.characters[] には master ID と raw text 混在を許容
//
// 使用フロー:
//   1. 起動時に <MasterCacheProvider> から initMasterCache() 呼出
//   2. 出品 form の autocomplete で getXxxSuggestions(input, options) を sync 呼出
//   3. matcher v2 内で findCharacterIdsByText(text) を sync 呼出
//   4. フリーテキスト追加時に recordListingKeyword(userId, text) で履歴記録

import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { reportMasterFetchIssue } from './sentry'
import type {
  Card,
  MasterCategory,
  MasterCharacter,
  MasterItemType,
  MasterWork,
} from './types'

// ─────────────────────────────────────────
// Module-level cache (singleton)
// ─────────────────────────────────────────

interface MasterCacheState {
  works: MasterWork[]
  worksById: Map<string, MasterWork>
  characters: MasterCharacter[]
  charactersById: Map<string, MasterCharacter>
  charactersByWork: Map<string, MasterCharacter[]>
  itemTypes: MasterItemType[]
  itemTypesById: Map<string, MasterItemType>
  ready: boolean
}

function createEmptyCache(): MasterCacheState {
  return {
    works: [],
    worksById: new Map(),
    characters: [],
    charactersById: new Map(),
    charactersByWork: new Map(),
    itemTypes: [],
    itemTypesById: new Map(),
    ready: false,
  }
}

let cache: MasterCacheState = createEmptyCache()

// ─────────────────────────────────────────
// 永続化 + 購読 + リトライ (堅牢化: 修正1/3/4/5/6)
// ─────────────────────────────────────────

// ★バージョン付きキー。master スキーマを変えたら v2 に上げれば旧データは自然に無視される。
const MASTER_CACHE_STORAGE_KEY = 'master_cache_v1'

type MasterTable = 'works' | 'characters' | 'itemTypes'

// その回のネットワーク取得で「error なし かつ 1件以上」を確認できたか (修正5)。
//   0件/エラーは未確認のままにし、リトライ / AppState 復帰の再取得対象にする。
//   ★3本まとめて失敗扱いにはせず、確認できたテーブルだけ true にする。
const networkConfirmed: Record<MasterTable, boolean> = {
  works: false,
  characters: false,
  itemTypes: false,
}

let refreshInFlight = false

// ── 購読 (修正3): モジュール cache を useSyncExternalStore で購読可能にする ──
//   cache は React state ではないため後から埋まっても再描画されない (症状C の主因)。
//   version を単調増加させ getSnapshot に返すことで、cache 差し替え時に購読側を再描画させる。
const listeners = new Set<() => void>()
let cacheVersion = 0

function notify(): void {
  cacheVersion++
  for (const l of listeners) l()
}

export function subscribeMasterCache(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getMasterCacheVersion(): number {
  return cacheVersion
}

// works/characters/itemTypes の3配列から派生 Map 込みの cache を組み立てる。
//   ready = 「3種すべてに1件以上」= 表示・autocomplete が完全に機能する状態。
function buildCache(
  works: MasterWork[],
  characters: MasterCharacter[],
  itemTypes: MasterItemType[],
): MasterCacheState {
  return {
    works,
    worksById: new Map(works.map((w) => [w.id, w])),
    characters,
    charactersById: new Map(characters.map((c) => [c.id, c])),
    charactersByWork: groupByWork(characters),
    itemTypes,
    itemTypesById: new Map(itemTypes.map((t) => [t.id, t])),
    ready: works.length > 0 && characters.length > 0 && itemTypes.length > 0,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function groupByWork(chars: MasterCharacter[]): Map<string, MasterCharacter[]> {
  const map = new Map<string, MasterCharacter[]>()
  for (const c of chars) {
    const arr = map.get(c.work_id)
    if (arr == null) {
      map.set(c.work_id, [c])
    } else {
      arr.push(c)
    }
  }
  return map
}

// ─────────────────────────────────────────
// 初期化 (<MasterCacheProvider> から起動時 1 回呼ぶ)
// ─────────────────────────────────────────

/**
 * 起動時: (1) AsyncStorage の前回スナップショットで即 hydrate して表示可能にし (修正1)、
 * (2) バックグラウンドで最新をネットワーク取得して置き換える (リトライ付き・修正4/5)。
 *
 * 認証は永続化されているのに master だけ毎回コールドで 538 件取り直していた非対称
 * (= 症状(A)(C)/起動遅延の共通原因) を解消する。<MasterCacheProvider> から起動時 1 回呼ぶ。
 */
export async function initMasterCache(): Promise<void> {
  await hydrateFromStorage()
  await refreshMasterCache()
}

// 前回保存分を読み込み cache に投入 (ネットワーク前に名前を出す = 修正1)。
//   破損 / 形不一致 / 旧キーは無視して継続 (空のまま refresh に委ねる)。
async function hydrateFromStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(MASTER_CACHE_STORAGE_KEY)
    if (raw == null) return
    const parsed = JSON.parse(raw) as {
      works?: unknown
      characters?: unknown
      itemTypes?: unknown
    }
    if (
      !Array.isArray(parsed.works) ||
      !Array.isArray(parsed.characters) ||
      !Array.isArray(parsed.itemTypes)
    ) {
      return
    }
    // 既にネットワーク確認済みがあるなら hydrate で上書きしない (最新優先)。
    if (
      networkConfirmed.works ||
      networkConfirmed.characters ||
      networkConfirmed.itemTypes
    ) {
      return
    }
    cache = buildCache(
      parsed.works as MasterWork[],
      parsed.characters as MasterCharacter[],
      parsed.itemTypes as MasterItemType[],
    )
    notify()
  } catch (err) {
    console.error('[master][hydrate]', err)
  }
}

// 3種すべてネットワーク確認済みなら AsyncStorage に coherent なスナップショットを保存。
//   部分確認では保存しない (stale と fresh の混在を避ける)。
async function persistIfComplete(): Promise<void> {
  if (
    !(
      networkConfirmed.works &&
      networkConfirmed.characters &&
      networkConfirmed.itemTypes
    )
  ) {
    return
  }
  try {
    await AsyncStorage.setItem(
      MASTER_CACHE_STORAGE_KEY,
      JSON.stringify({
        works: cache.works,
        characters: cache.characters,
        itemTypes: cache.itemTypes,
      }),
    )
  } catch (err) {
    console.error('[master][persist]', err)
  }
}

function tablesNotConfirmed(): MasterTable[] {
  const out: MasterTable[] = []
  if (!networkConfirmed.works) out.push('works')
  if (!networkConfirmed.characters) out.push('characters')
  if (!networkConfirmed.itemTypes) out.push('itemTypes')
  return out
}

// 1テーブル分の結果を評価。★error あり or 0件は「失敗」とみなし (修正5)、
//   Sentry に captureMessage して (修正6) null を返す。PII は一切含めない。
function evalTableResult<T>(
  dbTable: string,
  res: { data: T[] | null; error: unknown },
): T[] | null {
  const data = (res.data ?? []) as T[]
  const hasError = res.error != null
  if (hasError || data.length === 0) {
    if (hasError) console.error(`[initMasterCache] ${dbTable}`, res.error)
    reportMasterFetchIssue({ table: dbTable, count: data.length, hasError })
    return null
  }
  return data
}

// 未確認テーブルだけを並列 fetch。★成功したものだけ返す (他テーブルの失敗に巻き込まれない)。
async function fetchNeededTables(need: MasterTable[]): Promise<{
  works: MasterWork[] | null
  characters: MasterCharacter[] | null
  itemTypes: MasterItemType[] | null
}> {
  const out = {
    works: null as MasterWork[] | null,
    characters: null as MasterCharacter[] | null,
    itemTypes: null as MasterItemType[] | null,
  }
  await Promise.all(
    need.map(async (t) => {
      if (t === 'works') {
        const res = await supabase.from('master_works').select('*').order('sort_order')
        out.works = evalTableResult<MasterWork>('master_works', res)
      } else if (t === 'characters') {
        const res = await supabase
          .from('master_characters')
          .select('*')
          .order('sort_order')
        out.characters = evalTableResult<MasterCharacter>('master_characters', res)
      } else {
        const res = await supabase
          .from('master_item_types')
          .select('*')
          .eq('is_active', true)
          .order('sort_order')
        out.itemTypes = evalTableResult<MasterItemType>('master_item_types', res)
      }
    }),
  )
  return out
}

// 成功したテーブルだけ cache に反映し、networkConfirmed を立てて notify (=購読側再描画)。
function applyFetched(out: {
  works: MasterWork[] | null
  characters: MasterCharacter[] | null
  itemTypes: MasterItemType[] | null
}): void {
  if (out.works != null) networkConfirmed.works = true
  if (out.characters != null) networkConfirmed.characters = true
  if (out.itemTypes != null) networkConfirmed.itemTypes = true
  cache = buildCache(
    out.works ?? cache.works,
    out.characters ?? cache.characters,
    out.itemTypes ?? cache.itemTypes,
  )
  notify()
}

// 未確認テーブルを指数バックオフでリトライ取得する (修正4/5)。
//   ★機内モード起動 → 途中で機内OFF のケースは、この窓 (最大約31秒) 内のリトライが拾う。
//     前面での機内OFF は AppState 遷移を伴わないため AppState では拾えないため、
//     リトライ窓が実質の回復経路になる (検証3)。
async function refreshMasterCache(): Promise<void> {
  if (refreshInFlight) return
  refreshInFlight = true
  try {
    const backoffMs = [1000, 2000, 4000, 8000, 16000] // 初回試行 + 最大5リトライ
    for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
      const need = tablesNotConfirmed()
      if (need.length === 0) break
      const out = await fetchNeededTables(need)
      applyFetched(out)
      await persistIfComplete()
      if (tablesNotConfirmed().length === 0) break
      if (attempt < backoffMs.length) {
        await delay(backoffMs[attempt])
      }
    }
  } catch (err) {
    console.error('[refreshMasterCache]', err)
  } finally {
    refreshInFlight = false
  }
}

/**
 * AppState が 'active' に戻ったとき、未確認テーブルがあれば再取得する (修正4)。
 * バックグラウンド→復帰での取りこぼし回復用。全確認済みなら no-op。
 */
export function ensureMasterCacheFresh(): void {
  if (tablesNotConfirmed().length === 0) return
  void refreshMasterCache()
}

export function isMasterCacheReady(): boolean {
  return cache.ready
}

/** テスト用にキャッシュをクリア (本番コードからは呼ばない) */
export function _resetMasterCacheForTest(): void {
  cache = createEmptyCache()
  networkConfirmed.works = false
  networkConfirmed.characters = false
  networkConfirmed.itemTypes = false
}

// ─────────────────────────────────────────
// Fuzzy filter helper
// ─────────────────────────────────────────

interface FilterableMaster {
  display_name_ja: string
  display_name_en: string | null
  aliases: string[]
  sort_order: number
}

/**
 * カタカナ → ひらがな 正規化。
 * U+30A1〜U+30F6 (ァ〜ヶ) を -0x60 シフトしてひらがな範囲 (ぁ〜ゖ) に変換する。
 * 中点・長音記号 (ー)・漢字・ローマ字には影響なし。
 * カタカナ↔ひらがな の表記揺れ吸収のみが目的 (漢字↔かな は対象外)。
 */
function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (m) =>
    String.fromCharCode(m.charCodeAt(0) - 0x60),
  )
}

/**
 * 入力 (normalizedInput) と item の各フィールドを比較してマッチスコアを返す。
 *
 * 前提:
 *   - 呼出側 (filterByFuzzyWithScore) で toLowerCase + toHiragana 正規化済の input を渡す
 *   - 本関数内で item.display_name_ja / display_name_en / aliases も同じく正規化する
 *
 * スコア:
 *   完全一致 = 100、startsWith = 80/70、includes = 60、aliases 完全 = 50、
 *   aliases startsWith = 30、aliases includes = 20、未マッチ = 0。
 *
 * カタカナ↔ひらがな の表記揺れは正規化で吸収される (例: 「みんぎゅ」「ミンギュ」相互一致)。
 * 漢字↔かな の変換は辞書が必要なため対象外 (例: 「えどがわこなん」では '江戸川コナン' に hit しない)。
 */
function calcMatchScore<T extends FilterableMaster>(item: T, normalizedInput: string): number {
  const ja = toHiragana(item.display_name_ja.toLowerCase())
  const en = toHiragana((item.display_name_en ?? '').toLowerCase())

  if (ja === normalizedInput || en === normalizedInput) return 100
  if (ja.startsWith(normalizedInput)) return 80
  if (en !== '' && en.startsWith(normalizedInput)) return 70
  if (ja.includes(normalizedInput) || (en !== '' && en.includes(normalizedInput))) return 60

  for (const a of item.aliases) {
    const al = toHiragana(a.toLowerCase())
    if (al === normalizedInput) return 50
    if (al.startsWith(normalizedInput)) return 30
    if (al.includes(normalizedInput)) return 20
  }

  return 0
}

/**
 * 配列を fuzzy filter + ソート (score DESC、score 同点なら sort_order ASC)。
 * 入力が空のときは sort_order 順で全件返す。
 */
function filterByFuzzy<T extends FilterableMaster>(items: T[], input: string): T[] {
  return filterByFuzzyWithScore(items, input).map((x) => x.item)
}

/**
 * filterByFuzzy と同じ scoring ロジックで、score を保持して返す内部版。
 * getUnifiedSearchSuggestions の type 横断 merge ソート用に分離。
 */
function filterByFuzzyWithScore<T extends FilterableMaster>(
  items: T[],
  input: string,
): Array<{ item: T; score: number }> {
  const trimmed = input.trim()
  if (trimmed === '') {
    return [...items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({ item, score: 0 }))
  }

  const normalized = toHiragana(trimmed.toLowerCase())
  return items
    .map((item) => ({ item, score: calcMatchScore(item, normalized) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.item.sort_order - b.item.sort_order
    })
}

// ─────────────────────────────────────────
// Suggestion 関数群 (sync、cache 前提)
// ─────────────────────────────────────────

export function getWorkSuggestions(input: string, limit = 10): MasterWork[] {
  return filterByFuzzy(cache.works, input).slice(0, limit)
}

export function getCharacterSuggestions(
  input: string,
  options: { workId: string; limit?: number },
): MasterCharacter[] {
  const pool = cache.charactersByWork.get(options.workId) ?? []
  return filterByFuzzy(pool, input).slice(0, options.limit ?? 20)
}

/**
 * 検索画面用 (Phase 0.5b): master_characters を work 横断で fuzzy filter。
 * 出品 form の getCharacterSuggestions (workId 必須) と並列、互換性のため touch せず。
 * limit 10 で Phase 1.5 の master 拡大 (K-POP 追加等) に備える。
 */
export function getCharacterSuggestionsAcrossWorks(
  input: string,
  limit = 10,
): MasterCharacter[] {
  return filterByFuzzy(cache.characters, input).slice(0, limit)
}

export function getItemTypeSuggestions(
  input: string,
  options?: { categoryHint?: MasterCategory; limit?: number },
): MasterItemType[] {
  const pool =
    options?.categoryHint != null
      ? cache.itemTypes.filter(
          (t) => t.category_hint === null || t.category_hint === options.categoryHint,
        )
      : cache.itemTypes
  return filterByFuzzy(pool, input).slice(0, options?.limit ?? 15)
}

// ─────────────────────────────────────────
// ID lookup (display 用、sync)
// ─────────────────────────────────────────

export function getWorkById(id: string): MasterWork | undefined {
  return cache.worksById.get(id)
}

export function getCharacterById(id: string): MasterCharacter | undefined {
  return cache.charactersById.get(id)
}

export function getItemTypeById(id: string): MasterItemType | undefined {
  return cache.itemTypesById.get(id)
}

// ─────────────────────────────────────────
// matcher v2 用: text → 該当 master ID 配列
// ─────────────────────────────────────────

/** master_characters のうち text に fuzzy match する ID 配列を返す (sync) */
export function findCharacterIdsByText(text: string): string[] {
  return filterByFuzzy(cache.characters, text).map((c) => c.id)
}

/** master_item_types のうち text に fuzzy match する ID 配列を返す (sync) */
export function findItemTypeIdsByText(text: string): string[] {
  return filterByFuzzy(cache.itemTypes, text).map((t) => t.id)
}

// ─────────────────────────────────────────
// 統合検索サジェスト (master_works + master_characters + master_item_types)
//
// 検索画面 (app/(tabs)/search.tsx TextSearchPane) で type 付きの統合候補を返す。
//
// 設計方針:
//   - 3 テーブルを横断 fuzzy filter (既存 calcMatchScore 流用、表記ゆれ吸収)
//   - 各候補に SearchSuggestion type discriminator を付与、UI 側でラベル出し分け:
//     work + category='idol'  → 「グループ」
//     work + category!='idol' → 「作品」
//     character + work.category='idol' → 「メンバー」
//     character + work.category!='idol' → 「キャラ」
//     item_type → 「グッズ種別」
//   - 全体を score DESC で merge ソート、同 score 内は work > character > item_type
//     (グループ/作品の検索意図が強い傾向)
//   - 既存 getCharacterSuggestionsAcrossWorks / getItemTypeSuggestions / getWorkSuggestions
//     は touch せず、出品 form (work.tsx / characters.tsx / items.tsx) の互換性 100%
// ─────────────────────────────────────────

export type SearchSuggestion =
  | { type: 'work'; data: MasterWork; score: number }
  | { type: 'character'; data: MasterCharacter; score: number }
  | { type: 'item_type'; data: MasterItemType; score: number }

const SUGGESTION_TYPE_ORDER: Record<SearchSuggestion['type'], number> = {
  work: 0,
  character: 1,
  item_type: 2,
}

/**
 * 検索画面用 統合サジェスト関数。
 * works / characters / item_types を横断 fuzzy filter、score DESC で merge して返す。
 * 入力が空のときは空配列 (= 候補非表示シグナル、SearchAutocomplete の minInputChars 判定とは独立)。
 */
export function getUnifiedSearchSuggestions(
  input: string,
  limit = 15,
): SearchSuggestion[] {
  const trimmed = input.trim()
  if (trimmed === '') return []

  const workMatches: SearchSuggestion[] = filterByFuzzyWithScore(cache.works, trimmed).map(
    (x) => ({ type: 'work', data: x.item, score: x.score }),
  )
  const charMatches: SearchSuggestion[] = filterByFuzzyWithScore(
    cache.characters,
    trimmed,
  ).map((x) => ({ type: 'character', data: x.item, score: x.score }))
  const itemMatches: SearchSuggestion[] = filterByFuzzyWithScore(
    cache.itemTypes,
    trimmed,
  ).map((x) => ({ type: 'item_type', data: x.item, score: x.score }))

  return [...workMatches, ...charMatches, ...itemMatches]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return SUGGESTION_TYPE_ORDER[a.type] - SUGGESTION_TYPE_ORDER[b.type]
    })
    .slice(0, limit)
}

/**
 * character 系の属性ラベルを work の category から出し分ける単一情報源。
 *   idol (STARTO/K-POP 等) → 「メンバー」／それ以外 (anime/character/manga/other) → 「キャラ」。
 *   category 不明 (null) は「メンバー」を既定とする (K 指定)。
 * 出品(single-page/bulk)・検索サジェスト・その他で共有し、表記の一貫性を担保する。
 * ※ 表示ラベルのみ。DB カラム characters[] 等は不変。
 */
export function getMemberLabel(category: MasterCategory | null | undefined): string {
  return category === 'idol' ? 'メンバー' : category == null ? 'メンバー' : 'キャラ'
}

/**
 * カード表示用の構造化求 (cards.want_*) を【求】行テキストに整形する。
 *
 * PR-1a 以降の単品出品は wanted_cards + card_wanted_links ではなく want_* を正とするため、
 * カード部品はまず本関数を使い、text=null (= want_* が空 = legacy 出品) のときだけ
 * formatCardTitle の card_wanted_links 由来 want に fallback する (非破壊)。
 *
 * sameSeries: want_works が自分の work_id を含む = 「譲と同シリーズのグッズを求む」。
 *   専用フラグ列を持たず want_works == work_id で導出する (DB 不変)。text 末尾にも
 *   「同シリーズ」を付すため、カード部品は text だけ描画すれば同シリーズ表記も出る。
 *
 * ※ 本関数は master cache lookup を使うため lib/master に置く (types.ts は master を
 *   value import できない循環回避)。cache 未 ready 時は id 文字列に fallback。
 */
export function formatStructuredWant(
  card: Pick<Card, 'work_id' | 'want_works' | 'want_characters' | 'want_item_types'>,
): { text: string | null; sameSeries: boolean } {
  const wantWorks = card.want_works ?? []
  const charNames = (card.want_characters ?? [])
    // ★修正2 (追補): master 未解決時に slug を出さない ('' → filter で除去)。
    //   resolveMembers/resolveGoods と同じ扱い。検索結果 (search.tsx) の slug 露出を解消。
    .map((id) => getCharacterById(id)?.display_name_ja ?? '')
    .filter((s) => s !== '')
  const typeNames = (card.want_item_types ?? [])
    .map((id) => getItemTypeById(id)?.display_name_ja ?? '')
    .filter((s) => s !== '')

  const sameSeries =
    card.work_id != null &&
    card.work_id !== '' &&
    wantWorks.includes(card.work_id)

  // 構造化求が皆無 = legacy 出品 → null (呼出側で card_wanted_links に fallback)
  if (charNames.length === 0 && typeNames.length === 0 && wantWorks.length === 0) {
    return { text: null, sameSeries: false }
  }

  const parts: string[] = []
  if (charNames.length > 0) {
    parts.push(
      charNames.length <= 3
        ? charNames.join('・')
        : `${charNames.slice(0, 3).join('・')} 他${charNames.length - 3}名`,
    )
  }
  if (typeNames.length > 0) {
    parts.push(typeNames.join('・'))
  }
  if (sameSeries) {
    parts.push('同シリーズ')
  }

  const text = parts.length > 0 ? '【求】' + parts.join(' / ') : null
  return { text, sameSeries }
}

// ─────────────────────────────────────────
// 一覧カードの譲/求 3行表示用 (グループ / メンバー / グッズ種別) の per-field ビルダー。
//   ★legacy 列 (group_name/member_name/series) と合成 name は使わない (全出品で null)。
//   構造化 master-id 配列 (work_id/characters/item_types と want_*) を master 解決する。
//   ★版/シリーズは Swaply 設計上構造化しない (現物写真で判別) ため出さない。
// ─────────────────────────────────────────

export interface GiveWantFields {
  group: string // 作品/グループ (work → 表示名)。空文字あり
  member: string // メンバー名 (複数は結合)。空文字あり
  goods: string // グッズ種別 (複数は「・」結合)。空文字あり
}

function resolveGroup(workId: string | null | undefined): string {
  if (workId == null || workId === '') return ''
  return getWorkById(workId)?.display_name_ja ?? ''
}

// メンバー名の結合。★行数は増やさず1行に収める。
//   <=2 名 → 「・」区切りで全表示 / >=3 名 → 先頭2名 + 「他N名」
//   (氏名が途中で切れる=元の不具合を避けるため、tail 省略でなく明示的に丸める)。
function resolveMembers(ids: string[]): string {
  const names = ids
    // ★修正2: master 未解決時に slug を出さない。'' にして下の filter で落とす
    //   (treasure_yoshi は事故に見えるが、空欄は読み込み中に見える)。
    .map((id) => getCharacterById(id)?.display_name_ja ?? '')
    .filter((s) => s !== '')
  if (names.length <= 2) return names.join('・')
  return `${names.slice(0, 2).join('・')} 他${names.length - 2}名`
}

function resolveGoods(ids: string[]): string {
  return ids
    // ★修正2: master 未解決時に slug を出さない ('' → filter で除去)。
    .map((id) => getItemTypeById(id)?.display_name_ja ?? '')
    .filter((s) => s !== '')
    .join('・')
}

/** 譲の3行 (グループ/メンバー/グッズ種別) を master 解決で組む。 */
export function formatStructuredGive(
  card: Pick<Card, 'work_id' | 'characters' | 'item_types'>,
): GiveWantFields {
  return {
    group: resolveGroup(card.work_id),
    member: resolveMembers(card.characters ?? []),
    goods: resolveGoods(card.item_types ?? []),
  }
}

/**
 * 求の3行を master 解決で組む。求が皆無 (works/characters/item_types すべて空) なら
 * null を返す → 呼出側で求ブロックごと非表示 (旧テストデータのみ該当・本番は必須入力)。
 */
export function formatStructuredWantFields(
  card: Pick<Card, 'want_works' | 'want_characters' | 'want_item_types'>,
): GiveWantFields | null {
  const works = card.want_works ?? []
  const chars = card.want_characters ?? []
  const types = card.want_item_types ?? []
  if (works.length === 0 && chars.length === 0 && types.length === 0) return null
  return {
    group: resolveGroup(works[0]),
    member: resolveMembers(chars),
    goods: resolveGoods(types),
  }
}

/**
 * SearchSuggestion を UI 表示用の type ラベル文字列に変換する。
 * character は所属 work.category を参照するため getWorkById を経由する。
 */
export function getSearchSuggestionTypeLabel(s: SearchSuggestion): string {
  if (s.type === 'work') {
    return s.data.category === 'idol' ? 'グループ' : '作品'
  }
  if (s.type === 'character') {
    const work = cache.worksById.get(s.data.work_id)
    return getMemberLabel(work?.category)
  }
  return 'グッズ種別'
}

/**
 * SearchSuggestion を「{所属作品}・{type}」or「{type}」形式のサブラベルに変換する。
 * SearchAutocomplete でメイン名 (display_name_ja) の下に小さく薄い色で表示する想定。
 *
 * 表示例:
 *   character (work あり)  : 'TREASURE・メンバー' / '名探偵コナン・キャラ'
 *   character (work 未解決): 'メンバー' or 'キャラ' (cache に親 work が無い fallback)
 *   work                    : 'グループ' or '作品'
 *   item_type               : 'グッズ種別'
 */
export function getSearchSuggestionSubLabel(s: SearchSuggestion): string {
  const typeLabel = getSearchSuggestionTypeLabel(s)
  if (s.type === 'character') {
    const work = cache.worksById.get(s.data.work_id)
    if (work != null) return `${work.display_name_ja}・${typeLabel}`
  }
  return typeLabel
}

// ─────────────────────────────────────────
// user_keyword_history 記録
// ─────────────────────────────────────────

// user_keyword_history.source のうち出品系で使う値。
//   - 'listing_input': メンバー/種類のフリーテキスト (master 未マッチ、運営の master 追加判断材料)
//   - 'listing_note' : 出品補足の定型句 (補足チップ用。メンバー/種類とプールを分離)
//   DB CHECK は ('search','listing_input','listing_note') を許可 (additive DDL 適用済)。
type ListingKeywordSource = 'listing_input' | 'listing_note'

/**
 * 出品時のフリーテキスト入力を user_keyword_history に記録。
 * デフォルト source='listing_input' (メンバー/種類の free text)。search 履歴と区別。
 * 補足の定型句は source='listing_note' を渡して別プールに記録する (補足チップ用)。
 */
export async function recordListingKeyword(
  userId: string,
  keyword: string,
  source: ListingKeywordSource = 'listing_input',
): Promise<void> {
  const trimmed = keyword.trim()
  if (trimmed === '') return

  const { error } = await supabase.from('user_keyword_history').insert({
    user_id: userId,
    keyword: trimmed,
    source,
  })

  if (error) console.error('[recordListingKeyword]', error)
}

/**
 * 出品補足の履歴チップ用に、自分の補足履歴 (source='listing_note') を取得する。
 *
 * 方式 (fetch 条件): user_id 一致 + source='listing_note' を searched_at 降順で最大 50 行取得し、
 *   クライアント側で keyword 重複を除去 (最初の出現=最新を優先) して直近 unique の上位 limit 件を返す。
 *   → 「直近によく打った補足」の近似。頻度順の集約 (group by) は PostgREST 単体では不可のため、
 *     RPC を足さず「直近 unique」で代替する (native 依存も RPC も増やさない)。
 *   ★source='listing_note' 絞りにより、メンバー/種類 free text (listing_input) は混じらない。
 *   列名は keyword (text ではない)。
 */
export async function fetchListingKeywordHistory(
  userId: string,
  limit = 10,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_keyword_history')
    .select('keyword')
    .eq('user_id', userId)
    .eq('source', 'listing_note')
    .order('searched_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[fetchListingKeywordHistory]', error)
    return []
  }

  const seen = new Set<string>()
  const result: string[] = []
  for (const row of (data ?? []) as { keyword: string }[]) {
    const k = row.keyword
    if (k == null || k === '' || seen.has(k)) continue
    seen.add(k)
    result.push(k)
    if (result.length >= limit) break
  }
  return result
}
