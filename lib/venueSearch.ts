// lib/venueSearch.ts
//
// 会場モードの「開催状態判定 / JST 日付 / 一覧検索 / 日付グルーピング」を 1 箇所に集約する
// 共通ユーティリティ。app/venue/index.tsx (一覧) と app/venue/[id].tsx (詳細) の両方が
// getVenuePhase を呼ぶことで、開催中判定を単一情報源にする。
//
// 設計方針:
//   - venues.status は DB 側に自動遷移主体が無い (トリガー / cron 無し、本番は upcoming/open
//     で固定) ため、開催中判定は event_date (date 型 'YYYY-MM-DD') を JST の今日と比較して
//     導出する。status は 'closed' の時だけ効く「緊急クローズ」キルスイッチとして残す。
//   - 判定はすべて JST 固定 (端末 TZ に依存しない)。
//   - 検索は取得済み Venue[] へのクライアント側フィルタ (DB 変更なし)。グループ名 / 略称は
//     master cache (lib/master) 経由で解決し、未取得時は title / venue_name / 日付でフォールバック。

import { getWorkById } from './master'
import type { Venue } from './types'

// ─────────────────────────────────────────
// JST 日付ヘルパー
// ─────────────────────────────────────────

/** 端末 TZ に依存せず JST (UTC+9) の「今日」を 'YYYY-MM-DD' で返す。 */
export function jstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

/**
 * JST 統一の日付表示。例: '8月29日(土)'。'YYYY-MM-DD' 以外の不正値は原文字列を返す。
 * 曜日は JST 正午 (TZ 揺れの無い時刻) を UTC 解釈して求める (正午 JST = 03:00 UTC 同日)。
 */
export function formatVenueDateJa(dateStr: string): string {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (p == null) return dateStr
  const month = Number(p[2])
  const day = Number(p[3])
  const dt = new Date(`${dateStr}T12:00:00+09:00`)
  if (Number.isNaN(dt.getTime())) return dateStr
  return `${month}月${day}日(${WEEKDAYS_JA[dt.getUTCDay()]})`
}

// ─────────────────────────────────────────
// 開催状態判定 (単一情報源)
// ─────────────────────────────────────────

export type VenuePhase = 'open' | 'upcoming' | 'closed'

/**
 * 開催状態の単一情報源。event_date (JST) と status キルスイッチから phase を導出する。
 * event_date は 'YYYY-MM-DD' 前提で、辞書順比較 = 日付順比較が成り立つ。
 */
export function getVenuePhase(venue: Pick<Venue, 'event_date' | 'status'>): VenuePhase {
  // status='closed' は運営の緊急クローズ (キルスイッチ)。日付に依らず最優先で終了扱い。
  if (venue.status === 'closed') return 'closed'

  const today = jstToday()

  // ★event_date < 今日 → 'closed'。
  //   この分岐は【一覧からは到達しない】(fetchVenues が event_date >= today で絞るため)。
  //   ただし会場詳細 (app/venue/[id].tsx) は id 直接指定で開き、この日付フィルタを通らないため、
  //   過去日の会場を開いたケースでこの分岐が「終了」表示として必要になる。
  //   → 一覧側の可達性だけを見て将来デッドコードとして削除しないこと。
  if (venue.event_date < today) return 'closed'

  if (venue.event_date === today) return 'open'
  return 'upcoming'
}

// ─────────────────────────────────────────
// D-7 出品/交換提案ウィンドウ (getVenuePhase とは独立の別判定)
// ─────────────────────────────────────────

// event_date ('YYYY-MM-DD') を UTC 正午アンカーで days 日ずらした 'YYYY-MM-DD' を返す。
//   純日付演算 (端末 TZ / DST 非依存)。
function addDaysISO(dateStr: string, days: number): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`)
  return new Date(t + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

export type VenuePostWindow = 'too_early' | 'open' | 'ended'

/**
 * 出品 / 交換提案の可否ウィンドウ。DB の INSERT RLS / create_venue_hold の D-7 窓と一致:
 *   event_date - 7 <= JST今日 <= event_date のとき 'open'。
 *   それより前 = 'too_early' (まだ募集開始前)、event_date を過ぎたら 'ended'。
 * ★getVenuePhase とは別判定 (閲覧は常時可、出品/提案のみこのウィンドウで制限)。
 */
export function getVenuePostWindow(eventDate: string): VenuePostWindow {
  const today = jstToday()
  const opens = addDaysISO(eventDate, -7)
  if (today < opens) return 'too_early'
  if (today > eventDate) return 'ended'
  return 'open'
}

/** 出品/提案が開く日 (event_date - 7) を 'YYYY-MM-DD' で返す。「◯月◯日から出品できます」用。 */
export function venuePostOpensDate(eventDate: string): string {
  return addDaysISO(eventDate, -7)
}

// ─────────────────────────────────────────
// 検索 (取得済みデータへのクライアント側フィルタ)
// ─────────────────────────────────────────

/**
 * カタカナ → ひらがな 正規化 (lib/master と同方針、表記ゆれ吸収)。
 * U+30A1〜U+30F6 (ァ〜ヶ) を -0x60 シフトしてひらがな範囲へ。長音記号・漢字・英数字は不変。
 */
function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0x60))
}

function normalize(s: string): string {
  return toHiragana(s.toLowerCase())
}

/**
 * 会場 1 件の検索対象文字列を集めて正規化したものを返す。
 *   - title / venue_name … 常に含める (work_id が NULL / 不正 / cache 未取得でも拾える)
 *   - work_id → master_works.display_name_ja / display_name_en / aliases … cache 解決時のみ
 *   - event_date の 3 表記 … 'YYYY-MM-DD' / 'M/D' / 'M月D日'
 */
export function buildVenueHaystack(venue: Venue): string {
  const parts: string[] = [venue.title, venue.venue_name]

  if (venue.work_id != null && venue.work_id !== '') {
    const work = getWorkById(venue.work_id)
    if (work != null) {
      parts.push(work.display_name_ja)
      if (work.display_name_en != null) parts.push(work.display_name_en)
      parts.push(...work.aliases)
    }
  }

  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(venue.event_date)
  if (p != null) {
    const month = Number(p[2])
    const day = Number(p[3])
    parts.push(venue.event_date) // 2026-09-12
    parts.push(`${month}/${day}`) // 9/12
    parts.push(`${month}月${day}日`) // 9月12日
  }

  return normalize(parts.join(' '))
}

/** 取得済み venues をクエリで部分一致フィルタ (大小無視・カナ/かな吸収)。空クエリは全件。 */
export function filterVenues(venues: Venue[], query: string): Venue[] {
  const q = normalize(query.trim())
  if (q === '') return venues
  return venues.filter((v) => buildVenueHaystack(v).includes(q))
}

// ─────────────────────────────────────────
// 日付グルーピング (区切り線 + 日付ラベル用)
// ─────────────────────────────────────────

export interface VenueDateGroup {
  date: string // 'YYYY-MM-DD'
  label: string // formatVenueDateJa(date)
  venues: Venue[]
}

/** event_date 昇順に並べ、日付が変わる位置でグループ化する。 */
export function groupVenuesByDate(venues: Venue[]): VenueDateGroup[] {
  const sorted = [...venues].sort((a, b) => a.event_date.localeCompare(b.event_date))
  const groups: VenueDateGroup[] = []
  for (const v of sorted) {
    const last = groups[groups.length - 1]
    if (last != null && last.date === v.event_date) {
      last.venues.push(v)
    } else {
      groups.push({ date: v.event_date, label: formatVenueDateJa(v.event_date), venues: [v] })
    }
  }
  return groups
}
