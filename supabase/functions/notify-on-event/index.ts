// supabase/functions/notify-on-event/index.ts
//
// Push 通知 PR4-a: Supabase Database Webhook 受け口 Edge Function。
//
// 役割:
//   1. method 検証 (POST のみ) + CORS preflight
//   2. internal secret 検証 (x-send-push-secret ヘッダ vs SEND_PUSH_SECRET env、
//      PR3 send-push と同じ secret を再利用)
//   3. Webhook payload (Supabase Database Webhooks 標準形式) を解釈し、
//      対象テーブルごとに通知先 user_id / Push payload を組み立て
//   4. 既存 send-push Edge Function を HTTP fetch で内部 invoke (A-2 方式)
//      - send-push は PR3 で固めた token 取得 / Expo Push API / DeviceNotRegistered
//        cleanup を担当。本 Edge Function はイベント解釈と通知先判定のみ責務。
//
// 対応イベント:
//   A. venue_holds INSERT
//      - 通知先: record.receiver_id (= 当該 supply_post 投稿者)
//      - skip: status !== 'pending' / 自分自身 / proposer or receiver 不在
//      - data.route: '/venue-tab' (per-venue 詳細は会場タブ経由で到達)
//
//   B. venue_trade_messages INSERT
//      - 通知先: venue_trades の participants のうち sender_id 以外
//      - skip: kind !== 'user' / sender_id 不在 / trade_id 不在 / 自分自身
//      - 異常系 (sender が participant でない) は 200 skip + console.error
//        (RPC send_venue_trade_message が participant チェックを行うため
//         運用上 RPC 経路では発生しない。手動 DML 等の整合性異常は retry
//         しても解決しないため 200 で skip)
//      - venue_trades 取得失敗 (race / 一時障害) は 500 → Webhook retry
//      - data.route: '/venue/trade/<trade_id>' (tap 時 router.push 1 発で解決)
//      - body: 'メッセージが届きました' 固定文 (privacy 配慮、本文プレビュー無し)
//
// 認証/保護方式:
//   - PR3 send-push と同じ x-send-push-secret ヘッダ方式
//   - 同じ SEND_PUSH_SECRET 値を再利用 (Push 経路の単一責務 secret)
//   - SUPABASE_SERVICE_ROLE_KEY は Edge Function 内のみで venue_trades SELECT に使用
//   - secret 値・service_role key は console / response に絶対出さない
//
// 失敗時の扱い (Webhook retry を意識した HTTP ステータス設計):
//   - 401 UNAUTHORIZED       — secret 未設定 / 不一致 (retry されても解決しない)
//   - 400 INVALID_PAYLOAD    — JSON parse 失敗
//   - 200 ok + skipped       — 不明 table / skip 条件 (整合性異常含む)
//   - 500 LOOKUP_FAILED      — venue_trades 取得失敗 (transient、retry させる)
//   - 500 TRADE_NOT_FOUND    — trade 行未発見 (commit timing race、retry させる)
//   - 500 SEND_PUSH_FAILED   — send-push non-OK (transient 想定、retry させる)
//   - 200 + send_push echo   — send-push が sent=0 を返した場合も含む正常系
//
// 環境変数:
//   - SUPABASE_URL                  (自動)
//   - SUPABASE_SERVICE_ROLE_KEY     (自動)
//   - SEND_PUSH_SECRET              (PR3 で設定済の値を再利用)
//   - SEND_PUSH_URL                 (任意。未設定なら SUPABASE_URL から導出)
//
// デプロイ手順:
//   1. npx supabase functions deploy notify-on-event --no-verify-jwt
//   2. (secret は PR3 で設定済の SEND_PUSH_SECRET をそのまま使用するため別途 set 不要)
//   3. Supabase Dashboard で Database Webhook を 2 件設定
//      (詳細手順は docs/push_webhook_setup.md 参照)
//
// 本 PR4-a で実装しないもの:
//   - app 側 tap deep-link listener (別 PR)
//   - 通常申請 / 通常承認 Push (別 PR)
//   - notifications テーブル (別 PR、retry / dedupe を厳密化する場合)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SEND_PUSH_SECRET = Deno.env.get('SEND_PUSH_SECRET')
const SEND_PUSH_URL_OVERRIDE = Deno.env.get('SEND_PUSH_URL')

// Supabase Database Webhook の標準 payload 形 (本 Edge Function が触る部分のみ)。
type WebhookPayload = {
  type?: unknown // 'INSERT' | 'UPDATE' | 'DELETE'
  table?: unknown
  schema?: unknown
  record?: unknown
  old_record?: unknown
}

// venue_holds の record (Webhook payload 内、本 Edge Function が参照する列のみ)
type VenueHoldRecord = {
  id?: string
  venue_id?: string
  proposer_id?: string
  receiver_id?: string
  status?: string
}

// venue_trade_messages の record (本 Edge Function が参照する列のみ)
type VenueTradeMessageRecord = {
  id?: string
  trade_id?: string
  sender_id?: string | null
  kind?: string
  body?: string
  system_event?: string | null
}

// send-push に渡す payload 形
type SendPushPayload = {
  user_id: string
  title: string
  body: string
  data: Record<string, unknown>
}

Deno.serve(async (req) => {
  // CORS preflight (Webhook 経由は CORS 不要だが念のため send-push と同パターン)
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
  // (1) internal secret 検証
  //     SEND_PUSH_SECRET 未設定の関数は事故防止のため一律 401。
  // ─────────────────────────────────────────
  if (SEND_PUSH_SECRET == null || SEND_PUSH_SECRET === '') {
    console.error('[notify-on-event] SEND_PUSH_SECRET is not set in env')
    return jsonResponse(401, { error: 'UNAUTHORIZED' })
  }
  const providedSecret = req.headers.get('x-send-push-secret')
  if (providedSecret == null || providedSecret !== SEND_PUSH_SECRET) {
    return jsonResponse(401, { error: 'UNAUTHORIZED' })
  }

  // ─────────────────────────────────────────
  // (2) payload parse
  // ─────────────────────────────────────────
  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch (_err) {
    return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'NOT_JSON' })
  }

  const eventType = typeof payload.type === 'string' ? payload.type : null
  const table = typeof payload.table === 'string' ? payload.table : null

  // 本 PR4-a は INSERT のみ subscribe する想定 (Dashboard 側でも INSERT only)。
  // 万一 UPDATE/DELETE が来ても 200 skip (Webhook retry させない)。
  if (eventType !== 'INSERT') {
    return jsonResponse(200, { ok: true, skipped: 'NOT_INSERT' })
  }

  // ─────────────────────────────────────────
  // (3) table 別に分岐
  // ─────────────────────────────────────────
  if (table === 'venue_holds') {
    return await handleVenueHoldInsert(payload.record)
  }
  if (table === 'venue_trade_messages') {
    return await handleVenueTradeMessageInsert(payload.record)
  }

  // 不明 table は skip (Webhook retry させない)
  console.warn('[notify-on-event] unknown table', table)
  return jsonResponse(200, { ok: true, skipped: 'UNKNOWN_TABLE' })
})

// ─────────────────────────────────────────
// (A) venue_holds INSERT ハンドラ
// ─────────────────────────────────────────
async function handleVenueHoldInsert(
  recordRaw: unknown,
): Promise<Response> {
  if (recordRaw == null || typeof recordRaw !== 'object') {
    return jsonResponse(200, { ok: true, skipped: 'NO_RECORD' })
  }
  const record = recordRaw as VenueHoldRecord
  const holdId = typeof record.id === 'string' ? record.id : null
  const venueId = typeof record.venue_id === 'string' ? record.venue_id : null
  const proposerId =
    typeof record.proposer_id === 'string' ? record.proposer_id : null
  const receiverId =
    typeof record.receiver_id === 'string' ? record.receiver_id : null
  const status = typeof record.status === 'string' ? record.status : null

  // skip 条件
  if (status !== 'pending') {
    return jsonResponse(200, { ok: true, skipped: 'STATUS_NOT_PENDING' })
  }
  if (proposerId == null || proposerId === '') {
    console.warn('[notify-on-event] venue_holds: missing proposer_id')
    return jsonResponse(200, { ok: true, skipped: 'MISSING_PROPOSER_ID' })
  }
  if (receiverId == null || receiverId === '') {
    console.warn('[notify-on-event] venue_holds: missing receiver_id')
    return jsonResponse(200, { ok: true, skipped: 'MISSING_RECEIVER_ID' })
  }
  if (proposerId === receiverId) {
    console.warn('[notify-on-event] venue_holds: proposer === receiver, skip')
    return jsonResponse(200, { ok: true, skipped: 'SELF_NOTIFY' })
  }

  // Push payload 構築 (data 内の optional フィールドは null/undefined を入れない)
  const dataFields: Record<string, unknown> = {
    type: 'venue_hold_requested',
    route: '/venue-tab',
    proposer_id: proposerId,
  }
  if (venueId != null) dataFields.venue_id = venueId
  if (holdId != null) dataFields.hold_id = holdId

  const sendPushPayload: SendPushPayload = {
    user_id: receiverId,
    title: '会場でHold申請が届きました',
    body: '内容を確認して、交換できるか返答しましょう',
    data: dataFields,
  }

  return await invokeSendPush(sendPushPayload, 'venue_holds')
}

// ─────────────────────────────────────────
// (B) venue_trade_messages INSERT ハンドラ
// ─────────────────────────────────────────
async function handleVenueTradeMessageInsert(
  recordRaw: unknown,
): Promise<Response> {
  if (recordRaw == null || typeof recordRaw !== 'object') {
    return jsonResponse(200, { ok: true, skipped: 'NO_RECORD' })
  }
  const record = recordRaw as VenueTradeMessageRecord
  const kind = typeof record.kind === 'string' ? record.kind : null
  const senderId =
    typeof record.sender_id === 'string' ? record.sender_id : null
  const tradeId = typeof record.trade_id === 'string' ? record.trade_id : null

  // skip 条件 (system message / sender 不明 / trade_id 不明)
  if (kind !== 'user') {
    return jsonResponse(200, { ok: true, skipped: 'KIND_NOT_USER' })
  }
  if (senderId == null || senderId === '') {
    console.warn('[notify-on-event] venue_trade_messages: missing sender_id')
    return jsonResponse(200, { ok: true, skipped: 'MISSING_SENDER_ID' })
  }
  if (tradeId == null || tradeId === '') {
    console.warn('[notify-on-event] venue_trade_messages: missing trade_id')
    return jsonResponse(200, { ok: true, skipped: 'MISSING_TRADE_ID' })
  }

  // service_role で venue_trades の participants を取得 (RLS bypass)
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: tradeRow, error: tradeError } = await supabaseAdmin
    .from('venue_trades')
    .select('proposer_id, receiver_id')
    .eq('id', tradeId)
    .maybeSingle()

  if (tradeError != null) {
    console.error(
      '[notify-on-event] venue_trades select failed',
      tradeError,
    )
    // 一時的な DB エラー想定 → Webhook retry させる
    return jsonResponse(500, { error: 'LOOKUP_FAILED' })
  }
  if (tradeRow == null) {
    console.error(
      '[notify-on-event] venue_trades not found for trade_id',
      tradeId,
    )
    // commit timing race の可能性あり → Webhook retry させる
    return jsonResponse(500, { error: 'TRADE_NOT_FOUND' })
  }

  const proposerId =
    typeof tradeRow.proposer_id === 'string' ? tradeRow.proposer_id : null
  const receiverId =
    typeof tradeRow.receiver_id === 'string' ? tradeRow.receiver_id : null
  if (proposerId == null || receiverId == null) {
    console.error(
      '[notify-on-event] venue_trades participants missing',
      tradeId,
    )
    return jsonResponse(500, { error: 'TRADE_PARTICIPANTS_MISSING' })
  }

  // 送信先決定: sender_id と異なる方の participant
  let recipientId: string | null = null
  if (senderId === proposerId) {
    recipientId = receiverId
  } else if (senderId === receiverId) {
    recipientId = proposerId
  } else {
    // 整合性異常: sender が trade の participant でない。
    //   - RPC send_venue_trade_message は participant チェックを行うため通常起こらない。
    //   - 運用 DML / seed 不整合等で起き得るが、retry しても解決しないため
    //     500 ではなく 200 skip + console.error でログだけ残す。
    console.error(
      '[notify-on-event] sender is not a participant of venue_trade',
      { trade_id: tradeId, sender_id: senderId },
    )
    return jsonResponse(200, {
      ok: true,
      skipped: 'SENDER_NOT_PARTICIPANT',
    })
  }

  if (recipientId === senderId) {
    // 上記分岐で必ず異なる id を選ぶ設計だが念のため二重防御。
    return jsonResponse(200, { ok: true, skipped: 'SELF_NOTIFY' })
  }

  const sendPushPayload: SendPushPayload = {
    user_id: recipientId,
    title: '会場交換のメッセージが届きました',
    body: '会場交換の相手からメッセージが届きました',
    data: {
      type: 'venue_trade_message',
      route: `/venue/trade/${tradeId}`,
      venue_trade_id: tradeId,
    },
  }

  return await invokeSendPush(sendPushPayload, 'venue_trade_messages')
}

// ─────────────────────────────────────────
// send-push を内部 fetch で invoke (A-2 方式)
//   - PR3 send-push に同じ x-send-push-secret を付与
//   - sent=0 / removed=0 等の成功系はそのまま 200 で透過
//   - send-push non-OK は 500 SEND_PUSH_FAILED で Webhook retry させる
// ─────────────────────────────────────────
async function invokeSendPush(
  payload: SendPushPayload,
  source: string,
): Promise<Response> {
  let url: string
  try {
    url = getSendPushUrl()
  } catch (err) {
    console.error('[notify-on-event] getSendPushUrl failed', err)
    return jsonResponse(500, { error: 'INTERNAL_ERROR' })
  }

  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 値はログにも console にも出さない (fetch header に渡すのみ)。
        'x-send-push-secret': SEND_PUSH_SECRET ?? '',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[notify-on-event] fetch send-push threw', err)
    return jsonResponse(500, { error: 'SEND_PUSH_FAILED', status: 0 })
  }

  if (!resp.ok) {
    const errBody = await safeReadText(resp)
    console.error(
      '[notify-on-event] send-push non-OK',
      resp.status,
      errBody,
      'source=',
      source,
    )
    return jsonResponse(500, {
      error: 'SEND_PUSH_FAILED',
      status: resp.status,
      body: errBody,
    })
  }

  let respJson: unknown
  try {
    respJson = await resp.json()
  } catch (err) {
    console.error('[notify-on-event] send-push JSON parse failed', err)
    return jsonResponse(500, {
      error: 'SEND_PUSH_FAILED',
      status: resp.status,
    })
  }

  return jsonResponse(200, {
    ok: true,
    source,
    send_push: respJson,
  })
}

// ─────────────────────────────────────────
// helpers
// ─────────────────────────────────────────

// send-push の URL を組み立てる。
//   優先 1: SEND_PUSH_URL env (任意上書き、テスト等)
//   優先 2: SUPABASE_URL から導出 = https://<ref>.functions.supabase.co/send-push
function getSendPushUrl(): string {
  if (SEND_PUSH_URL_OVERRIDE != null && SEND_PUSH_URL_OVERRIDE !== '') {
    return SEND_PUSH_URL_OVERRIDE
  }
  // SUPABASE_URL は通常 'https://<ref>.supabase.co' 形式。
  // 末尾 / の有無や rare な変則 URL は弾く (誤った URL に POST しないため)。
  const m = SUPABASE_URL.match(/^https:\/\/([^.\s/]+)\.supabase\.co\/?$/)
  if (m == null) {
    throw new Error('cannot derive functions URL from SUPABASE_URL')
  }
  return `https://${m[1]}.functions.supabase.co/send-push`
}

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
