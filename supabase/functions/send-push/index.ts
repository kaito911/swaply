// supabase/functions/send-push/index.ts
//
// Push 通知 PR3: 指定 user_id に Expo Push 通知を送る Edge Function。
//
// 動作:
//   1. method 検証 (POST のみ) + CORS preflight
//   2. internal secret 検証 (x-send-push-secret ヘッダ vs SEND_PUSH_SECRET env)
//   3. payload 検証 (user_id / title / body 必須)
//   4. service_role で public.push_tokens から対象 user の全 token を取得
//   5. 0 件なら { ok: true, sent: 0 } を返す (安全側、エラー扱いにしない)
//   6. Expo Push API (https://exp.host/--/api/v2/push/send) に POST
//   7. ticket レスポンスを解析。DeviceNotRegistered (= 端末 token 失効) がついた
//      token のみ push_tokens から DELETE。
//      InvalidCredentials / MismatchSenderId は credentials (APNs/FCM/EAS) 側
//      不整合の可能性があり、有効 token を誤削除しないため自動削除の対象外。
//   8. レスポンスに sent / removed / tickets を含めて返す
//
// 認証/保護方式 (PR3 採用):
//   - internal secret 方式。x-send-push-secret ヘッダで認証。
//   - 外部からは secret を知らない限り叩けない。
//   - service_role key は Edge Function 内の env からのみ参照、クライアントには渡さない。
//   - クライアントアプリから本 function を直接呼ばせない (PR4+ Webhook / 他 Edge Function 専用)。
//   - 通常ユーザーが任意の user_id に push できる脆弱性を構造的に閉じる。
//
// receipt polling について (判断):
//   - Expo Push API は send 時に「ticket」を返し、30 分後に receipt が確定する。
//   - PR3 では receipt polling は実装しない (cron / 状態管理が必要、スコープ外)。
//   - ただし send-time に DeviceNotRegistered (= 端末 token 失効) が返る token は
//     即時 push_tokens 削除する。これにより send 経路のみで端末失効分は片付く。
//   - InvalidCredentials / MismatchSenderId は token 失効ではなく credentials 設定
//     不整合の可能性があるため、有効 token 誤削除リスクを避けて削除しない (PR3 安全側)。
//   - 後続 PR で receipt polling (= 厳密な配信確認) を追加する余地は残す。
//
// 環境変数:
//   - SUPABASE_URL                  (Supabase が自動設定)
//   - SUPABASE_SERVICE_ROLE_KEY     (Supabase が自動設定)
//   - SEND_PUSH_SECRET              (手動設定: supabase secrets set SEND_PUSH_SECRET=...)
//
// デプロイ手順:
//   1. supabase login
//   2. supabase link --project-ref <project-ref>
//   3. supabase secrets set SEND_PUSH_SECRET=<長いランダム文字列>
//   4. npx supabase functions deploy send-push --no-verify-jwt
//
// ★★★ --no-verify-jwt は必須。落とすと通知が全停止する ★★★
//   send-push は notify-on-event から x-send-push-secret のみを付けて内部呼び出し
//   される (Authorization ヘッダを持たない)。--no-verify-jwt を落とすと Supabase 標準の
//   JWT 検証が有効に戻り、関数本体に到達する前に 401 UNAUTHORIZED_NO_AUTH_HEADER で
//   弾かれる。認証は SEND_PUSH_SECRET で自前で行うため標準 JWT 検証は無効化する。
//   (2026-07-25: フラグ欠落で通知全停止を実際に踏んだ。docs/push_webhook_setup.md 参照)
//
// 呼び出し例 (curl):
//   curl -X POST "https://<project-ref>.functions.supabase.co/send-push" \
//     -H "Content-Type: application/json" \
//     -H "x-send-push-secret: <SEND_PUSH_SECRET>" \
//     -d '{
//       "user_id": "<target-user-id>",
//       "title": "Swaply テスト通知",
//       "body": "Push 通知の送信テストです",
//       "data": { "type": "manual_test", "route": "/notifications" }
//     }'
//
// レスポンス形式 (代表例):
//   200 { ok: true, sent: 0, removed: 0, user_id }
//        — 対象 user の token が DB に 0 件 (まだ pre-prompt 許可してない端末等)
//   200 { ok: true, sent: 1, removed: 0, user_id, tickets: [...] }
//        — 送信成功
//   200 { ok: true, sent: 0, removed: 1, user_id, tickets: [...] }
//        — 全 token DeviceNotRegistered で送信失敗、無効 token は削除済
//   400 { error: 'INVALID_PAYLOAD', missing: [...] }
//        — 必須フィールドが空 / 非 string
//   400 { error: 'INVALID_PAYLOAD', invalid: [...] }
//        — user_id が UUID 形式でない等、形式不正
//        (両方該当時は missing と invalid を併記)
//   401 { error: 'UNAUTHORIZED' }
//   405 { error: 'METHOD_NOT_ALLOWED' }
//   500 { error: 'PUSH_API_FAILED', status, body }
//   500 { error: 'INTERNAL_ERROR' }

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SEND_PUSH_SECRET = Deno.env.get('SEND_PUSH_SECRET')

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send'

// Expo Push API の ticket レスポンス型 (公式 docs 準拠の最小型)。
type ExpoPushTicket = {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: {
    error?:
      | 'DeviceNotRegistered'
      | 'InvalidCredentials'
      | 'MessageTooBig'
      | 'MessageRateExceeded'
      | 'MismatchSenderId'
      | string
    expoPushToken?: string
  }
}

type ExpoPushSendResponse = {
  data?: ExpoPushTicket[]
  errors?: { code?: string; message: string }[]
}

type Payload = {
  user_id?: unknown
  title?: unknown
  body?: unknown
  data?: unknown
}

// send-time に「端末側の token が失効した」と確実に判定できる ticket エラー。
// DeviceNotRegistered のみを対象にする (PR3 安全側方針):
//   - InvalidCredentials / MismatchSenderId は APNs/FCM/EAS credentials 側の
//     設定不整合の可能性があり、有効 token を誤削除するリスクがあるため除外。
//   - 厳密な失効判定が必要な場合は後続 PR で receipt polling を追加。
const INVALID_TOKEN_ERRORS = new Set(['DeviceNotRegistered'])

// UUID 形式チェック (一般的な 8-4-4-4-12 hex 形式を許可、version は問わない)。
// Supabase auth.users.id は通常 v4 lowercase だが、tolerant に判定する。
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'authorization, content-type, x-send-push-secret',
      },
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' })
  }

  // ─────────────────────────────────────────
  // 1. internal secret 検証
  //    SEND_PUSH_SECRET 未設定の関数は事故防止のため一律 401 とする
  //    (deploy ミスで誰でも叩ける状態を作らない)。
  // ─────────────────────────────────────────
  if (SEND_PUSH_SECRET == null || SEND_PUSH_SECRET === '') {
    console.error('[send-push] SEND_PUSH_SECRET is not set in env')
    return jsonResponse(401, { error: 'UNAUTHORIZED' })
  }
  const providedSecret = req.headers.get('x-send-push-secret')
  if (providedSecret == null || providedSecret !== SEND_PUSH_SECRET) {
    return jsonResponse(401, { error: 'UNAUTHORIZED' })
  }

  // ─────────────────────────────────────────
  // 2. payload 検証
  // ─────────────────────────────────────────
  let payload: Payload
  try {
    payload = await req.json()
  } catch (_err) {
    return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'NOT_JSON' })
  }

  // missing: 必須フィールドが空 / 非 string
  // invalid: 値はあるが形式不正 (例: user_id が UUID でない)
  const missing: string[] = []
  const invalid: string[] = []

  let userId: string | null = null
  if (typeof payload.user_id !== 'string' || payload.user_id === '') {
    missing.push('user_id')
  } else if (!isUuid(payload.user_id)) {
    invalid.push('user_id')
  } else {
    userId = payload.user_id
  }

  const title = typeof payload.title === 'string' ? payload.title : null
  const body = typeof payload.body === 'string' ? payload.body : null
  if (title == null || title === '') missing.push('title')
  if (body == null || body === '') missing.push('body')

  if (missing.length > 0 || invalid.length > 0) {
    const errBody: Record<string, unknown> = { error: 'INVALID_PAYLOAD' }
    if (missing.length > 0) errBody.missing = missing
    if (invalid.length > 0) errBody.invalid = invalid
    return jsonResponse(400, errBody)
  }
  // ここまで来た時点で userId は必ず非 null だが、TS narrowing 用に念のため assert。
  if (userId == null) {
    return jsonResponse(500, { error: 'INTERNAL_ERROR' })
  }
  // data は任意。object 以外 (array / primitive) は無視して空 object に倒す。
  const dataField: Record<string, unknown> =
    payload.data != null &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : {}

  // ─────────────────────────────────────────
  // 3. service_role client で push_tokens を取得
  // ─────────────────────────────────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: tokenRows, error: selectError } = await supabaseAdmin
    .from('push_tokens')
    .select('expo_push_token, platform')
    .eq('user_id', userId)

  if (selectError != null) {
    console.error('[send-push] select push_tokens failed', selectError)
    return jsonResponse(500, { error: 'INTERNAL_ERROR' })
  }

  // ★不正形式トークンの除外 (修正A)。
  //   addPushTokenListener の native トークン (APNs/FCM の生文字列) が誤って
  //   push_tokens に混入すると、Expo Push API は配列内に 1 本でも不正な `to` が
  //   あるとリクエスト全体を 400 で拒否する → そのユーザーの正常トークン分も含め
  //   全通知が止まる。送信前に ExponentPushToken[ 形式でないものを除外する。
  const rawTokens: string[] = (tokenRows ?? [])
    .map((r) => r.expo_push_token)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)

  const tokens: string[] = rawTokens.filter((t) =>
    t.startsWith('ExponentPushToken['),
  )

  const excludedCount = rawTokens.length - tokens.length
  if (excludedCount > 0) {
    // ★本番で「除外が頻発しているのに誰も気づかない」状態を避けるため、
    //   除外が発生したら必ず Edge Logs に残す。
    console.warn(
      '[send-push] excluded invalid-format tokens',
      JSON.stringify({
        user_id: userId,
        excluded: excludedCount,
        valid: tokens.length,
        total: rawTokens.length,
      }),
    )
  }

  if (tokens.length === 0) {
    // 「除外によって 0 件になった」ケースは通常の 0 件と区別してログに残す
    //   (レスポンス body でも reason を返し、呼出側/監視で判別可能にする)。
    if (excludedCount > 0) {
      console.warn(
        '[send-push] no valid tokens after exclusion — all tokens were invalid-format',
        JSON.stringify({ user_id: userId, excluded: excludedCount }),
      )
    }
    return jsonResponse(200, {
      ok: true,
      sent: 0,
      removed: 0,
      excluded: excludedCount,
      reason: excludedCount > 0 ? 'ALL_TOKENS_INVALID_FORMAT' : 'NO_TOKENS',
      user_id: userId,
    })
  }

  // ─────────────────────────────────────────
  // 4. Expo Push API に送信
  //    1 user 複数 token に対応するため messages を tokens.length 件作る。
  // ─────────────────────────────────────────
  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    data: dataField,
    sound: 'default' as const,
  }))

  let expoResp: Response
  try {
    expoResp = await fetch(EXPO_PUSH_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    })
  } catch (err) {
    console.error('[send-push] fetch Expo Push API threw', err)
    return jsonResponse(500, { error: 'PUSH_API_FAILED', status: 0 })
  }

  if (!expoResp.ok) {
    const errBody = await safeReadText(expoResp)
    console.error(
      '[send-push] Expo Push API non-OK',
      expoResp.status,
      errBody,
    )
    return jsonResponse(500, {
      error: 'PUSH_API_FAILED',
      status: expoResp.status,
      body: errBody,
    })
  }

  let expoJson: ExpoPushSendResponse
  try {
    expoJson = (await expoResp.json()) as ExpoPushSendResponse
  } catch (err) {
    console.error('[send-push] Expo Push API JSON parse failed', err)
    return jsonResponse(500, { error: 'PUSH_API_FAILED', status: 200 })
  }

  const tickets: ExpoPushTicket[] = expoJson.data ?? []

  // ★リクエストレベルのエラー (チケットごとの data ではなく top-level errors 配列に
  //   入るケース) も握り潰さない。全 message が弾かれた等で発生しうる。
  if (expoJson.errors != null && expoJson.errors.length > 0) {
    console.error(
      '[send-push] Expo request-level errors',
      JSON.stringify({ user_id: userId, errors: expoJson.errors }),
    )
  }

  // ─────────────────────────────────────────
  // 5. ticket を解析
  //    - tickets と messages は index 対応 (Expo の仕様)
  //    - status='error' && details.error が INVALID_TOKEN_ERRORS のものは
  //      対応 token を push_tokens から削除
  //    - ★status='error' は削除対象でなくても必ずログに残す (サイレント失敗防止)。
  //      Expo が HTTP 200 を返しつつチケット単位で error を返すため、
  //      ここを見ないと「Expo に受理されたが配信されない」原因を切り分けられない。
  // ─────────────────────────────────────────
  let sent = 0
  let errorCount = 0
  const errorCodes: string[] = []
  const tokensToRemove = new Set<string>()
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]
    const token = tokens[i]
    if (ticket.status === 'ok') {
      sent++
      continue
    }
    // status === 'error': エラーコードに関わらず必ずログ出力する。
    errorCount++
    const errCode = ticket.details?.error ?? 'UNKNOWN'
    errorCodes.push(errCode)
    console.error(
      '[send-push] ticket error',
      JSON.stringify({
        user_id: userId,
        error: errCode,
        message: ticket.message ?? null,
        // 全文はログに残さない (先頭20文字のみで token を識別)。
        token_prefix:
          typeof token === 'string' ? token.slice(0, 20) : null,
      }),
    )
    // 削除は従来どおり DeviceNotRegistered のみ (安全側方針は変更しない・:117-122)。
    // 他のエラーコードは上のログで可視化し、削除はしない (誤削除防止)。
    if (
      ticket.details?.error != null &&
      INVALID_TOKEN_ERRORS.has(ticket.details.error)
    ) {
      // ticket.details.expoPushToken が付くケースもあるが、index 対応の方が確実。
      tokensToRemove.add(token)
    }
  }

  let removed = 0
  if (tokensToRemove.size > 0) {
    const arr = Array.from(tokensToRemove)
    const { error: deleteError, count } = await supabaseAdmin
      .from('push_tokens')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .in('expo_push_token', arr)

    if (deleteError != null) {
      // 削除失敗はログのみ、レスポンスは成功扱い (送信自体は試行済)。
      console.error('[send-push] delete invalid tokens failed', deleteError)
    } else {
      removed = count ?? arr.length
    }
  }

  // ★送信サマリーを必ず 1 行残す (成功時も)。
  //   これが無いと「送信された」ことすら Logs から確認できず、配信失敗の切り分けが
  //   できない。ok_count が全件でも配信不達なら receipt 段階の問題 (下記注記) と分かる。
  console.log(
    '[send-push] summary',
    JSON.stringify({
      user_id: userId,
      total: tickets.length,
      ok_count: sent,
      error_count: errorCount,
      errors: errorCodes,
      removed,
    }),
  )

  return jsonResponse(200, {
    ok: true,
    sent,
    removed,
    excluded: excludedCount,
    user_id: userId,
    tickets,
  })
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

async function safeReadText(resp: Response): Promise<string> {
  try {
    return await resp.text()
  } catch {
    return ''
  }
}
