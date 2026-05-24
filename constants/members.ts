// constants/members.ts
//
// メンバーマスタ (Phase 1: TREASURE のみハードコード)
//
// 検索画面の autocomplete 候補と、グループ未設定 cards への group fallback
// に使用する。Phase 2 で BABYMONSTER 等を追加し、最終的に DB マスタテーブル
// (M11.5 候補) へ移行する想定。
//
// 出品時の `cards.member_name` は依然フリーテキストで保存されるため、検索時
// は `aliases` の各表記を OR 展開して ilike マッチする (大文字小文字差異も
// 吸収するため `.toLowerCase()` で正規化する)。

export type MemberMaster = {
  /** 安定 ID (URL/state キーに使用、表記変更の影響を受けない) */
  id: string
  /** 画面表示用の正式表記(カタカナ) */
  canonical: string
  /** 公式英字表記 (空白あり) */
  official_en: string
  /** 検索マッチング用の表記揺れリスト (canonical を必ず含む) */
  aliases: readonly string[]
  /** 所属グループ (DB に該当 cards が無い場合の group fallback) */
  group: string
}

export const TREASURE_MEMBERS: readonly MemberMaster[] = [
  {
    id: 'choi_hyun_suk',
    canonical: 'チェ・ヒョンソク',
    official_en: 'CHOI HYUN SUK',
    aliases: ['チェ・ヒョンソク', 'ヒョンソク', 'CHOI HYUN SUK', 'HYUNSUK', 'ひょんそく'],
    group: 'TREASURE',
  },
  {
    id: 'jihoon',
    canonical: 'ジフン',
    official_en: 'JIHOON',
    // 公式・Wikipedia は「ジフン」(박지훈 準拠) だが、ファン界隈の「ジヒョン」表記揺れも吸収する
    aliases: ['ジフン', 'ジヒョン', 'JIHOON', 'じふん', 'じひょん'],
    group: 'TREASURE',
  },
  {
    id: 'yoshi',
    canonical: 'ヨシ',
    official_en: 'YOSHI',
    aliases: ['ヨシ', 'YOSHI', 'よし'],
    group: 'TREASURE',
  },
  {
    id: 'junkyu',
    canonical: 'ジュンギュ',
    official_en: 'JUNKYU',
    aliases: ['ジュンギュ', 'JUNKYU', 'じゅんぎゅ'],
    group: 'TREASURE',
  },
  {
    id: 'yoon_jae_hyuk',
    canonical: 'ユン・ジェヒョク',
    official_en: 'YOON JAE HYUK',
    aliases: ['ユン・ジェヒョク', 'ジェヒョク', 'YOON JAE HYUK', 'JAEHYUK', 'じぇひょく'],
    group: 'TREASURE',
  },
  {
    id: 'asahi',
    canonical: 'アサヒ',
    official_en: 'ASAHI',
    aliases: ['アサヒ', 'ASAHI', 'あさひ'],
    group: 'TREASURE',
  },
  {
    id: 'doyoung',
    canonical: 'ドヨン',
    official_en: 'DOYOUNG',
    aliases: ['ドヨン', 'DOYOUNG', 'どよん'],
    group: 'TREASURE',
  },
  {
    id: 'haruto',
    canonical: 'ハルト',
    official_en: 'HARUTO',
    aliases: ['ハルト', 'HARUTO', 'はると'],
    group: 'TREASURE',
  },
  {
    id: 'park_jeong_woo',
    canonical: 'パク・ジョンウ',
    official_en: 'PARK JEONG WOO',
    aliases: ['パク・ジョンウ', 'ジョンウ', 'PARK JEONG WOO', 'JEONGWOO', 'じょんう'],
    group: 'TREASURE',
  },
  {
    id: 'so_jung_hwan',
    canonical: 'ソ・ジョンファン',
    official_en: 'SO JUNG HWAN',
    aliases: ['ソ・ジョンファン', 'ジョンファン', 'SO JUNG HWAN', 'JUNGHWAN', 'じょんふぁん'],
    group: 'TREASURE',
  },
] as const

/** 全マスタ統合 (Phase 2 で BABYMONSTER 等を concat する想定) */
export const ALL_MEMBERS: readonly MemberMaster[] = TREASURE_MEMBERS

/** id 検索用 lookup */
export const MEMBER_BY_ID: ReadonlyMap<string, MemberMaster> = new Map(
  ALL_MEMBERS.map((m) => [m.id, m])
)
