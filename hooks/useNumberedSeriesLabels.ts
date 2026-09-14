// hooks/useNumberedSeriesLabels.ts
//
// work_id が通し番号文化のある作品 (NUMBERED_SERIES_WORK_IDS = JO1 / INI) のとき、シリーズ欄を
// 「通し番号」入力として案内するためのラベル / placeholder を返す。対象外は null を返し、
// 呼び出し側 (single-page / bulk) は既存のシリーズ欄文言に fallback する。
//
// ※ 実体は workId → 文言 の純粋な写像だが、承認済み設計 (HOOK方式) に従い hook 化する。
//   useMemo で同一 workId の間はオブジェクト参照を安定させる (不要な再レンダーを避ける)。

import {
  NUMBERED_SERIES_LABELS,
  NUMBERED_SERIES_WORK_IDS,
} from '@/constants/numberedSeries'
import { useMemo } from 'react'

export type NumberedSeriesLabels = { label: string; placeholder: string }

/**
 * workId が通し番号対象なら { label, placeholder } を、対象外 / 未選択なら null を返す。
 * master slug の大小・前後空白の揺れに備えて正規化して比較する。
 */
export function useNumberedSeriesLabels(
  workId: string | null,
): NumberedSeriesLabels | null {
  return useMemo(() => {
    if (workId == null) return null
    const normalized = workId.trim().toLowerCase()
    const isNumbered = (NUMBERED_SERIES_WORK_IDS as readonly string[]).includes(
      normalized,
    )
    return isNumbered ? NUMBERED_SERIES_LABELS.ja : null
  }, [workId])
}
