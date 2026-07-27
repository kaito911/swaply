// lib/sentry.ts
//
// Swaply の Sentry 導入 (手動セットアップ / @sentry/wizard 不使用)。
//
// ★設計思想: Swaply には「絶対に外部へ出してはいけない情報」が明確にある
//   (住所・氏名・メール・DM 本文・通報 note・push token・Supabase 鍵/JWT)。
//   Sentry のエラーログ経由でこれらが漏れると設計思想が崩れるため、
//   beforeSend / beforeBreadcrumb で「キー名ベース」で徹底除去する。
//   値の文字列マッチは必ず取りこぼすため採用しない (キー名で潰す)。
//
// 有効化条件:
//   - 本番のみ (__DEV__ では send しない)
//   - DSN が存在するときのみ init (未設定なら黙って no-op)
//
// ★DSN について (重要な技術前提):
//   Expo の Metro バンドラは `EXPO_PUBLIC_` プレフィックス付き env のみを
//   クライアントバンドルにインライン展開する。プレフィックスなしの
//   `process.env.SENTRY_DSN` は RN ランタイムでは常に undefined になる
//   (static app.json + app.config なしのため extra 経由の受け渡しも無い)。
//   → EAS Secret は `EXPO_PUBLIC_SENTRY_DSN` 名で登録する必要がある。
//   Sentry DSN は秘匿情報ではなく (submission 専用・読み取り権限なし)、
//   クライアント埋め込みは公式に安全とされているため公開プレフィックスで問題ない。
//   両方を fallback で読むが、実効的には EXPO_PUBLIC_ 側のみが値を持つ。
import * as Sentry from '@sentry/react-native'

const REDACTED = '[Filtered]'

// ─────────────────────────────────────────
// 除去対象キー (すべて小文字で比較する。大文字/キャメルは toLowerCase 後に一致)
// ─────────────────────────────────────────
//
// (1) 住所・氏名 (user_shipping_addresses 由来の全フィールド)
// (2) メールアドレス
// (3) DM 本文 (trade_messages.body / venue_trade_messages.body / offers.message)
// (4) 通報の申告内容 (trade_reports.note / content_reports.note、detail 系)
// (5) push token (expo_push_token)
// (6) Supabase の JWT / anon key / service role key
//
// exact 一致で消すキー。汎用的すぎて誤検知しうる 'name' 単独は入れない
// (display_name 等の公開値まで消えるため)。氏名は shipping_name 等の限定キーで消す。
const SENSITIVE_KEYS_EXACT: ReadonlySet<string> = new Set([
  // (1) 住所・氏名
  'shipping_name',
  'recipient_name',
  'full_name',
  'postal_code',
  'zip',
  'zipcode',
  'address',
  'address_line1',
  'address_line2',
  'address1',
  'address2',
  'prefecture',
  'city',
  'street',
  'building',
  'phone',
  'phone_number',
  'tel',
  // (2) メール
  'email',
  'email_address',
  'user_email',
  'mail',
  // (3) DM / メッセージ本文
  'body',
  'message',
  'message_body',
  'msg',
  // (4) 通報の申告内容
  'note',
  'notes',
  'detail',
  'details',
  'detail_text',
  'dispute_reason',
  'report_reason',
  'reason',
  // (5) push token
  'expo_push_token',
  'push_token',
  'device_token',
  'devicetoken',
  // (6) Supabase 鍵 / JWT / 認証
  'access_token',
  'refresh_token',
  'id_token',
  'provider_token',
  'provider_refresh_token',
  'anon_key',
  'apikey',
  'api_key',
  'service_role',
  'service_role_key',
  'supabase_anon_key',
  'jwt',
  'authorization',
  'password',
  'secret',
  'cookie',
  'set-cookie',
])

// 部分一致 (キー名に含まれれば除去)。認証情報系の取りこぼし保険。
// ここも「キー名」に対する判定であり、値の中身は見ない。
const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /authorization/i,
  /api[-_]?key/i,
  /session/i,
  /credential/i,
]

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  if (SENSITIVE_KEYS_EXACT.has(lower)) return true
  for (const re of SENSITIVE_KEY_PATTERNS) {
    if (re.test(lower)) return true
  }
  return false
}

// event / breadcrumb / contexts / extra / request を再帰的に走査し、
// 除去対象キーの値を REDACTED に置換する。循環参照は WeakSet で防止。
function scrubDeep(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null) return value
  if (typeof value !== 'object') return value

  if (seen.has(value as object)) return value
  seen.add(value as object)

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = scrubDeep(value[i], seen)
    }
    return value
  }

  const obj = value as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (isSensitiveKey(key)) {
      obj[key] = REDACTED
      continue
    }
    obj[key] = scrubDeep(obj[key], seen)
  }
  return obj
}

// ─────────────────────────────────────────
// beforeSend: event 全体 (message/exception/extra/contexts/request/user/
//   breadcrumbs/tags) をまとめて走査して PII を除去する。
// ─────────────────────────────────────────
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  try {
    const seen = new WeakSet<object>()
    // event 直下の主要コンテナを個別に走査 (Sentry の必須メタ = event_id /
    //   timestamp 等は除去対象キーに無いため保持される)。
    if (event.extra) scrubDeep(event.extra, seen)
    if (event.contexts) scrubDeep(event.contexts, seen)
    if (event.tags) scrubDeep(event.tags, seen)
    if (event.request) scrubDeep(event.request, seen)
    if (event.breadcrumbs) scrubDeep(event.breadcrumbs, seen)
    // user は sendDefaultPii=false でも id 等が付くことがあるため、
    //   email/ip などのキーを scrub する (id は識別に必要なので残す)。
    if (event.user) {
      const u = event.user as Record<string, unknown>
      for (const key of Object.keys(u)) {
        if (isSensitiveKey(key) || key === 'ip_address' || key === 'username') {
          u[key] = REDACTED
        }
      }
    }
    return event
  } catch {
    // 走査で万一失敗したら「送らない」側に倒す (漏洩より欠損を選ぶ)。
    return null
  }
}

function scrubBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  try {
    // ★(a) console の breadcrumb は送らない。
    //   console.log の中身はキーを持たない「ただの文字列」であり、キー名ベースの
    //   フィルタでは1件も捕捉できない。住所・DM 本文・通報内容を扱うアプリなので、
    //   デバッグ利便性より非送信を優先し、console breadcrumb は丸ごと落とす。
    if (breadcrumb.category === 'console') return null

    // ★(b) xhr / fetch の breadcrumb は URL のクエリ文字列 ("?" 以降) を捨てる。
    //   Supabase REST は ?user_id=eq.<uuid> 等の形で識別子/条件が URL に乗るため、
    //   パス部分だけ残してクエリを除去する。
    if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
      const data = breadcrumb.data as Record<string, unknown> | undefined
      if (data != null && typeof data.url === 'string') {
        const q = data.url.indexOf('?')
        if (q >= 0) data.url = data.url.slice(0, q)
      }
    }

    const seen = new WeakSet<object>()
    if (breadcrumb.data) scrubDeep(breadcrumb.data, seen)
    return breadcrumb
  } catch {
    return null
  }
}

// DSN 解決 (env のみ参照)。★値そのものは外部に返さない (真偽は isSentryDsnConfigured)。
function resolveDsn(): string {
  return process.env.EXPO_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? ''
}

// ★DSN が設定されているかの「真偽のみ」返す。値そのものは絶対に返さない/表示しない。
//   smoke test の Alert 表示用 (「DSN設定済み: true/false」)。
export function isSentryDsnConfigured(): boolean {
  return resolveDsn() !== ''
}

// smoke test 用: Sentry にメッセージを1件送信する。
//   本番 (init 済み) では送信、dev (未 init) では no-op。★__DEV__ 限定にはしない。
export function sendSentrySmokeTest(message: string): void {
  Sentry.captureMessage(message)
}

// マスタ取得の失敗/0件を本番で計測する (調査⑥の「characters がエラーか行数切り詰めか」を
//   本番データで決着させるため)。★PII は一切含めない: テーブル名 (literal)・件数・error 有無のみ。
export function reportMasterFetchIssue(info: {
  table: string
  count: number
  hasError: boolean
}): void {
  Sentry.captureMessage(
    `master fetch issue: table=${info.table} count=${info.count} error=${info.hasError}`,
    'warning',
  )
}

let initialized = false

export function initSentry(): void {
  if (initialized) return
  // 本番のみ。開発ビルドでは一切送らない (下記 enabled でも二重に担保)。
  if (__DEV__) return

  const dsn = resolveDsn()
  if (dsn === '') return

  Sentry.init({
    dsn,
    // ★本番のみ有効 (dev では送らない)。early return と二重に担保。
    enabled: !__DEV__,
    // ★PII を既定で送らない (IP / user 情報の自動付与を無効化)。
    sendDefaultPii: false,
    // ★スクショを添付しない (DM 画面・住所画面のスクショ外部送信を絶対に防ぐ)。
    attachScreenshot: false,
    // ★ビューヒエラルキーを添付しない (画面構造からの情報漏れを防ぐ)。
    attachViewHierarchy: false,
    // β1 ではパフォーマンス計測不要。
    tracesSampleRate: 0,
    // Session Replay は PII リスクが高いため無効 (integration を一切追加しない)。
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })

  initialized = true
}
