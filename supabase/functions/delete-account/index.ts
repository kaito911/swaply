// supabase/functions/delete-account/index.ts
//
// Phase 0 PR-D: アカウント削除 Edge Function
//
// 動作:
//   1. JWT 認証検証 (Authorization ヘッダから user_id 抽出)
//   2. RPC `delete_my_account()` 呼び出し (個人情報削除 + プロフィール匿名化、
//      active trade 判定はここで実施)
//   3. service_role で auth.admin.deleteUser(user.id) を実行
//
// レスポンス:
//   200 { ok: true }                                          — 削除完了
//   400 { error: 'ACTIVE_TRADE_EXISTS', count: N }            — 進行中取引あり
//   401 { error: 'AUTH_REQUIRED' }                            — 未認証
//   500 { error: 'AUTH_DELETE_FAILED', message: ... }         — RPC 成功後の auth 削除失敗
//                                                              (RPC は冪等のため再 invoke で完了可能)
//   500 { error: 'INTERNAL_ERROR' }                           — その他想定外
//
// デプロイ手順:
//   1. supabase login
//   2. supabase link --project-ref <project-ref>
//   3. supabase functions deploy delete-account
//
// 環境変数 (Supabase が自動設定):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // CORS preflight (アプリは同一 Supabase project からの fetch のみ想定だが念のため)
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' })
  }

  const authHeader = req.headers.get('Authorization')
  if (authHeader == null || authHeader === '') {
    return jsonResponse(401, { error: 'AUTH_REQUIRED' })
  }

  // user-scoped client: 呼び出し元 JWT 検証 + RPC 呼び出し用
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  // 認証ユーザー取得
  const { data: userData, error: userError } = await supabaseUser.auth.getUser()
  if (userError != null || userData.user == null) {
    return jsonResponse(401, { error: 'AUTH_REQUIRED' })
  }
  const userId = userData.user.id

  // ─────────────────────────────────────────
  // Step A: RPC 呼び出し (匿名化 + 個人情報削除をアトミック実行)
  // ─────────────────────────────────────────
  const { error: rpcError } = await supabaseUser.rpc('delete_my_account')

  if (rpcError != null) {
    const message = rpcError.message ?? ''

    if (message.startsWith('ACTIVE_TRADE_EXISTS')) {
      // 'ACTIVE_TRADE_EXISTS:3' のような形式 (RPC の raise exception で : 区切り)
      const colonIdx = message.indexOf(':')
      const count =
        colonIdx >= 0 ? parseInt(message.slice(colonIdx + 1).trim(), 10) : 0
      return jsonResponse(400, {
        error: 'ACTIVE_TRADE_EXISTS',
        count: Number.isFinite(count) ? count : 0,
      })
    }

    if (message.includes('AUTH_REQUIRED')) {
      return jsonResponse(401, { error: 'AUTH_REQUIRED' })
    }

    console.error('[delete-account] rpc error', rpcError)
    return jsonResponse(500, { error: 'INTERNAL_ERROR' })
  }

  // ─────────────────────────────────────────
  // Step B: auth.users 削除 (service_role 経由)
  //   RPC は成功済 (匿名化完了)。ここで失敗してもユーザー側は再 invoke で完了可能。
  // ─────────────────────────────────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { error: deleteAuthError } =
    await supabaseAdmin.auth.admin.deleteUser(userId)

  if (deleteAuthError != null) {
    console.error('[delete-account] auth deleteUser failed', deleteAuthError)
    // RPC は成功し profiles は匿名化済。再 invoke で auth.users 削除のみリトライ可能。
    return jsonResponse(500, {
      error: 'AUTH_DELETE_FAILED',
      message:
        'プロフィールは匿名化されました。時間をおいてもう一度お試しください。',
    })
  }

  return jsonResponse(200, { ok: true })
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
