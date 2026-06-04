// constants/contact.ts
// 運営連絡先 (公式ドメイン: swaply-app.jp、β1 で確定)
//
// 用途:
//   - お問い合わせ / 権利侵害申立の mailto: 宛先
//   - 利用規約 / プライバシーポリシー / 通報送信先メール
//
// 注意:
//   - β1 ではお問い合わせと権利侵害申立は同じアドレスに統一 (運用負荷削減)
//   - 法人化後、Phase 2+ で legal@ や dmca@ への分離を検討
//   - App Store 提出前に送受信確認 (kaito 側で対応)

export const SUPPORT_EMAIL = 'support@swaply-app.jp'
export const LEGAL_EMAIL = 'support@swaply-app.jp'
export const APP_DOMAIN = 'swaply-app.jp'

// mailto: link 用ヘルパー (件名 prefix の統一)
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  'Swaply お問い合わせ',
)}`

export const LEGAL_MAILTO = `mailto:${LEGAL_EMAIL}?subject=${encodeURIComponent(
  'Swaply 権利侵害申立',
)}`
