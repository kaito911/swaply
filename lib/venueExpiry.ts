// lib/venueExpiry.ts
// 会場モードの期限計算 / 表示ユーティリティ
// PR feat/venue-event-day-expiry で新規追加。
//
// 設計方針:
//   - 会場出品 (venue_supply_posts) と申請中 Hold (venue_holds.status='pending') は
//     30 分固定失効を廃止し、**イベント当日 23:59 (JST) まで有効**とする。
//     event_date の JST 23:59:59 を UTC ISO に正規化して expires_at に書き込む。
//     `ends_at` は本期限計算では使用しない (過去 venue の ends_at が過去にあると
//     作成直後に期限切れになる事象を回避)。
//   - 承認済 (status='held') / 取引化済 (status='converted') hold および venue_trades は
//     expires_at による自動失効をしない (DB filter 対象外、本ユーティリティの守備範囲外)。
//   - expires_at 列自体は将来の cleanup / 非表示判定のために残す。
//
// 関連: docs/venue_mode_requirements.md §5 / §10

/**
 * venue 情報から venue_supply_posts / venue_holds に書き込む expires_at を計算する。
 *
 * 仕様: event_date の JST 23:59:59 を UTC ISO に正規化して返す。
 * 例: event_date='2026-06-13' → '2026-06-13T23:59:59+09:00' → UTC '2026-06-13T14:59:59Z'
 *
 * 注:
 *   - 過去日 venue の場合は計算結果が過去になる → 直ちに期限切れ表示。これは仕様
 *     (過去日の event には投稿しない想定)。
 *   - 未来日 venue の場合は計算結果が未来。前日までの事前投稿でも当日中は有効。
 */
export function computeVenueExpiry(venue: { event_date: string }): string {
  // event_date は date 型 ("YYYY-MM-DD") を想定。JST 末尾の +09:00 を付けて UTC に正規化。
  return new Date(`${venue.event_date}T23:59:59+09:00`).toISOString()
}

/**
 * expires_at までの残時間を人間可読な日本語ラベルで返す。
 *
 *   - 期限経過済    → '期限切れ'
 *   - 60 分未満     → 'あとN分'
 *   - 24 時間未満   → 'あとN時間'
 *   - 24 時間以上   → 'あとN日'
 */
export function formatVenueTimeLeft(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  if (diffMs <= 0) return '期限切れ'
  const minutes = Math.floor(diffMs / (60 * 1000))
  if (minutes < 60) return `あと${minutes}分`
  const hours = Math.floor(diffMs / (60 * 60 * 1000))
  if (hours < 24) return `あと${hours}時間`
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  return `あと${days}日`
}

/**
 * expires_at が過去 (<= now) なら true。
 * 呼出側で status='pending' AND isVenueExpired(...) で「期限切れ pending」を判定する想定。
 */
export function isVenueExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now()
}
