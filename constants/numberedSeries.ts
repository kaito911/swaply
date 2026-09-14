// constants/numberedSeries.ts
//
// 通し番号 (STARTO系 LAPOSTA特典トレカ) 文化があると実測できた作品でのみ、出品フォームの
// シリーズ欄を「通し番号」入力として案内するための定数。
//
// ★専用 DB カラムは作らず cards.series を流用する。この定数はフォームの案内文言 (ラベル /
//   placeholder) の出し分けだけに使う。保存先 (cards.series) もマッチングも不変。
// ★対象を増やすときは NUMBERED_SERIES_WORK_IDS に master_works.id (slug) を 1 語追加するだけ。
//   実測できた JO1 / INI 以外は対象外 (他グループへ勝手に広げない)。

/** 通し番号として案内する作品の master_works.id (slug)。実測できた JO1 / INI のみ。 */
export const NUMBERED_SERIES_WORK_IDS = ['jo1', 'ini'] as const

/**
 * シリーズ欄を通し番号案内にするときのラベル・placeholder。
 * master の display_name_ja / display_name_en 慣習に合わせ ja/en に集約 (将来 i18n 余地)。
 * placeholder は対象ユーザーに一発で伝わるよう実在メンバー名の番号例を出す。
 */
export const NUMBERED_SERIES_LABELS = {
  ja: {
    label: '通し番号',
    placeholder: '例：西122、許豊凡126',
  },
  en: {
    label: 'Serial number',
    placeholder: 'e.g. 西122, 許豊凡126',
  },
} as const
