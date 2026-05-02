// lib/wantParser.ts
// カード名・ほしいカードのフリーテキストを正規化・解析し、
// グループ/メンバー/シリーズの正規名と一致信頼度を返す純関数群。
// DBは触らない。辞書は現時点 TREASURE 向け最小セット。

// ─────────────────────────────────────────
// 型
// ─────────────────────────────────────────

export type WantParseResult = {
  rawWantText: string
  normalizedWantText: string
  parsedGroupName: string | null
  parsedMemberName: string | null
  parsedSeries: string | null
  parseConfidence: number
}

// ─────────────────────────────────────────
// 辞書
// ─────────────────────────────────────────

export const GROUP_ALIASES: Record<string, string> = {
  'treasure': 'TREASURE',
  'トレジャー': 'TREASURE',
  'とれじゃー': 'TREASURE',
  '트레저': 'TREASURE',
}

export const MEMBER_ALIASES_BY_GROUP: Record<string, Record<string, string>> = {
  TREASURE: {
    'ヒョンソク': 'ヒョンソク', 'ひょんそく': 'ヒョンソク', 'hyunsuk': 'ヒョンソク',
    'ジフン': 'ジフン', 'じふん': 'ジフン', 'jihoon': 'ジフン',
    'ヨシ': 'ヨシ', 'よし': 'ヨシ', 'yoshi': 'ヨシ', 'よしのり': 'ヨシ', 'yoshinori': 'ヨシ',
    'ジュンギュ': 'ジュンギュ', 'じゅんぎゅ': 'ジュンギュ', 'junkyu': 'ジュンギュ',
    'ジェヒョク': 'ジェヒョク', 'じぇひょく': 'ジェヒョク', 'jaehyuk': 'ジェヒョク',
    'アサヒ': 'アサヒ', 'あさひ': 'アサヒ', 'asahi': 'アサヒ',
    'ドヨン': 'ドヨン', 'どよん': 'ドヨン', 'doyoung': 'ドヨン',
    'ハルト': 'ハルト', 'はると': 'ハルト', 'haruto': 'ハルト',
    'ジョンウ': 'ジョンウ', 'じょんう': 'ジョンウ', 'jeongwoo': 'ジョンウ', 'jungwoo': 'ジョンウ',
    'ジョンファン': 'ジョンファン', 'じょんふぁん': 'ジョンファン', 'junghwan': 'ジョンファン',
  },
}

export const SERIES_ALIASES_BY_GROUP: Record<string, Record<string, string>> = {
  TREASURE: {
    'reboot': 'REBOOT', 'reboot盤': 'REBOOT', 'リブート': 'REBOOT', 'りぶーと': 'REBOOT',
    'the second step': 'THE SECOND STEP', 'second step': 'THE SECOND STEP',
    'pleasure': 'PLEASURE', 'プレジャー': 'PLEASURE',
    'the first step': 'THE FIRST STEP', 'first step': 'THE FIRST STEP',
  },
}

export const NOISE_WORDS: readonly string[] = [
  '求', '希望', '激求', '緩求', '優先', '最優先',
  '同異種', '異種', '買取不可', '未所持',
  'なんでも', '誰でも', '条件良い方', '条件次第',
  '郵送', '手渡し', 'n:1', '1:1', '1対1',
]

// ─────────────────────────────────────────
// 内部: 正規化
// ─────────────────────────────────────────

function normalizeText(text: string): string {
  // 1. NFKC（全角英数→半角）
  let s = text.normalize('NFKC')
  // 2. toLowerCase
  s = s.toLowerCase()
  // 3. 区切り記号 → 空白
  s = s.replace(/[/・,，、|｜\-−_~〜]/g, ' ')
  // 4. 括弧 → 空白（中身は残す）
  s = s.replace(/[()[\]（）【】「」『』]/g, ' ')
  // 5. 連続空白を1つに統一・trim
  s = s.replace(/\s+/g, ' ').trim()
  // 6. NOISE_WORDS を削除（NFKC + lower に揃えてから照合）
  for (const noise of NOISE_WORDS) {
    const normalizedNoise = noise.normalize('NFKC').toLowerCase()
    s = s.replace(new RegExp(normalizedNoise, 'g'), '')
  }
  // 7. 再度trim
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

// ─────────────────────────────────────────
// 内部: 解析
// ─────────────────────────────────────────

function findCanonicalGroup(normalizedText: string): string | null {
  // 長いエイリアス優先（部分一致の誤検出を減らす）
  const entries = Object.entries(GROUP_ALIASES).sort(
    ([a], [b]) => b.normalize('NFKC').toLowerCase().length - a.normalize('NFKC').toLowerCase().length
  )
  for (const [alias, canonical] of entries) {
    const normalizedAlias = alias.normalize('NFKC').toLowerCase()
    if (normalizedText.includes(normalizedAlias)) {
      return canonical
    }
  }
  return null
}

function findCanonicalMember(normalizedText: string, groupName: string | null): string | null {
  const groupsToSearch =
    groupName != null && MEMBER_ALIASES_BY_GROUP[groupName] != null
      ? [groupName]
      : Object.keys(MEMBER_ALIASES_BY_GROUP)

  for (const group of groupsToSearch) {
    const aliases = MEMBER_ALIASES_BY_GROUP[group]
    // 長いエイリアス優先（"よし" が "よしのり" に先にマッチするのを防ぐ）
    const entries = Object.entries(aliases).sort(
      ([a], [b]) => b.normalize('NFKC').toLowerCase().length - a.normalize('NFKC').toLowerCase().length
    )
    for (const [alias, canonical] of entries) {
      const normalizedAlias = alias.normalize('NFKC').toLowerCase()
      if (normalizedText.includes(normalizedAlias)) {
        return canonical
      }
    }
  }
  return null
}

function findCanonicalSeries(normalizedText: string, groupName: string | null): string | null {
  const groupsToSearch =
    groupName != null && SERIES_ALIASES_BY_GROUP[groupName] != null
      ? [groupName]
      : Object.keys(SERIES_ALIASES_BY_GROUP)

  for (const group of groupsToSearch) {
    const aliases = SERIES_ALIASES_BY_GROUP[group]
    // 長いエイリアス優先
    const entries = Object.entries(aliases).sort(
      ([a], [b]) => b.normalize('NFKC').toLowerCase().length - a.normalize('NFKC').toLowerCase().length
    )
    for (const [alias, canonical] of entries) {
      const normalizedAlias = alias.normalize('NFKC').toLowerCase()
      if (normalizedText.includes(normalizedAlias)) {
        return canonical
      }
    }
  }
  return null
}

// ─────────────────────────────────────────
// 内部: confidence計算
// ─────────────────────────────────────────

function calcConfidence(hasGroup: boolean, hasMember: boolean, hasSeries: boolean): number {
  if (hasGroup && hasMember && hasSeries) return 0.95
  if (hasGroup && hasMember) return 0.85
  if (hasMember && hasSeries) return 0.75
  if (hasMember) return 0.60
  if (hasGroup) return 0.40
  return 0.10
}

// ─────────────────────────────────────────
// メイン関数
// ─────────────────────────────────────────

export function parseWantText(rawWantText: string): WantParseResult {
  const normalizedWantText = normalizeText(rawWantText)
  const parsedGroupName = findCanonicalGroup(normalizedWantText)
  const parsedMemberName = findCanonicalMember(normalizedWantText, parsedGroupName)
  const parsedSeries = findCanonicalSeries(normalizedWantText, parsedGroupName)
  const parseConfidence = calcConfidence(
    parsedGroupName !== null,
    parsedMemberName !== null,
    parsedSeries !== null,
  )
  return {
    rawWantText,
    normalizedWantText,
    parsedGroupName,
    parsedMemberName,
    parsedSeries,
    parseConfidence,
  }
}
