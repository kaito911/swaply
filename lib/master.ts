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

import { supabase } from './supabase'
import type {
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
 * 全マスタを並列 fetch してキャッシュに投入する。
 * 失敗時は空キャッシュで継続 (autocomplete 不能だがフリーテキスト fallback で出品可)。
 */
export async function initMasterCache(): Promise<void> {
  try {
    const [worksRes, charsRes, typesRes] = await Promise.all([
      supabase.from('master_works').select('*').order('sort_order'),
      supabase.from('master_characters').select('*').order('sort_order'),
      supabase
        .from('master_item_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order'),
    ])

    if (worksRes.error) console.error('[initMasterCache] works', worksRes.error)
    if (charsRes.error) console.error('[initMasterCache] characters', charsRes.error)
    if (typesRes.error) console.error('[initMasterCache] item_types', typesRes.error)

    const works = (worksRes.data ?? []) as MasterWork[]
    const characters = (charsRes.data ?? []) as MasterCharacter[]
    const itemTypes = (typesRes.data ?? []) as MasterItemType[]

    cache = {
      works,
      worksById: new Map(works.map((w) => [w.id, w])),
      characters,
      charactersById: new Map(characters.map((c) => [c.id, c])),
      charactersByWork: groupByWork(characters),
      itemTypes,
      itemTypesById: new Map(itemTypes.map((t) => [t.id, t])),
      ready: true,
    }
  } catch (err) {
    console.error('[initMasterCache]', err)
    // 空キャッシュのまま継続
  }
}

export function isMasterCacheReady(): boolean {
  return cache.ready
}

/** テスト用にキャッシュをクリア (本番コードからは呼ばない) */
export function _resetMasterCacheForTest(): void {
  cache = createEmptyCache()
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
 * SearchSuggestion を UI 表示用の type ラベル文字列に変換する。
 * character は所属 work.category を参照するため getWorkById を経由する。
 */
export function getSearchSuggestionTypeLabel(s: SearchSuggestion): string {
  if (s.type === 'work') {
    return s.data.category === 'idol' ? 'グループ' : '作品'
  }
  if (s.type === 'character') {
    const work = cache.worksById.get(s.data.work_id)
    return work?.category === 'idol' ? 'メンバー' : 'キャラ'
  }
  return 'グッズ種別'
}

// ─────────────────────────────────────────
// user_keyword_history 記録
// ─────────────────────────────────────────

/**
 * 出品時のフリーテキスト入力 (master 未マッチ) を user_keyword_history に記録。
 * source='listing_input' で search 履歴と区別。運営は集計から master 追加判断。
 */
export async function recordListingKeyword(
  userId: string,
  keyword: string,
): Promise<void> {
  const trimmed = keyword.trim()
  if (trimmed === '') return

  const { error } = await supabase.from('user_keyword_history').insert({
    user_id: userId,
    keyword: trimmed,
    source: 'listing_input',
  })

  if (error) console.error('[recordListingKeyword]', error)
}
