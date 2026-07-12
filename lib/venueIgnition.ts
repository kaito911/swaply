// lib/venueIgnition.ts
//
// 会場モード「暗地×光源」の熱量(HEAT)/点火レベル(IGNITION)ロジック。純関数のみ。
// density = checkin人数 + active出品数 を score とし、閾値で 5 段階に。
//
// ★設計原則 (K指定):
//   - 0 人 = 過疎ではなく「点火前 (SPARK)」のポジティブ表現。みすぼらしく見せない。
//   - 少ないほど「1件の灯り」が際立つ演出の武器。
//   - 閾値は 1 グループ集中で人を集める方針に合わせ、実データで攻めに上方修正する前提。

export type IgnitionLevel = 'SPARK' | 'GLOW' | 'HEAT' | 'ROAR' | 'IGNITED'

export interface IgnitionState {
  level: IgnitionLevel
  score: number
  /** 光源色 (coral/orange 系)。熱量リング・点火グローに使う。 */
  glowColor: string
  /** 発光強度 0..1。リングの opacity/半径や glow の濃さの基準。 */
  intensity: number
  /** 会場カード等に出す短いラベル。 */
  label: string
  /** 補助文 (SPARK のポジティブ表現など)。 */
  tagline: string
}

// 閾値: score 下限 → レベル。上から評価。
// 現行 (β1 初期・保守的): SPARK 0-1 / GLOW 2-4 / HEAT 5-9 / ROAR 10-19 / IGNITED 20+
const LADDER: {
  min: number
  level: IgnitionLevel
  glowColor: string
  intensity: number
  label: string
  tagline: string
}[] = [
  { min: 20, level: 'IGNITED', glowColor: '#FF4D6D', intensity: 1.0, label: '点火', tagline: '会場が燃えています' },
  { min: 10, level: 'ROAR', glowColor: '#FF6B8B', intensity: 0.82, label: '沸騰', tagline: '盛り上がっています' },
  { min: 5, level: 'HEAT', glowColor: '#FF8A6B', intensity: 0.62, label: '熱気', tagline: '交換が動いています' },
  { min: 2, level: 'GLOW', glowColor: '#FF9F5C', intensity: 0.44, label: '点灯', tagline: '灯りはじめました' },
  { min: 0, level: 'SPARK', glowColor: '#FFB27A', intensity: 0.26, label: '点火前', tagline: '最初の火種を待っています' },
]

/**
 * checkin 人数 + active 出品数から点火状態を導出する。
 * count が取れない (RPC 未適用等) 場合も 0 として SPARK にフォールバック (グレースフル劣化)。
 */
export function computeIgnition(checkinCount: number, supplyCount: number): IgnitionState {
  const c = Number.isFinite(checkinCount) && checkinCount > 0 ? checkinCount : 0
  const s = Number.isFinite(supplyCount) && supplyCount > 0 ? supplyCount : 0
  const score = c + s
  const rung = LADDER.find((r) => score >= r.min) ?? LADDER[LADDER.length - 1]
  return {
    level: rung.level,
    score,
    glowColor: rung.glowColor,
    intensity: rung.intensity,
    label: rung.label,
    tagline: rung.tagline,
  }
}
