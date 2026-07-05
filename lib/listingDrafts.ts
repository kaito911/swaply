// lib/listingDrafts.ts
//
// Phase B: 出品 1 ページ化の下書きハブ用ユーティリティ。
//
// AsyncStorage に「下書きの配列 (ListingDraft[])」を単一キー ('listing_drafts_v1')
// で保存する。1 端末 1 ユーザー想定 (β1 まで) のため user_id 分離しない。
// (再登場する user_id 分離要件が出たらキーを 'listing_drafts_v1:{userId}' に拡張)
//
// 設計方針:
//   - 下書きは端末永続、機種変では失われる (Phase B 判断: AsyncStorage 採用)
//   - 保存単位: ListingFormState + id + updatedAt + title (一覧表示用)
//   - title は「作品名 (WorkSection 選択済) or "無題の出品"」を保存時に自動生成
//   - AsyncStorage 失敗は console.warn で握り、UI 側は空配列 fallback (安全側)

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ListingFormState } from '@/components/listing/section/types'
import { getWorkById } from './master'

const STORAGE_KEY = 'listing_drafts_v1'

export type ListingDraft = {
  id: string
  state: ListingFormState
  /** epoch ms (Date.now()) */
  updatedAt: number
  /** 一覧表示用の代表名。作品名 or "無題の出品" */
  title: string
}

/**
 * 新規下書き用の ID を生成する。Date.now() + Math.random で十分な一意性。
 */
export function generateDraftId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * ListingFormState から一覧表示用のタイトルを導出する。
 * WorkSection が選択済ならその display_name_ja、そうでなければ「無題の出品」。
 */
export function deriveDraftTitle(state: ListingFormState): string {
  if (state.work != null) {
    const master = getWorkById(state.work.workId)
    if (master != null) return master.display_name_ja
    // 自由入力 workId は raw text
    return state.work.workId
  }
  return '無題の出品'
}

/**
 * 保存済み下書きを全件取得する (updatedAt 降順)。
 * AsyncStorage 失敗や JSON parse 失敗は空配列 fallback。
 */
export async function loadDrafts(): Promise<ListingDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (raw == null) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const drafts = parsed.filter(isValidDraft)
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (err) {
    console.warn('[listingDrafts] loadDrafts failed', err)
    return []
  }
}

/**
 * 単一の下書きを保存する (upsert)。既存 id なら上書き、新規なら追加。
 * title は state から自動導出、updatedAt は now で上書き。
 */
export async function saveDraft(
  id: string,
  state: ListingFormState,
): Promise<void> {
  try {
    const drafts = await loadDrafts()
    const next: ListingDraft = {
      id,
      state,
      updatedAt: Date.now(),
      title: deriveDraftTitle(state),
    }
    const idx = drafts.findIndex((d) => d.id === id)
    if (idx >= 0) {
      drafts[idx] = next
    } else {
      drafts.push(next)
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  } catch (err) {
    console.warn('[listingDrafts] saveDraft failed', err)
  }
}

/**
 * ID 指定で下書きを削除する。存在しない ID は no-op。
 */
export async function deleteDraft(id: string): Promise<void> {
  try {
    const drafts = await loadDrafts()
    const filtered = drafts.filter((d) => d.id !== id)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (err) {
    console.warn('[listingDrafts] deleteDraft failed', err)
  }
}

/**
 * ID 指定で単一下書きを取得する。存在しない or 破損時は null。
 */
export async function loadDraft(id: string): Promise<ListingDraft | null> {
  const drafts = await loadDrafts()
  return drafts.find((d) => d.id === id) ?? null
}

// ─────────────────────────────────────────
// internal
// ─────────────────────────────────────────

function isValidDraft(value: unknown): value is ListingDraft {
  if (typeof value !== 'object' || value == null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.updatedAt === 'number' &&
    typeof v.title === 'string' &&
    typeof v.state === 'object' &&
    v.state !== null
  )
}
