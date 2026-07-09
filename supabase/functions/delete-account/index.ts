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

  // service_role クライアント: storage 実ファイル削除 (Step A2) と auth 削除 (Step B) で共用。
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // ─────────────────────────────────────────
  // Step A2: Storage 実ファイル削除 (best-effort・abort しない)
  //   RPC は DB の image_url を null 化するが Storage オブジェクト実体は残るため、
  //   ここで card-images/${userId}/** と avatars/${userId}.jpg を物理削除する。
  //   ★列挙はパスベースなので RPC の image_url null 化後でも独立に実行可能。
  //   ★失敗しても Step B (auth 削除) を必ず実行する (アカウント消滅を優先)。
  //     残存パスは console.error に出し、後日 GC で回収する (backlog: 恒久 GC)。
  //   ★冪等: 削除済みファイルの再 remove は無害 → AUTH_DELETE_FAILED 再 invoke でも安全。
  // ─────────────────────────────────────────
  try {
    const cardImagePaths = await listAllStorageFiles(
      supabaseAdmin,
      'card-images',
      userId,
    )
    if (cardImagePaths.length > 0) {
      const { error } = await supabaseAdmin.storage
        .from('card-images')
        .remove(cardImagePaths)
      if (error != null) {
        console.error('[delete-account] card-images remove failed', {
          userId,
          paths: cardImagePaths,
          error,
        })
      }
    }
  } catch (err) {
    console.error('[delete-account] card-images cleanup threw', { userId, err })
  }

  try {
    // avatars は単一ファイル固定パス (app/profile-edit.tsx: `${userId}.jpg`)。
    const { error } = await supabaseAdmin.storage
      .from('avatars')
      .remove([`${userId}.jpg`])
    if (error != null) {
      console.error('[delete-account] avatar remove failed', { userId, error })
    }
  } catch (err) {
    console.error('[delete-account] avatar cleanup threw', { userId, err })
  }

  // ─────────────────────────────────────────
  // Step B: auth.users 削除 (service_role 経由)
  //   RPC は成功済 (匿名化完了)。ここで失敗してもユーザー側は再 invoke で完了可能。
  // ─────────────────────────────────────────
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

// ─────────────────────────────────────────
// Storage 再帰列挙 (汎用 (b) 方式)
//   Supabase Storage の .list(prefix) は「即時の子」のみ返す (非再帰)。
//   file と folder は entry.id で判別できる: 実ファイルは id!=null、
//   フォルダ (プレフィックス) は id==null で返るため、それを検出したら再帰する。
//   これにより card-images/${userId}/venue-supply · venue-hold · wants 等の
//   サブフォルダ配下も含め、全実ファイルの完全パスを収集する。
//   将来サブフォルダが増えても自動追従する (既知フォルダのハードコード不要)。
//
//   戻り値: bucket ルートからの相対パス配列 (.remove() にそのまま渡せる形)。
// ─────────────────────────────────────────
async function listAllStorageFiles(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  })
  if (error != null) {
    console.error('[delete-account] storage list failed', { bucket, prefix, error })
    return []
  }
  if (data == null || data.length === 0) return []

  const paths: string[] = []
  for (const entry of data) {
    const childPath = `${prefix}/${entry.name}`
    // id==null = フォルダ (プレフィックス) → 再帰。id!=null = 実ファイル → 収集。
    if (entry.id == null) {
      const nested = await listAllStorageFiles(admin, bucket, childPath)
      paths.push(...nested)
    } else {
      paths.push(childPath)
    }
  }
  return paths
}
