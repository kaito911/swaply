// lib/wantParserMatcher.ts
//
// scoreWantMatch v1 (legacy) — TREASURE 専用辞書ベースの matcher。
// 旧 lib/types.ts:322-358 から移設 (Step 3 commit 3 atomic)。
//
// 使用方針:
//   - characters[] が空の legacy K-POP 行 (Step 2.5 以前出品) の matcher として
//     lib/matcher.ts の scoreWantMatchV2 内から委譲呼出される
//   - 直接呼出は基本的に避ける、新規コードは scoreWantMatchV2 を使う
//   - Phase 1.5 で K-POP 復活 (LAPONE INI) + master_characters に LAPONE 系追加完了時に
//     本ファイルおよび wantParser.ts の TREASURE 専用辞書を物理削除する想定

import type { Card, WantedCard, WantMatchScore } from './types'
import { parseWantText } from './wantParser'

/**
 * legacy: card.member_name (single) と want.member_name (single) を parseWantText で正規化して
 * group/member/series 3 軸で strong/medium/weak/none 判定する。
 *
 * 注: card.characters[] が空 (legacy K-POP 行) のときのみ呼ばれる想定。
 *     新規セット出品 (characters[] あり) は scoreWantMatchV2 が処理する。
 */
export function scoreWantMatch(card: Card, want: WantedCard): WantMatchScore {
  const cardText = [card.name, card.group_name, card.member_name, card.series]
    .filter(Boolean)
    .join(' ')
  const wantText = [want.card_name, want.group_name, want.member_name, want.series]
    .filter(Boolean)
    .join(' ')

  const cardParsed = parseWantText(cardText)
  const wantParsed = parseWantText(wantText)

  const groupMatch =
    cardParsed.parsedGroupName !== null &&
    wantParsed.parsedGroupName !== null &&
    cardParsed.parsedGroupName === wantParsed.parsedGroupName

  const memberMatch =
    cardParsed.parsedMemberName !== null &&
    wantParsed.parsedMemberName !== null &&
    cardParsed.parsedMemberName === wantParsed.parsedMemberName

  // 両者 null or 完全一致のみ strong。片方 null は medium へ落とす。
  const seriesExactMatch = cardParsed.parsedSeries === wantParsed.parsedSeries

  const bothSeriesNull =
    cardParsed.parsedSeries === null && wantParsed.parsedSeries === null

  if (groupMatch && memberMatch && (seriesExactMatch || bothSeriesNull)) return 'strong'
  if (groupMatch && memberMatch) return 'medium'
  // card 側は DB 構造化データのため confidence 判定不要。want 側のみで判定。
  if (memberMatch && wantParsed.parseConfidence >= 0.6) return 'weak'
  return 'none'
}

/** scoreWantMatch を内部で呼ぶ単純 boolean 判定 */
export function isWantMatch(card: Card, want: WantedCard): boolean {
  return scoreWantMatch(card, want) !== 'none'
}
