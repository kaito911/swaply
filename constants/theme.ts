// constants/theme.ts
//
// Swaply Theme — Navy / 引き算スタイル (Instagram-inspired minimalism)
// Aligned with refactor_plan_v1.md (Phase A: UI-1/2/3) and strategy_master_v2.md.
//
// 設計原則:
// - 引き締め紺ベース + 引き算 (グラデ・装飾紫を排除)
// - Trust思想: バッジは事実記号、序列演出禁止
// - CTA は primary 単一、success/warning/error は状態表示専用 (アクション禁止)
// - shadow は最小限 (border中心の境界表現、Card に border 必須)
//
// 命名規則 (3レイヤー分離):
// - DB enum (trust_badge): green / trial_blue / blue / gold_blue (永続化、変更不可)
// - TS theme key: trustBadge* プレフィックス (既存命名規則維持、TrustBadge.tsx 整合)
// - UI 表示ラベル: lib/types.ts の TRUST_BADGE_LABELS が日本語 (新規/お試し/安定/高信頼)
//   を Source of Truth とする。色名 (Green/Teal/Sky/Amber) はあくまで内部色相メモ。
// - trust* (プレフィックスなし): TradeStats 等のメトリック色 (legacy、別用途)

export const colors = {
  primary: '#1F2A52',
  primaryDark: '#141B36',

  background: '#FFFFFF',
  backgroundCard: '#FFFFFF',
  backgroundMuted: '#F5F5F7',

  textPrimary: '#1F2A52',
  textSecondary: '#5A6478',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',

  border: '#E5E5EA',
  borderLight: '#F0F0F2',

  // Trust 4階層バッジ (DB enum 整合のためキー名維持、UI 表示は TRUST_BADGE_LABELS 参照)
  trustBadgeGreen: '#059669',          // 色相: Green
  trustBadgeGreenBg: '#ECFDF5',
  trustBadgeGreenBorder: '#A7F3D0',

  trustBadgeTrialBlue: '#0D9488',      // 色相: Teal (UI ラベルは TRUST_BADGE_LABELS 参照)
  trustBadgeTrialBlueBg: '#F0FDFA',
  trustBadgeTrialBlueBorder: '#99F6E4',

  trustBadgeBlue: '#0EA5E9',           // 色相: Sky (UI ラベルは TRUST_BADGE_LABELS 参照)
  trustBadgeBlueBg: '#F0F9FF',
  trustBadgeBlueBorder: '#BAE6FD',

  trustBadgeGoldBlue: '#D97706',       // 色相: Amber (UI ラベルは TRUST_BADGE_LABELS 参照)
  trustBadgeGoldBlueBg: '#FFFBEB',
  trustBadgeGoldBlueBorder: '#FDE68A',

  // Trust メトリック (legacy、TradeStats 等)
  trustGreen: '#059669',

  // === 状態色 (アクション禁止、表示専用) ===
  // 「成立済み」「発送済み」等の達成状態表示。CTA ボタンには使用禁止。
  success: '#059669',
  successBg: '#ECFDF5',

  // 「期限間近」「注意」等の表示。CTA ボタンには使用禁止。
  warning: '#D97706',
  warningBg: '#FFFBEB',

  // 「失敗」「エラー」等の表示。削除確認等の緊急アクションのみ例外的に許可。
  error: '#DC2626',
  errorBg: '#FEF2F2',
  errorBorder: '#FECACA',

  // === タグ 4系統 (機能別判別性維持、Trust とは彩度差で階層分離) ===
  // tagNeutral: 配送条件 (郵送/手渡し)、調整金なし — slate
  tagNeutralBg: '#F5F5F7',
  tagNeutralText: '#5A6478',
  tagNeutralBorder: '#E5E5EA',

  // tagAccent: 調整金あり、ほぼ確定等のハイライト系 — amber
  tagAccentBg: '#FEF3C7',
  tagAccentText: '#92400E',
  tagAccentBorder: '#FDE68A',

  // tagInfo: 要相談、likely成立しやすい、調整金相談可 (成立可能性シグナル) — sky
  tagInfoBg: '#E0F2FE',
  tagInfoText: '#0369A1',
  tagInfoBorder: '#BAE6FD',

  // tagPersonal: ほしい / モード / wantMatch (ユーザー固有) — rose (紫代替)
  tagPersonalBg: '#FCE7F3',
  tagPersonalText: '#9F1239',
  tagPersonalBorder: '#FBCFE8',

} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  hero: 32,
} as const

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
}

export const shadow = {
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
} as const
