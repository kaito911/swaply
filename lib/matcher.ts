// lib/matcher.ts
//
// scoreWantMatch v2 — characters[] 配列対応の master ベース matcher (Step 3 commit 3 atomic)。
//
// 設計方針 (refactor_plan v1.11 章 3.14、Step 3 Phase 2 §3):
//   - card.characters[] が空 → legacy K-POP 行 → wantParserMatcher (v1) に委譲
//   - want のテキストを master_characters で fuzzy 解決 → 候補 ID 配列
//   - card.characters[] と候補の overlap 数で score 判定:
//     - 単独出品 (length=1) で完全一致 → strong
//     - 小規模セット (length<=3) で含まれる → medium
//     - 大規模セット (length>=4) の 1 員 → weak
//   - master 解決失敗時は v1 にも委譲 (TREASURE 等 legacy 辞書での hit 余地)
//
// ハイブリッドマスタ対応 (refactor_plan v1.11 章 3.10):
//   - card.characters[] には master ID と raw text (フリーテキスト) が混在し得る
//   - findCharacterIdsByText は master ID を返すため、raw text は overlap 集合に含まれない
//   - raw text の matching は legacy v1 fallback or wanted_cards 側で対応 (β1 範囲は v2 + v1 で十分)
//
// ユーザー観察 (project_research_sanrio_2026-05-08.md 205 行):
//   セット出品 = いらないものをまとめて処分 (ランダム放出が主流)
//   → 「炭治郎単独欲しい」が「柱9名セット内に炭治郎」を発見できる any-overlap が望ましい
//   → 単独 strong > 小規模 medium > 大規模 weak で「単独優先表示」を実現

import type { Card, WantedCard, WantMatchScore } from './types'
import { findCharacterIdsByText } from './master'
import { scoreWantMatch as scoreWantMatchV1 } from './wantParserMatcher'

/**
 * v2 matcher: characters[] 配列ベース、master 解決後の overlap で score 判定。
 *
 * 判定フロー:
 * 1. card.characters[] 空 → v1 (legacy K-POP fallback) へ委譲
 * 2. want のテキストを master_characters で fuzzy 解決 (sync、cache 前提)
 * 3. master 解決失敗 → v1 にも委譲 (TREASURE 等 legacy 辞書 hit 余地)
 * 4. card.characters[] と候補 ID の overlap 数で score 判定
 *    - 単独出品 (total=1, overlap=1) → strong
 *    - 小規模セット (total<=3, overlap>=1) → medium
 *    - 大規模セット (total>=4, overlap>=1) → weak
 *    - overlap=0 → none
 */
export function scoreWantMatchV2(card: Card, want: WantedCard): WantMatchScore {
  // Step 1: legacy fallback (characters[] が空 = Step 2.5 以前出品)
  if (card.characters.length === 0) {
    return scoreWantMatchV1(card, want)
  }

  // Step 2: want テキスト構築
  const wantText = [want.member_name, want.card_name, want.group_name, want.series]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (wantText === '') return 'none'

  // Step 3: master_characters で fuzzy 解決
  const candidateIds = findCharacterIdsByText(wantText)
  if (candidateIds.length === 0) {
    // master 未解決 → v1 にも委譲 (TREASURE 等 legacy 辞書 hit 余地)
    return scoreWantMatchV1(card, want)
  }

  // Step 4: overlap 数で score 判定
  const cardCharSet = new Set(card.characters)
  const overlap = candidateIds.filter((id) => cardCharSet.has(id)).length
  if (overlap === 0) return 'none'

  const total = card.characters.length

  // 単独出品で完全一致 → strong
  if (total === 1 && overlap === 1) return 'strong'

  // 小規模セット (2-3 名) で含まれる → medium
  if (total <= 3) return 'medium'

  // 大規模セット (4 名以上) の一員 → weak
  return 'weak'
}

/** v2 を内部で呼ぶ単純 boolean 判定 */
export function isWantMatchV2(card: Card, want: WantedCard): boolean {
  return scoreWantMatchV2(card, want) !== 'none'
}
