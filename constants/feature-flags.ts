// constants/feature-flags.ts
//
// Swaply の機能解放フラグの単一情報源。
// β段階では BILLING_ENABLED と PREMIUM_TRIAL_ENABLED は false 固定で、
// 課金関連の UI / ロジックは一切発動させない。
//
// 解放条件（市場レベル）は戦略文書を参照:
//   - 事業母艦 v2（完全統合版）Part 4 / 料金体系
//   - 料金確定版 v1 Part 4.3
// 解放判断後は本ファイルのフラグを true に切り替えるだけで
// 全機能が連動する設計。

export const FEATURE_FLAGS = {
  // 課金システム（β完了後に true へ）
  // false の間は料金プラン選択画面・課金 UI が一切表示されない
  BILLING_ENABLED: false,

  // Phase 1 での Premium 試食
  // 解放後の有料機能を一時的に全員に開放するための切替
  PREMIUM_TRIAL_ENABLED: false,

  // 調整金 / 差額 / 追加支払い 系 UI 表示制御 (Phase 2 で差額エスクロー実装時に true へ)
  // false の間はユーザー向けの「調整金」「差額」「¥XXX 追加」表示が一切出ない
  // ただし DB カラム (cards.allows_adjustment/adjustment_max, offers.adjustment_amount,
  // profiles.adjustment_avg/bias) / 型 / RPC 引数 / createOffer API は復活余地として残置
  ADJUSTMENT_MONEY_ENABLED: false,

  // 開発環境でのみ有効化される機能
  // 例: mypage の開発機能セクション（offer-insights、onboarding リセット 等）
  // __DEV__ は Expo / Metro が自動で true (dev) / false (release build) を割り当てる
  DEV_FEATURES: __DEV__,
} as const
