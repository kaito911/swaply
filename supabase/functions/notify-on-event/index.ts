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
//   C. venue_trades UPDATE (PR-5 キャンセル申請モデル)
//      - C1: cancel_requested_at が NULL → NOT NULL に変わった (= キャンセル申請)
//            通知先: cancel_requested_by 以外の participant
//            title: 'キャンセル申請が届きました'
//            body : '取引のキャンセルを申請されました。2 時間以内に承認または拒否してください。'
//      - C2: cancel_requested_at が NOT NULL → NULL かつ record.status='pending' (= 拒否)
//            (申請取り下げと拒否は両方とも NOT NULL→NULL の遷移だが、申請者本人の取り下げ
//             を通知するのは騒がしいので、拒否時のみ通知する。申請者と取り下げ者の id を
//             比較できれば理想だが、Webhook record だけからは取り下げ者が分からない。
//             代替として『応答 RPC は申請者以外しか呼べない』というガード性質を利用し、
//             new_record.cancel_requested_by が NULL かつ old.cancel_requested_by が
//             受信者以外を含む = 申請者以外による NULL 化 = 拒否扱いとして通知する。
//             ただし取り下げと拒否を Edge 側で正確に分離するのは難しいため、本 PR では
//             status='cancelled' でない NOT NULL→NULL 遷移を「拒否」と一律扱う。
//             取り下げ通知が混じる場合があるが、申請者自身に「拒否通知」が誤って届くと UX が
//             悪いので、recipient = 元 cancel_requested_by に限定して通知する。)
//            通知先: old_record.cancel_requested_by (= 元の申請者)
//            title: 'キャンセルが拒否されました'
//            body : '相手がキャンセルを拒否しました。取引は継続中です。'
//      - C3: それ以外の UPDATE (status='cancelled' / 完了確定 timestamp 更新 等)
//            → skip (今後別 PR で別 type の Push を追加する可能性あり)
//      - data.route: '/venue/trade/<trade_id>'
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

// PR-5: venue_trades の record / old_record (UPDATE で参照する列のみ)
type VenueTradeRecord = {
  id?: string
  proposer_id?: string
  receiver_id?: string
  status?: string
  cancel_requested_at?: string | null
  cancel_requested_by?: string | null
}

// PR-DM: trade_messages の record (INSERT で参照する列のみ)
type TradeMessageRecord = {
  id?: string
  trade_id?: string
  sender_user_id?: string | null
  kind?: string
}

// PR-DM: offers の record / old_record (INSERT / UPDATE で参照する列のみ)。
//   受け手は offers に列が無く target_card_id → cards.owner_user_id で解決する。
type OfferRecord = {
  id?: string
  proposer_user_id?: string
  target_card_id?: string
  status?: string
  parent_offer_id?: string | null
}

// PR-DM: trades の record / old_record (UPDATE で参照する列のみ)。
//   offer_id: /trade/[offerId] を開くための deep-link 用 (修正C)。
//   cancelled_by: キャンセル実行者。実行者を通知先から除外する (修正A、K が列追加+RPC変更を実行)。
type TradeRecord = {
  id?: string
  offer_id?: string
  proposer_user_id?: string
  receiver_user_id?: string
  status?: string
  cancelled_by?: string | null
}

// PR-DM: shipments の record / old_record (UPDATE で参照する列のみ)。
//   shipments.user_id = 発送者。通知先は「発送者でない側」の trade participant。
type ShipmentRecord = {
  id?: string
  trade_id?: string
  user_id?: string
  status?: string
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

  // INSERT は全 table 通す。UPDATE は venue_trades / offers / trades / shipments のみ通す
  // (PR-5 キャンセル申請 + PR-DM 提案承認/辞退・取引キャンセル・発送)。他 UPDATE/DELETE は 200 skip。
  const isHandledEvent =
    eventType === 'INSERT' ||
    (eventType === 'UPDATE' &&
      (table === 'venue_trades' ||
        table === 'offers' ||
        table === 'trades' ||
        table === 'shipments'))
  if (!isHandledEvent) {
    return jsonResponse(200, { ok: true, skipped: 'NOT_HANDLED_EVENT' })
  }

  // ─────────────────────────────────────────
  // (3) table 別に分岐
  // ─────────────────────────────────────────
  if (eventType === 'INSERT' && table === 'venue_holds') {
    return await handleVenueHoldInsert(payload.record)
  }
  if (eventType === 'INSERT' && table === 'venue_trade_messages') {
    return await handleVenueTradeMessageInsert(payload.record)
  }
  if (eventType === 'UPDATE' && table === 'venue_trades') {
    return await handleVenueTradeUpdate(payload.record, payload.old_record)
  }
  // PR-DM: 会場 Hold 承認 = venue_trades INSERT (前監査 S1 の成立通知欠落を解消)
  if (eventType === 'INSERT' && table === 'venue_trades') {
    return await handleVenueTradeInsert(payload.record)
  }
  // PR-DM: 取引 DM
  if (eventType === 'INSERT' && table === 'trade_messages') {
    return await handleTradeMessageInsert(payload.record)
  }
  // PR-DM: 提案作成 (新規 / カウンター) と 承認 / 辞退
  if (eventType === 'INSERT' && table === 'offers') {
    return await handleOfferInsert(payload.record)
  }
  if (eventType === 'UPDATE' && table === 'offers') {
    return await handleOfferUpdate(payload.record, payload.old_record)
  }
  // PR-DM: 取引キャンセル (一方的確定 = 通知が唯一の痕跡)
  if (eventType === 'UPDATE' && table === 'trades') {
    return await handleTradeUpdate(payload.record, payload.old_record)
  }
  // PR-DM: 発送
  if (eventType === 'UPDATE' && table === 'shipments') {
    return await handleShipmentUpdate(payload.record, payload.old_record)
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
// (C) venue_trades UPDATE ハンドラ (PR-5 キャンセル申請モデル)
//   - C1: cancel_requested_at が NULL → NOT NULL → 申請通知 (相手側へ)
//   - C2: cancel_requested_at が NOT NULL → NULL かつ status='pending' → 拒否通知 (元申請者へ)
//   - その他の遷移は skip。
// ─────────────────────────────────────────
async function handleVenueTradeUpdate(
  recordRaw: unknown,
  oldRecordRaw: unknown,
): Promise<Response> {
  if (recordRaw == null || typeof recordRaw !== 'object') {
    return jsonResponse(200, { ok: true, skipped: 'NO_RECORD' })
  }
  if (oldRecordRaw == null || typeof oldRecordRaw !== 'object') {
    // UPDATE Webhook で old_record が無いのは Dashboard 設定漏れ。
    // retry しても解決しないため 200 skip + console.warn。
    console.warn('[notify-on-event] venue_trades UPDATE: no old_record')
    return jsonResponse(200, { ok: true, skipped: 'NO_OLD_RECORD' })
  }
  const record = recordRaw as VenueTradeRecord
  const oldRecord = oldRecordRaw as VenueTradeRecord

  const tradeId = typeof record.id === 'string' ? record.id : null
  const proposerId =
    typeof record.proposer_id === 'string' ? record.proposer_id : null
  const receiverId =
    typeof record.receiver_id === 'string' ? record.receiver_id : null
  if (tradeId == null || proposerId == null || receiverId == null) {
    return jsonResponse(200, { ok: true, skipped: 'MISSING_PARTICIPANTS' })
  }

  const oldRequestedAt =
    typeof oldRecord.cancel_requested_at === 'string'
      ? oldRecord.cancel_requested_at
      : null
  const newRequestedAt =
    typeof record.cancel_requested_at === 'string'
      ? record.cancel_requested_at
      : null
  const newRequestedBy =
    typeof record.cancel_requested_by === 'string'
      ? record.cancel_requested_by
      : null
  const oldRequestedBy =
    typeof oldRecord.cancel_requested_by === 'string'
      ? oldRecord.cancel_requested_by
      : null
  const newStatus = typeof record.status === 'string' ? record.status : null

  // C1: 申請通知 (NULL → NOT NULL)
  if (oldRequestedAt == null && newRequestedAt != null) {
    if (newRequestedBy == null) {
      console.warn(
        '[notify-on-event] venue_trades: cancel_requested_by missing on request',
        tradeId,
      )
      return jsonResponse(200, {
        ok: true,
        skipped: 'MISSING_REQUESTED_BY',
      })
    }
    // 申請者以外の participant に通知
    const recipientId =
      newRequestedBy === proposerId
        ? receiverId
        : newRequestedBy === receiverId
          ? proposerId
          : null
    if (recipientId == null) {
      console.error(
        '[notify-on-event] venue_trades: requester is not a participant',
        { trade_id: tradeId, requester: newRequestedBy },
      )
      return jsonResponse(200, {
        ok: true,
        skipped: 'REQUESTER_NOT_PARTICIPANT',
      })
    }

    const sendPushPayload: SendPushPayload = {
      user_id: recipientId,
      title: 'キャンセル申請が届きました',
      body: '取引のキャンセルを申請されました。2 時間以内に承認または拒否してください。',
      data: {
        type: 'venue_trade_cancel_requested',
        route: `/venue/trade/${tradeId}`,
        venue_trade_id: tradeId,
      },
    }
    return await invokeSendPush(sendPushPayload, 'venue_trades:cancel_requested')
  }

  // C2: 拒否通知 (NOT NULL → NULL かつ status='pending'、cancelled に倒れた場合は除外)
  //     取り下げと拒否を厳密に分離できないため、recipient を元申請者に限定して
  //     「自分の申請が拒否された」通知としてだけ送る (申請者本人による取り下げの場合は
  //      自分宛通知になるので自己防衛的に SELF_NOTIFY で skip される)。
  if (oldRequestedAt != null && newRequestedAt == null && newStatus === 'pending') {
    if (oldRequestedBy == null) {
      return jsonResponse(200, { ok: true, skipped: 'MISSING_OLD_REQUESTER' })
    }

    const sendPushPayload: SendPushPayload = {
      user_id: oldRequestedBy,
      title: 'キャンセルが拒否されました',
      body: '相手がキャンセルを拒否しました。取引は継続中です。',
      data: {
        type: 'venue_trade_cancel_declined',
        route: `/venue/trade/${tradeId}`,
        venue_trade_id: tradeId,
      },
    }
    return await invokeSendPush(sendPushPayload, 'venue_trades:cancel_declined')
  }

  // その他の UPDATE (確定 / status='cancelled' への遷移 等) は skip。
  return jsonResponse(200, { ok: true, skipped: 'NO_CANCEL_TRANSITION' })
}

// service_role クライアント (RLS bypass、participant 取得等に使用) を都度生成する共通 helper。
function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

// ─────────────────────────────────────────
// (D) trade_messages INSERT ハンドラ (取引 DM)
//   通知先: trades の participants のうち sender 以外
//   skip: kind !== 'user' / sender/trade_id 不在 / sender が participant でない
//   body: 固定文 (本文プレビュー無し、会場 DM に揃える)
//   route: '/trade/dm/<trade_id>' (アプリ側 Phase 3 で新設する DM 画面)
// ─────────────────────────────────────────
async function handleTradeMessageInsert(recordRaw: unknown): Promise<Response> {
  if (recordRaw == null || typeof recordRaw !== 'object') {
    return jsonResponse(200, { ok: true, skipped: 'NO_RECORD' })
  }
  const record = recordRaw as TradeMessageRecord
  const kind = typeof record.kind === 'string' ? record.kind : null
  const senderId =
    typeof record.sender_user_id === 'string' ? record.sender_user_id : null
  const tradeId = typeof record.trade_id === 'string' ? record.trade_id : null

  if (kind !== 'user') {
    return jsonResponse(200, { ok: true, skipped: 'KIND_NOT_USER' })
  }
  if (senderId == null || senderId === '') {
    return jsonResponse(200, { ok: true, skipped: 'MISSING_SENDER_ID' })
  }
  if (tradeId == null || tradeId === '') {
    return jsonResponse(200, { ok: true, skipped: 'MISSING_TRADE_ID' })
  }

  const { data: tradeRow, error } = await adminClient()
    .from('trades')
    .select('proposer_user_id, receiver_user_id, offer_id')
    .eq('id', tradeId)
    .maybeSingle()
  if (error != null) {
    console.error('[notify-on-event] trades select failed', error)
    return jsonResponse(500, { error: 'LOOKUP_FAILED' })
  }
  if (tradeRow == null) {
    console.error('[notify-on-event] trade not found', tradeId)
    return jsonResponse(500, { error: 'TRADE_NOT_FOUND' })
  }
  const proposerId =
    typeof tradeRow.proposer_user_id === 'string' ? tradeRow.proposer_user_id : null
  const receiverId =
    typeof tradeRow.receiver_user_id === 'string' ? tradeRow.receiver_user_id : null
  const offerId =
    typeof tradeRow.offer_id === 'string' ? tradeRow.offer_id : null
  if (proposerId == null || receiverId == null) {
    return jsonResponse(500, { error: 'TRADE_PARTICIPANTS_MISSING' })
  }

  let recipientId: string | null = null
  if (senderId === proposerId) recipientId = receiverId
  else if (senderId === receiverId) recipientId = proposerId
  else {
    console.error('[notify-on-event] sender not participant of trade', {
      trade_id: tradeId,
      sender: senderId,
    })
    return jsonResponse(200, { ok: true, skipped: 'SENDER_NOT_PARTICIPANT' })
  }
  if (recipientId === senderId) {
    return jsonResponse(200, { ok: true, skipped: 'SELF_NOTIFY' })
  }

  // route は Phase 3 の DM 画面ルート確定後に合わせる。DM 画面が offer_id ベースなら
  // /trade/<offer_id>、trade_id ベースなら別途調整。両 id を data に載せて Phase 3 側で選べるようにする。
  const sendPushPayload: SendPushPayload = {
    user_id: recipientId,
    title: 'メッセージが届きました',
    body: '取引の相手からメッセージが届きました',
    data: {
      type: 'trade_message',
      route: offerId != null ? `/trade/${offerId}` : '/trades',
      trade_id: tradeId,
      offer_id: offerId ?? '',
    },
  }
  return await invokeSendPush(sendPushPayload, 'trade_messages')
}

// ─────────────────────────────────────────
// (E) offers INSERT ハンドラ (提案作成: 新規 / カウンター)
//   通知先: 受け手 = target_card_id → cards.owner_user_id (offers に receiver 列なし)
//   文面出し分け (案A 確定):
//     parent_offer_id NULL   → '交換の提案が届きました'
//     parent_offer_id 非NULL → '提案に返答がありました' (カウンター提案)
//   route: '/offer/<offer_id>' (提案詳細)
// ─────────────────────────────────────────
async function handleOfferInsert(recordRaw: unknown): Promise<Response> {
  if (recordRaw == null || typeof recordRaw !== 'object') {
    return jsonResponse(200, { ok: true, skipped: 'NO_RECORD' })
  }
  const record = recordRaw as OfferRecord
  const offerId = typeof record.id === 'string' ? record.id : null
  const proposerId =
    typeof record.proposer_user_id === 'string' ? record.proposer_user_id : null
  const targetCardId =
    typeof record.target_card_id === 'string' ? record.target_card_id : null
  const isCounter =
    typeof record.parent_offer_id === 'string' && record.parent_offer_id !== ''
  const status = typeof record.status === 'string' ? record.status : null

  // 提案作成時の status は 'pending'。counter で元 offer を declined にする UPDATE は
  // handleOfferUpdate 側で扱う。INSERT では pending 以外は skip (防御的)。
  if (status != null && status !== 'pending') {
    return jsonResponse(200, { ok: true, skipped: 'STATUS_NOT_PENDING' })
  }
  if (offerId == null || proposerId == null || targetCardId == null) {
    return jsonResponse(200, { ok: true, skipped: 'MISSING_FIELDS' })
  }

  // 受け手 = target_card の owner
  const { data: cardRow, error } = await adminClient()
    .from('cards')
    .select('owner_user_id')
    .eq('id', targetCardId)
    .maybeSingle()
  if (error != null) {
    console.error('[notify-on-event] cards select failed', error)
    return jsonResponse(500, { error: 'LOOKUP_FAILED' })
  }
  if (cardRow == null) {
    console.error('[notify-on-event] target card not found', targetCardId)
    return jsonResponse(500, { error: 'CARD_NOT_FOUND' })
  }
  const receiverId =
    typeof cardRow.owner_user_id === 'string' ? cardRow.owner_user_id : null
  if (receiverId == null) {
    return jsonResponse(500, { error: 'CARD_OWNER_MISSING' })
  }
  if (receiverId === proposerId) {
    // 自分の出品への自己提案は createOffer が弾くが二重防御。
    return jsonResponse(200, { ok: true, skipped: 'SELF_NOTIFY' })
  }

  const sendPushPayload: SendPushPayload = {
    user_id: receiverId,
    title: isCounter ? '提案に返答がありました' : '交換の提案が届きました',
    body: isCounter
      ? '相手からカウンター提案が届きました'
      : '相手から交換の提案が届きました',
    data: {
      type: isCounter ? 'offer_counter' : 'offer_created',
      route: `/offer/${offerId}`,
      offer_id: offerId,
    },
  }
  return await invokeSendPush(sendPushPayload, 'offers:insert')
}

// ─────────────────────────────────────────
// (F) offers UPDATE ハンドラ (承認 / 辞退)
//   修正E+F: accepted / declined を提案者 (proposer_user_id) へ通知。
//     - accepted → 「提案が承認されました」(交換成立)
//     - declined → カウンターか純粋辞退かを子 offer の有無で判別:
//         この offer.id を parent_offer_id に持つ子 offer が存在する → カウンター → 通知しない
//         存在しない → 純粋辞退 → 「提案が見送られました」(辞退も『返事』であり通知すべき)
//   ★修正F: CHECK制約に 'countered' を足さず、counterOffer の順序変更
//     (子INSERT → 親decline) で「decline webhook 到達時に子が既に存在する」ことを保証し、
//     子 offer の存在チェックでカウンター判別する。前回のレース懸念は順序が逆だったため。
//   修正D: 全て old !== new の遷移ガード付き。#3/#4/#5 を同一パターン (old !== X && new === X) に統一。
//   route: '/offer/<offer_id>'
// ─────────────────────────────────────────
async function handleOfferUpdate(
  recordRaw: unknown,
  oldRaw: unknown,
): Promise<Response> {
  if (recordRaw == null || typeof recordRaw !== 'object') {
    return jsonResponse(200, { ok: true, skipped: 'NO_RECORD' })
  }
  const record = recordRaw as OfferRecord
  const oldRecord = (oldRaw ?? {}) as OfferRecord
  const offerId = typeof record.id === 'string' ? record.id : null
  const proposerId =
    typeof record.proposer_user_id === 'string' ? record.proposer_user_id : null
  const newStatus = typeof record.status === 'string' ? record.status : null
  const oldStatus = typeof oldRecord.status === 'string' ? oldRecord.status : null

  if (offerId == null || proposerId == null) {
    return jsonResponse(200, { ok: true, skipped: 'MISSING_FIELDS' })
  }
  // 遷移ガード共通部: status が変化していない UPDATE は全て skip。
  //   これにより以降の各分岐は「old !== new かつ new === X」= 遷移時のみ発火となる。
  if (newStatus === oldStatus) {
    return jsonResponse(200, { ok: true, skipped: 'STATUS_UNCHANGED' })
  }

  let title: string
  let body: string
  let notifType: string
  if (newStatus === 'accepted') {
    title = '提案が承認されました'
    body = '交換が成立しました。取引の画面を確認しましょう'
    notifType = 'offer_accepted'
  } else if (newStatus === 'declined') {
    // カウンター提案は未実装（offer/counter.tsx は到達不能な残骸）。
    // この判定は常に0件となり、declined は常に純粋辞退として通知される。
    // カウンターUIを将来実装する場合にのみ意味を持つ。
    // ─────────────────────────────────────────
    // ★修正F(残置): 子 offer (parent_offer_id = この offer.id) が存在すればカウンター扱いで
    //   通知しない。現状カウンターUIが無いため子は生成されず、常に純粋辞退として下へ進む。
    const { data: childRows, error: childErr } = await adminClient()
      .from('offers')
      .select('id')
      .eq('parent_offer_id', offerId)
      .limit(1)
    if (childErr != null) {
      console.error('[notify-on-event] offers child lookup failed', childErr)
      return jsonResponse(500, { error: 'LOOKUP_FAILED' })
    }
    if (childRows != null && childRows.length > 0) {
      // カウンター: 親 decline は通知しない (子 INSERT が別途 '提案に返答がありました' を送る)
      return jsonResponse(200, { ok: true, skipped: 'DECLINED_BY_COUNTER' })
    }
    title = '提案が見送られました'
    body = '相手が提案を見送りました'
    notifType = 'offer_declined'
  } else {
    // completed / cancelled 等は通知しない
    return jsonResponse(200, { ok: true, skipped: 'NO_NOTIFY_STATUS' })
  }

  const sendPushPayload: SendPushPayload = {
    user_id: proposerId,
    title,
    body,
    data: {
      type: notifType,
      route: `/offer/${offerId}`,
      offer_id: offerId,
    },
  }
  return await invokeSendPush(sendPushPayload, `offers:${newStatus}`)
}

// ─────────────────────────────────────────
// (G) trades UPDATE ハンドラ (取引キャンセル)
//   status → 'cancelled' のとき、キャンセルを実行していない側の participant へ通知。
//   ★通常取引のキャンセルは一方的確定 (相手同意不要) のため、通知が唯一の「痕跡」。
//   修正A: record.cancelled_by (K が列追加+cancel_trade_atomic 変更で書き込む) を使い、
//     実行者を除外して「相手」だけに送る。cancelled_by が不明 (null/未提供) の場合は
//     安全側で両 participant に送る (痕跡を必ず残すため落とさない)。
//   修正C: deep-link は offer_id で /trade/[offerId] を開く。record.offer_id を優先し、
//     無ければ service_role で trades から offer_id を引く。
// ─────────────────────────────────────────
async function handleTradeUpdate(
  recordRaw: unknown,
  oldRaw: unknown,
): Promise<Response> {
  if (recordRaw == null || typeof recordRaw !== 'object') {
    return jsonResponse(200, { ok: true, skipped: 'NO_RECORD' })
  }
  const record = recordRaw as TradeRecord
  const oldRecord = (oldRaw ?? {}) as TradeRecord
  const tradeId = typeof record.id === 'string' ? record.id : null
  const newStatus = typeof record.status === 'string' ? record.status : null
  const oldStatus = typeof oldRecord.status === 'string' ? oldRecord.status : null
  const proposerId =
    typeof record.proposer_user_id === 'string' ? record.proposer_user_id : null
  const receiverId =
    typeof record.receiver_user_id === 'string' ? record.receiver_user_id : null
  const cancelledBy =
    typeof record.cancelled_by === 'string' ? record.cancelled_by : null

  if (tradeId == null) {
    return jsonResponse(200, { ok: true, skipped: 'MISSING_TRADE_ID' })
  }
  if (newStatus !== 'cancelled' || oldStatus === 'cancelled') {
    return jsonResponse(200, { ok: true, skipped: 'NOT_CANCEL_TRANSITION' })
  }
  if (proposerId == null || receiverId == null) {
    return jsonResponse(200, { ok: true, skipped: 'PARTICIPANTS_MISSING' })
  }

  // deep-link 用 offer_id を解決 (record 優先、無ければ trades から引く)
  let offerId = typeof record.offer_id === 'string' ? record.offer_id : null
  if (offerId == null) {
    const { data: tr } = await adminClient()
      .from('trades')
      .select('offer_id')
      .eq('id', tradeId)
      .maybeSingle()
    offerId = tr != null && typeof tr.offer_id === 'string' ? tr.offer_id : null
  }
  const route = offerId != null ? `/trade/${offerId}` : '/trades'

  // 通知先: cancelled_by が判れば実行者を除外、不明なら両者 (痕跡を落とさない)
  let recipients: string[]
  if (cancelledBy != null) {
    recipients = [proposerId, receiverId].filter((u) => u !== cancelledBy)
  } else {
    recipients = [proposerId, receiverId]
  }
  recipients = recipients.filter((v, i, a) => a.indexOf(v) === i)

  const results: unknown[] = []
  for (const uid of recipients) {
    const r = await invokeSendPush(
      {
        user_id: uid,
        title: '取引がキャンセルされました',
        body: '取引がキャンセルされました。取引の画面を確認しましょう',
        data: { type: 'trade_cancelled', route, trade_id: tradeId },
      },
      'trades:cancelled',
    )
    // 個別失敗は retry 対象にせず集約 (1 人分の失敗で全体 retry すると重複通知になるため)。
    results.push({ user_id: uid, status: r.status })
  }
  return jsonResponse(200, { ok: true, source: 'trades:cancelled', results })
}

// ─────────────────────────────────────────
// (H) shipments UPDATE ハンドラ (発送)
//   status → 'shipped' のとき、発送者 (shipments.user_id) でない側の participant へ通知。
//   route: '/trade/<trade_id>'
// ─────────────────────────────────────────
async function handleShipmentUpdate(
  recordRaw: unknown,
  oldRaw: unknown,
): Promise<Response> {
  if (recordRaw == null || typeof recordRaw !== 'object') {
    return jsonResponse(200, { ok: true, skipped: 'NO_RECORD' })
  }
  const record = recordRaw as ShipmentRecord
  const oldRecord = (oldRaw ?? {}) as ShipmentRecord
  const tradeId = typeof record.trade_id === 'string' ? record.trade_id : null
  const senderId = typeof record.user_id === 'string' ? record.user_id : null
  const newStatus = typeof record.status === 'string' ? record.status : null
  const oldStatus = typeof oldRecord.status === 'string' ? oldRecord.status : null

  if (tradeId == null || senderId == null) {
    return jsonResponse(200, { ok: true, skipped: 'MISSING_FIELDS' })
  }
  if (newStatus !== 'shipped' || oldStatus === 'shipped') {
    return jsonResponse(200, { ok: true, skipped: 'NOT_SHIPPED_TRANSITION' })
  }

  // trades から participants + offer_id (deep-link 用・修正C) を取得
  const { data: tradeRow, error } = await adminClient()
    .from('trades')
    .select('proposer_user_id, receiver_user_id, offer_id')
    .eq('id', tradeId)
    .maybeSingle()
  if (error != null) {
    console.error('[notify-on-event] trades select failed', error)
    return jsonResponse(500, { error: 'LOOKUP_FAILED' })
  }
  if (tradeRow == null) {
    console.error('[notify-on-event] trade not found', tradeId)
    return jsonResponse(500, { error: 'TRADE_NOT_FOUND' })
  }
  const proposerId =
    typeof tradeRow.proposer_user_id === 'string' ? tradeRow.proposer_user_id : null
  const receiverId =
    typeof tradeRow.receiver_user_id === 'string' ? tradeRow.receiver_user_id : null
  const offerId =
    typeof tradeRow.offer_id === 'string' ? tradeRow.offer_id : null
  if (proposerId == null || receiverId == null) {
    return jsonResponse(500, { error: 'TRADE_PARTICIPANTS_MISSING' })
  }

  // 発送者でない側 = 受け取る側
  let recipientId: string | null = null
  if (senderId === proposerId) recipientId = receiverId
  else if (senderId === receiverId) recipientId = proposerId
  else {
    console.error('[notify-on-event] shipper not participant of trade', {
      trade_id: tradeId,
      shipper: senderId,
    })
    return jsonResponse(200, { ok: true, skipped: 'SHIPPER_NOT_PARTICIPANT' })
  }
  if (recipientId === senderId) {
    return jsonResponse(200, { ok: true, skipped: 'SELF_NOTIFY' })
  }

  const sendPushPayload: SendPushPayload = {
    user_id: recipientId,
    title: '相手が発送しました',
    body: '相手が商品を発送しました。取引の画面を確認しましょう',
    data: {
      type: 'shipment_shipped',
      route: offerId != null ? `/trade/${offerId}` : '/trades',
      trade_id: tradeId,
    },
  }
  return await invokeSendPush(sendPushPayload, 'shipments:shipped')
}

// ─────────────────────────────────────────
// (I) venue_trades INSERT ハンドラ (会場 Hold 承認 = 取引成立)
//   accept_venue_hold が venue_trades を INSERT する。前監査 S1 の成立通知欠落を解消。
//   通知先: 申請者 (proposer_id)。承認したのは receiver 側なので proposer に届ける。
//   route: '/venue/trade/<trade_id>'
// ─────────────────────────────────────────
async function handleVenueTradeInsert(recordRaw: unknown): Promise<Response> {
  if (recordRaw == null || typeof recordRaw !== 'object') {
    return jsonResponse(200, { ok: true, skipped: 'NO_RECORD' })
  }
  const record = recordRaw as VenueTradeRecord
  const tradeId = typeof record.id === 'string' ? record.id : null
  const proposerId =
    typeof record.proposer_id === 'string' ? record.proposer_id : null
  if (tradeId == null || proposerId == null) {
    return jsonResponse(200, { ok: true, skipped: 'MISSING_FIELDS' })
  }

  const sendPushPayload: SendPushPayload = {
    user_id: proposerId,
    title: '交換が成立しました',
    body: 'あなたのHoldが承認され、会場交換が成立しました',
    data: {
      type: 'venue_trade_created',
      route: `/venue/trade/${tradeId}`,
      venue_trade_id: tradeId,
    },
  }
  return await invokeSendPush(sendPushPayload, 'venue_trades:insert')
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
