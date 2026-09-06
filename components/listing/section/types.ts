// components/listing/section/types.ts
//
// Phase A: 出品 1 ページ化のための section 共通型。
//
// 6 section (Image / Work / Characters / Items / Want / Condition) の value/onChange
// props と、Phase B で親画面が useReducer で集約する ListingFormState をここに固定する。
//
// 設計方針:
//   - 各 section は controlled component。値と onChange を props で受け取る。
//   - 型は各 section から re-export せず、本ファイルを single source of truth とする。
//   - EnrichedListing は既存 condition.tsx / confirm.tsx が re-declare しているが、
//     既存 7 画面変更禁止のため本 PR ではそちらは touch しない。
//     Phase B で 1 ページ画面本体を作る際、本ファイルの ListingFormState に集約する。

import type { MasterCategory } from '@/lib/types'

// ─────────────────────────────────────────
// ImageSection
// ─────────────────────────────────────────

/** 譲画像 (表面必須 / 裏面任意) */
export type ImageSectionValue = {
  /** 表面 URI (ローカル or upload 後 URL)。null = 未選択 */
  frontUri: string | null
  /** 裏面 URI (任意)。null = 未選択 */
  backUri: string | null
}

// ─────────────────────────────────────────
// WorkSection
// ─────────────────────────────────────────

/**
 * 譲対象の作品 / グループ。
 *   - master 選択時: workId = master_works.id (slug)
 *   - 自由入力時:    workId = ユーザー入力 raw text
 *   - 未選択:        null
 *
 * category は自由入力時にも必須 (cards.category CHECK 制約 5 値に揃える)。
 */
export type WorkSectionValue = {
  workId: string
  category: MasterCategory
} | null

// ─────────────────────────────────────────
// CharactersSection / ItemsSection
// ─────────────────────────────────────────

/**
 * ハイブリッドマスタ ID 配列。
 * master ID (master_characters.id / master_item_types.id) と
 * ユーザー入力 raw text (free text) が混在し得る。
 * 表示時は master cache lookup → 未ヒットなら raw text 直接表示。
 *
 * DB 側 (cards.characters[] / cards.item_types[]) と同構造。
 */
export type HybridMasterIds = string[]

export type CharactersSectionValue = HybridMasterIds
export type ItemsSectionValue = HybridMasterIds

// ─────────────────────────────────────────
// WantSection (現在未使用 = dead。★意図的に温存・削除禁止)
// ─────────────────────────────────────────

/**
 * 求として選択した wanted_cards.id の配列（旧 WantSection のリスト選択方式の値型）。
 *
 * ★現在未使用 (dead)：道2で single-page (PR-1a) / bulk (PR-1b-1) とも
 *   WantMasterSection（求の master 構造化・自由入力＋候補方式）へ移行済み。
 *   どの画面からも参照されていない。
 *
 * ★それでも【意図的に温存】する（削除禁止）：将来「リスト選択方式」へ戻す候補。
 *   商品マスタが十分成熟した時／事務所提携で公式画像を流用できるようになった時に、
 *   WantSection（本型を使う旧UI）へ切り替え直すための資産。
 *   「未参照だから消してよい」と誤判断しないこと。関連: components/listing/section/WantSection.tsx。
 */
export type WantSectionValue = string[]

/**
 * 【PR-1a / single-page 用】master 構造化した求。
 *
 * works / characters / itemTypes は master ID 配列 (ハイブリッド: master ID + free text 混在可)。
 * 出品 submit で cards.want_works[] / want_characters[] / want_item_types[] にそのまま投入する
 * (既存列、DDL 不要)。wanted_cards + card_wanted_links への書込は行わない (案 X を上書き、
 * 版特定を諦めた設計変更に伴い「求は出品時に master 入力・cards.want_* を正」へ方針転換)。
 *
 * sameSeriesAsOffer: 「譲と同シリーズのグッズを求む」チェック状態。
 *   ON のとき works = [譲の work_id]、求メンバーは譲グループ (work_id) 基準で絞る
 *   (譲メンバー基準ではない = コンプ狙いで複数メンバーを求むが成立する)。
 */
export type WantMasterValue = {
  works: string[]
  characters: string[]
  itemTypes: string[]
  sameSeriesAsOffer: boolean
}

// ─────────────────────────────────────────
// ConditionSection
// ─────────────────────────────────────────

/**
 * 求の詳細フリーテキスト + 調整金 (β1 は ADJUSTMENT_MONEY_ENABLED=false で UI 非表示、
 * 値は allows_adjustment=false / adjustment_max=0 が投入される)。
 */
export type ConditionSectionValue = {
  /** 求の詳細・コメント (任意、cards.want_description) */
  want_description: string
  /** 調整金を許可するか (cards.allows_adjustment) */
  allows_adjustment: boolean
  /** 調整金の上限 (cards.adjustment_max、0〜1000) */
  adjustment_max: number
}

// ─────────────────────────────────────────
// ListingFormState — Phase B で親画面 useReducer が集約する型
// ─────────────────────────────────────────

/**
 * 出品 1 ページ画面 (Phase B) の集約 state。
 * 6 section の value を 1 つに束ねた形。confirm 時にこれを DB insert 用 row に変換する。
 *
 * ⚠️ Phase A では未使用 (この型を消費する画面が無いため)。
 *    Phase B で新画面 (single-page.tsx 仮) の useReducer state 型として使う想定。
 *    現段階では single source of truth として位置付けだけ確定する。
 */
export type ListingFormState = {
  image: ImageSectionValue
  work: WorkSectionValue
  characters: CharactersSectionValue
  itemTypes: ItemsSectionValue
  /** シリーズ・公演名 (任意・自由入力)。cards.series に保存。空文字は保存時に null 正規化。 */
  series: string
  want: WantMasterValue
  condition: ConditionSectionValue
}

/** 初期 state (下書きなし / 新規出品開始時) */
export const INITIAL_LISTING_FORM_STATE: ListingFormState = {
  image: { frontUri: null, backUri: null },
  work: null,
  characters: [],
  itemTypes: [],
  series: '',
  want: { works: [], characters: [], itemTypes: [], sameSeriesAsOffer: false },
  condition: {
    want_description: '',
    allows_adjustment: false,
    adjustment_max: 0,
  },
}
