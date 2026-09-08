// supabase/functions/detect-bbox/index.ts
//
// 一括出品カードの「写真上の物体外接矩形」を Vision API で検出し、
// cards.bbox_left / bbox_top / bbox_w / bbox_h に書き戻す Edge Function。
//
// ─────────────────────────────────────────
// ★座標規約 (single source of truth の一方。listing/[id].tsx にも同一規約を明記すること)
//
//   bbox 系 6 列はすべて「元画像基準・レターボックス除外・0〜1 の割合」。
//   原点 = 元画像の左上。右が x+、下が y+。
//
//     bbox_x / bbox_y      = ユーザーがタップした点。★このFunctionは絶対に上書きしない
//     bbox_left / bbox_top = 検出された矩形の左上
//     bbox_w / bbox_h      = 検出された矩形の幅・高さ
//
//   往路 (Vision へ渡す px):   px_x = bbox_x × W,  px_y = bbox_y × H
//   復路 (DB へ保存する割合):  left = left_px ÷ W,  top = top_px ÷ H,
//                              w = w_px ÷ W,        h = h_px ÷ H
//     W / H = 元画像のピクセル幅・高さ。★Vision の応答ではなく、
//             fetch した画像バイト (JPEG ヘッダ) から取得する (下記 parseJpeg)。
//   ★px か割合か / 原点はどこか で将来事故らないよう、この規約を必ず参照すること。
// ─────────────────────────────────────────
//
// 2 モード:
//   a. mode='single'   … 出品直後にアプリが fire-and-forget で呼ぶ。
//                         シークレット不要。JWT の uid と card.owner_user_id を照合し、
//                         本人のカードだけを処理する (他人のカードは黙ってスキップ)。
//   b. mode='backfill' … 取りこぼし回収 + 既存カードの遡及適用 (管理実行)。
//                         ★x-detect-bbox-secret 必須。bbox_x あり・bbox_w なしを
//                         画像単位でまとめて処理する。
//
// 認証/保護方式:
//   - single:   シークレットを使わない (バンドルに秘密を持たせない)。JWT 由来 uid 照合。
//   - backfill: x-detect-bbox-secret を timing-safe に照合。★認証通過前に副作用ゼロ。
//   - ★DETECT_BBOX_SECRET は send-push 等の既存シークレットを流用せず新規発行 (監査:高)。
//   - ★本 Function は他の Edge Function から呼び出さない (呼出経路を増やさない)。
//
// デプロイ手順 (★本タスクではデプロイしない):
//   1. supabase login
//   2. supabase link --project-ref <project-ref>
//   3. supabase secrets set DETECT_BBOX_SECRET=<新規の長いランダム文字列>
//   4. supabase secrets set VISION_API_KEY=<Vision API キー>   (K が設定)
//   5. npx supabase functions deploy detect-bbox --no-verify-jwt --project-ref <project-ref>
//   ★--no-verify-jwt 必須: backfill は Authorization を持たない呼び出しを受けるため
//     (認証は本体内で自前実施)。single は Authorization を読むが検証も本体で行う。
//
// 環境変数:
//   - SUPABASE_URL                (自動)
//   - SUPABASE_ANON_KEY           (自動、single の JWT 検証用 user-scoped client)
//   - SUPABASE_SERVICE_ROLE_KEY   (自動、SELECT/UPDATE 用)
//   - DETECT_BBOX_SECRET          (手動、backfill 専用・新規発行)
//   - VISION_API_KEY              (手動、★API キーのみ。エンドポイントは env で上書き不可)

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { timingSafeEqual } from 'jsr:@std/crypto/timing-safe-equal'
import { encodeBase64 } from 'jsr:@std/encoding/base64'

// ─────────────────────────────────────────
// 定数
// ─────────────────────────────────────────

const TAG = '[detect-bbox]'

// ★Vision API のエンドポイントはコードに固定。env で上書きさせない (監査:中)。
//   env に置くのは API キーのみ。設定ミス/経路侵害で任意 URL に資格情報を送らせない。
const VISION_API_URL = 'https://api.anthropic.com/v1/messages'
// ★位置特定 (指定点の外接矩形) は高度な推論を要さないため Sonnet で十分。
//   バージョン接尾辞は付けない。精度が出なければ 'claude-opus-5' 等に変更する。
const VISION_MODEL = 'claude-sonnet-5'
const ANTHROPIC_VERSION = '2023-06-01'

// single: 1 リクエストで受け付ける cards 上限 (一括出品の上限 12 点に合わせる)。
const MAX_SINGLE_CARDS = 12
// body 全体のサイズ上限 (12 点 × 小さな JSON で十分収まる。DoS/巨大 body を弾く)。
const MAX_BODY_BYTES = 65536
// backfill: 1 実行で処理する画像枚数の上限 (Vision 請求の暴走抑止)。超過は打ち切り。
const MAX_BACKFILL_IMAGES = 20

// 外部 fetch のタイムアウト (★AbortController で明示中断。タイムアウト=失敗=null 据え置き)。
//   画像取得: Storage は同一プロジェクト、10s あれば十分。
//   Vision:   画像 1 枚の推論。余裕を持って 60s。
const IMAGE_FETCH_TIMEOUT_MS = 10000
const VISION_TIMEOUT_MS = 60000

// Vision 応答検証のしきい値。
const VALIDATION_EPS = 0.005 // はみ出し判定の微小許容 (丸め誤差)
const AREA_MAX = 0.9 // 矩形面積が画像の 9 割以上 → 全体被覆とみなし reject

// SSRF 検証: 許可するパスの接頭辞 (★card-images のみ。seed-card-images/avatars/外部URLは弾く)。
const STORAGE_PUBLIC_PREFIX = '/storage/v1/object/public/card-images/'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DETECT_BBOX_SECRET = Deno.env.get('DETECT_BBOX_SECRET')
const VISION_API_KEY = Deno.env.get('VISION_API_KEY')

// ─────────────────────────────────────────
// 型
// ─────────────────────────────────────────

type TapPoint = { id: string; bbox_x: number; bbox_y: number }

// DB から取得するカード行 (処理に必要な列のみ)
type CardRow = {
  id: string
  owner_user_id: string
  image_url: string | null
  bbox_x: number | null
  bbox_y: number | null
  bbox_w: number | null
}

// Vision から受け取る矩形 (px、原点=左上)
type BoxPx = { left: number; top: number; width: number; height: number }

// 割合に変換後の矩形
type BoxFrac = { left: number; top: number; w: number; h: number }

// ★Anthropic Messages API が受け付ける画像 media_type (= 対応形式)。HEIC 等は対象外。
type AllowedMedia = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

// skippedUnsupported = 非対応 Content-Type (HEIC 等) でスキップした件数 (skipped の内数)。
type ProcessResult = {
  updated: number
  skipped: number
  skippedUnsupported: number
}

// ─────────────────────────────────────────
// entrypoint
// ─────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'authorization, content-type, x-detect-bbox-secret',
      },
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' })
  }

  // ── body サイズ上限 (要件4)。Content-Length があれば先に弾き、無くても実読で弾く。
  const contentLength = req.headers.get('content-length')
  if (contentLength != null && Number(contentLength) > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'PAYLOAD_TOO_LARGE' })
  }
  let raw: string
  try {
    raw = await req.text()
  } catch {
    return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'READ_FAILED' })
  }
  if (byteLength(raw) > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'PAYLOAD_TOO_LARGE' })
  }

  // ── JSON parse
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'NOT_JSON' })
  }

  // ★ルートが object であることを検証 (要件4: null/配列/primitive で未処理例外 500 を防ぐ)。
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'NOT_OBJECT' })
  }
  const payload = parsed as Record<string, unknown>

  const mode = payload.mode
  if (mode === 'single') {
    return await handleSingle(req, payload)
  }
  if (mode === 'backfill') {
    return await handleBackfill(req, payload)
  }
  return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'UNKNOWN_MODE' })
})

// ─────────────────────────────────────────
// mode='single' — クライアント経路 (シークレット不要 / JWT uid 照合)
// ─────────────────────────────────────────

async function handleSingle(
  req: Request,
  payload: Record<string, unknown>,
): Promise<Response> {
  // 1. cards 検証 (件数上限 = 要件4)
  const cardsRaw = payload.cards
  if (!Array.isArray(cardsRaw)) {
    return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'CARDS_NOT_ARRAY' })
  }
  if (cardsRaw.length === 0) {
    return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'CARDS_EMPTY' })
  }
  if (cardsRaw.length > MAX_SINGLE_CARDS) {
    return jsonResponse(400, {
      error: 'INVALID_PAYLOAD',
      reason: 'TOO_MANY_CARDS',
      max: MAX_SINGLE_CARDS,
    })
  }
  const ids: string[] = []
  for (const c of cardsRaw) {
    if (c == null || typeof c !== 'object') {
      return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'CARD_NOT_OBJECT' })
    }
    const id = (c as Record<string, unknown>).id
    if (typeof id !== 'string' || id === '') {
      return jsonResponse(400, { error: 'INVALID_PAYLOAD', reason: 'CARD_ID_INVALID' })
    }
    ids.push(id)
  }

  // 2. ★認証: JWT から uid を取得。副作用はこの後にのみ走る。
  //    Authorization ヘッダから user-scoped client を作り getUser で検証する。
  const authHeader = req.headers.get('Authorization')
  if (authHeader == null || authHeader === '') {
    // 秘密は使わない設計。JWT 無しは処理せずスキップ (エラーにしない = 方針どおり)。
    return jsonResponse(200, { ok: true, skipped: ids.length, reason: 'NO_AUTH' })
  }
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser()
  if (userErr != null || userData.user == null) {
    return jsonResponse(200, { ok: true, skipped: ids.length, reason: 'NO_AUTH' })
  }
  const uid = userData.user.id

  // 3. service_role で対象行を取得。★client の bbox_x/y・image_url は信用せず DB 値を使う。
  //    owner 照合 + 未処理 (bbox_w IS NULL) でフィルタ。
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data: rows, error: selErr } = await admin
    .from('cards')
    .select('id, owner_user_id, image_url, bbox_x, bbox_y, bbox_w')
    .in('id', ids)
  if (selErr != null) {
    console.error(TAG, 'single select failed', selErr)
    return jsonResponse(500, { error: 'INTERNAL_ERROR' })
  }

  const owned = (rows ?? []).filter(
    (r: CardRow) =>
      r.owner_user_id === uid && // ★他人のカードは処理しない (黙ってスキップ)
      r.bbox_w == null && // 既処理は上書きしない
      r.bbox_x != null &&
      r.bbox_y != null &&
      r.image_url != null,
  ) as CardRow[]

  const skippedNotOwnedOrDone = ids.length - owned.length

  const groups = groupByImage(owned)
  let updated = 0
  let skipped = skippedNotOwnedOrDone
  let skippedUnsupported = 0
  for (const [imageUrl, points] of groups) {
    const res = await processImage(admin, imageUrl, points)
    updated += res.updated
    skipped += res.skipped
    skippedUnsupported += res.skippedUnsupported
  }

  console.log(
    TAG,
    'single summary',
    JSON.stringify({ requested: ids.length, updated, skipped, skippedUnsupported }),
  )
  return jsonResponse(200, {
    ok: true,
    updated,
    skipped,
    skipped_unsupported: skippedUnsupported,
  })
}

// ─────────────────────────────────────────
// mode='backfill' — 管理経路 (★シークレット必須 / 認証前に副作用ゼロ)
// ─────────────────────────────────────────

async function handleBackfill(
  req: Request,
  payload: Record<string, unknown>,
): Promise<Response> {
  // 1. ★シークレット検証を最優先。通過するまで DB/fetch/Vision に一切触れない。
  //    未設定は事故防止で一律 401 (deploy ミスで誰でも叩ける状態を作らない)。
  if (DETECT_BBOX_SECRET == null || DETECT_BBOX_SECRET === '') {
    console.error(TAG, 'DETECT_BBOX_SECRET is not set')
    return jsonResponse(401, { error: 'UNAUTHORIZED' })
  }
  const provided = req.headers.get('x-detect-bbox-secret')
  if (provided == null || provided === '') {
    return jsonResponse(401, { error: 'UNAUTHORIZED' })
  }
  // ★timing-safe 比較。長さ差の情報も漏らさないよう SHA-256 ダイジェスト (固定長) 同士で比較。
  const ok = await secretsMatch(provided, DETECT_BBOX_SECRET)
  if (!ok) {
    return jsonResponse(401, { error: 'UNAUTHORIZED' })
  }

  // 2. limit の解釈 (1..MAX_BACKFILL_IMAGES にクランプ、既定は MAX)。
  const limitRaw = payload.limit
  let imageLimit = MAX_BACKFILL_IMAGES
  if (typeof limitRaw === 'number' && Number.isFinite(limitRaw)) {
    imageLimit = Math.max(1, Math.min(MAX_BACKFILL_IMAGES, Math.floor(limitRaw)))
  }

  // 3. 未処理行を取得 (bbox_x あり・bbox_w なし)。行数はほどほどに上限を掛けて取得し、
  //    画像単位にグループ化してから imageLimit 枚に打ち切る。
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const rowFetchCap = MAX_BACKFILL_IMAGES * MAX_SINGLE_CARDS
  const { data: rows, error: selErr } = await admin
    .from('cards')
    .select('id, owner_user_id, image_url, bbox_x, bbox_y, bbox_w')
    .not('bbox_x', 'is', null)
    .is('bbox_w', null)
    .order('image_url', { ascending: true })
    .limit(rowFetchCap)
  if (selErr != null) {
    console.error(TAG, 'backfill select failed', selErr)
    return jsonResponse(500, { error: 'INTERNAL_ERROR' })
  }

  const usable = (rows ?? []).filter(
    (r: CardRow) => r.bbox_x != null && r.bbox_y != null && r.image_url != null,
  ) as CardRow[]

  const allGroups = groupByImage(usable)
  const totalImages = allGroups.size
  const groups = Array.from(allGroups.entries()).slice(0, imageLimit)

  // 4. 画像単位で逐次処理 (画像 9 枚規模なら逐次で十分)。
  let updated = 0
  let skipped = 0
  let skippedUnsupported = 0
  let processedImages = 0
  for (const [imageUrl, points] of groups) {
    const res = await processImage(admin, imageUrl, points)
    updated += res.updated
    skipped += res.skipped
    skippedUnsupported += res.skippedUnsupported
    processedImages += 1
  }

  const remaining = Math.max(0, totalImages - processedImages)
  console.log(
    TAG,
    'backfill summary',
    JSON.stringify({
      totalImages,
      processedImages,
      updated,
      skipped,
      skippedUnsupported,
      remaining,
    }),
  )
  return jsonResponse(200, {
    ok: true,
    processed_images: processedImages,
    updated,
    skipped,
    skipped_unsupported: skippedUnsupported,
    remaining,
    done: remaining === 0,
  })
}

// ─────────────────────────────────────────
// 画像 1 枚 + その点群を処理する共通ルーチン
//   失敗・検証NG は該当 card を「4 列 null のまま」据え置く (何も壊さない)。
// ─────────────────────────────────────────

async function processImage(
  // deno-lint-ignore no-explicit-any
  admin: any,
  imageUrl: string,
  points: TapPoint[],
): Promise<ProcessResult> {
  const shortPath = safeShortPath(imageUrl)

  // a. ★SSRF 検証: 自プロジェクトドメイン + /card-images/ パスのみ許可。
  if (!isAllowedImageUrl(imageUrl)) {
    console.warn(TAG, 'skip: image_url not allowed', shortPath)
    return { updated: 0, skipped: points.length, skippedUnsupported: 0 }
  }

  // b. 画像取得 (タイムアウト付き)。
  //    ★画像全体を取得する (Range ヘッダ無しの GET + arrayBuffer())。
  //      Vision には全体を base64 で渡すため部分取得はしない。
  //      よってマジックバイト判定 (先頭 12B) / PNG IHDR (先頭 24B) は常に充足する。
  let bytes: Uint8Array
  try {
    const resp = await fetchWithTimeout(
      imageUrl,
      { method: 'GET' },
      IMAGE_FETCH_TIMEOUT_MS,
    )
    if (!resp.ok) {
      console.warn(TAG, 'skip: image fetch non-OK', resp.status, shortPath)
      return { updated: 0, skipped: points.length, skippedUnsupported: 0 }
    }
    bytes = new Uint8Array(await resp.arrayBuffer())
  } catch (err) {
    // AbortError (タイムアウト) 含む → 失敗扱い、据え置き。
    console.warn(TAG, 'skip: image fetch threw/timeout', shortPath, String(err))
    return { updated: 0, skipped: points.length, skippedUnsupported: 0 }
  }

  // ★形式判定は Content-Type でも拡張子でもなく「実体のマジックバイト」で行う。
  //   本番の Supabase Storage は拡張子に関係なく Content-Type: image/jpeg を返すため
  //   Content-Type 判定は機能しない (PNG/HEIC も image/jpeg と申告される)。
  const format = detectImageFormat(bytes)
  const media = formatToMedia(format)

  // ★非対応形式 (HEIC / GIF/WebP 未対応時 / unknown) は処理せずスキップ。
  //   エラーにせず 4 列 null 据え置き。件数を skippedUnsupported に加算し可視化する。
  //   HEIC 対応 (アップロード時 JPEG 変換) は別課題。この Function では扱わない。
  if (media == null) {
    console.warn(TAG, `skip: unsupported format (${format})`, shortPath)
    return {
      updated: 0,
      skipped: points.length,
      skippedUnsupported: points.length,
    }
  }

  // c. 元画像 px を画像バイトから取得 (③)。EXIF orientation は JPEG のみ (他は 1)。
  const dims = readImageDimensions(bytes, media)
  if (dims == null || dims.displayW <= 0 || dims.displayH <= 0) {
    // 形式は判定できたがヘッダが壊れている等 (非対応とは区別する)。
    console.warn(TAG, `skip: cannot read dimensions (${format})`, shortPath)
    return { updated: 0, skipped: points.length, skippedUnsupported: 0 }
  }
  const { displayW: W, displayH: H, rawW, rawH, orientation } = dims
  // ★段階2 の EXIF 検証を支援するログ (見た目と食い違わないか確認できるよう必ず残す)。
  console.log(
    TAG,
    'image dims',
    JSON.stringify({ shortPath, rawW, rawH, orientation, displayW: W, displayH: H }),
  )

  // d. 往路: 各点を display 基準 px へ。
  const promptPoints = points.map((p) => ({
    id: p.id,
    px_x: Math.round(p.bbox_x * W),
    px_y: Math.round(p.bbox_y * H),
  }))

  // e. Vision 呼び出し (タイムアウト付き)。失敗時は全点据え置き。
  let boxesById: Map<string, BoxPx | null>
  try {
    boxesById = await callVision(bytes, W, H, promptPoints, media)
  } catch (err) {
    console.warn(TAG, 'skip: vision call failed/timeout', shortPath, String(err))
    return { updated: 0, skipped: points.length, skippedUnsupported: 0 }
  }

  // f/g/h. 点ごとに 復路変換 → 検証 → UPDATE。
  let updated = 0
  let skipped = 0
  for (const p of points) {
    const boxPx = boxesById.get(p.id) ?? null
    if (boxPx == null) {
      skipped += 1
      continue
    }
    const frac = toFraction(boxPx, W, H)
    if (!validateBox(frac, p.bbox_x, p.bbox_y)) {
      skipped += 1
      continue
    }
    // ★UPDATE は 4 列のみ。WHERE に bbox_w IS NULL を含め既値を上書きしない。
    //   bbox_x / bbox_y / image_url / その他は SET に含めない。
    const { error: updErr, count } = await admin
      .from('cards')
      .update(
        {
          bbox_left: frac.left,
          bbox_top: frac.top,
          bbox_w: frac.w,
          bbox_h: frac.h,
        },
        { count: 'exact' },
      )
      .eq('id', p.id)
      .is('bbox_w', null)
    if (updErr != null) {
      console.error(TAG, 'update failed', p.id, updErr)
      skipped += 1
      continue
    }
    if ((count ?? 0) > 0) updated += 1
    else skipped += 1 // 競合等で 0 行 → 据え置き扱い
  }

  return { updated, skipped, skippedUnsupported: 0 }
}

// ─────────────────────────────────────────
// Vision API 呼び出し (Anthropic Messages)
//   画像 1 枚 + 全点をまとめて 1 回。応答は JSON のみを要求しパースする。
// ─────────────────────────────────────────

async function callVision(
  bytes: Uint8Array,
  W: number,
  H: number,
  points: { id: string; px_x: number; px_y: number }[],
  mediaType: AllowedMedia,
): Promise<Map<string, BoxPx | null>> {
  if (VISION_API_KEY == null || VISION_API_KEY === '') {
    throw new Error('VISION_API_KEY not set')
  }
  const b64 = encodeBase64(bytes)

  const pointLines = points
    .map((p) => `  - id "${p.id}": (${p.px_x}, ${p.px_y})`)
    .join('\n')

  const prompt =
    `あなたは物体検出器です。画像サイズは 幅 ${W}px・高さ ${H}px。` +
    `座標は左上が原点、右が x+、下が y+ です。\n` +
    `以下の各点は、それぞれ 1 つの物理的なグッズ（トレカ/缶バッジ/ぬいぐるみ 等）の上にあります:\n` +
    `${pointLines}\n\n` +
    `各点について、その点が乗っている「単一のグッズ全体」を過不足なく囲む軸並行の外接矩形を返してください。\n` +
    `・トレカ(四角)も缶バッジ(丸)もぬいぐるみ(不定形)も、形に関わらず「その物体全体の軸並行バウンディングボックス」を返す。\n` +
    `・隣接する別のグッズを含めない。指定された点が属する 1 個だけ。\n` +
    `・矩形は必ず指定された点を内側に含むこと。\n` +
    `・確信が持てない点は box を null にする。\n` +
    `・座標はすべて上記 px（整数）で返す。\n\n` +
    `出力は次の JSON のみ。マークダウンや説明文を書かない:\n` +
    `{"results":[{"id":"<id>","box":{"left":<px>,"top":<px>,"width":<px>,"height":<px>}}]}`

  const body = {
    model: VISION_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            // ★source.media_type は fetch 時の Content-Type から決定 (拡張子ではない)。
            source: { type: 'base64', media_type: mediaType, data: b64 },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  }

  const resp = await fetchWithTimeout(
    VISION_API_URL,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': VISION_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    },
    VISION_TIMEOUT_MS,
  )

  if (!resp.ok) {
    const t = await safeReadText(resp)
    throw new Error(`vision non-OK ${resp.status} ${t.slice(0, 200)}`)
  }

  const json = (await resp.json()) as {
    content?: { type?: string; text?: string }[]
  }
  const textBlock = (json.content ?? []).find((c) => c.type === 'text')
  const text = textBlock?.text ?? ''
  const parsed = parseVisionJson(text)

  const map = new Map<string, BoxPx | null>()
  for (const r of parsed) {
    map.set(r.id, r.box)
  }
  return map
}

// Vision のテキスト応答から JSON を取り出す (```json フェンスが混ざっても除去)。
function parseVisionJson(text: string): { id: string; box: BoxPx | null }[] {
  let s = text.trim()
  // ```json ... ``` / ``` ... ``` を剥がす
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence != null) s = fence[1].trim()
  // 最初の { から最後の } までを抜き出す (前後の余談を許容)
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)

  let obj: unknown
  try {
    obj = JSON.parse(s)
  } catch {
    return [] // パース不能 → 全点据え置き
  }
  if (obj == null || typeof obj !== 'object') return []
  const results = (obj as Record<string, unknown>).results
  if (!Array.isArray(results)) return []

  const out: { id: string; box: BoxPx | null }[] = []
  for (const r of results) {
    if (r == null || typeof r !== 'object') continue
    const id = (r as Record<string, unknown>).id
    if (typeof id !== 'string') continue
    const box = (r as Record<string, unknown>).box
    if (box == null || typeof box !== 'object') {
      out.push({ id, box: null })
      continue
    }
    const b = box as Record<string, unknown>
    if (
      typeof b.left === 'number' &&
      typeof b.top === 'number' &&
      typeof b.width === 'number' &&
      typeof b.height === 'number'
    ) {
      out.push({
        id,
        box: { left: b.left, top: b.top, width: b.width, height: b.height },
      })
    } else {
      out.push({ id, box: null })
    }
  }
  return out
}

// ─────────────────────────────────────────
// 座標変換・検証
// ─────────────────────────────────────────

// 復路: px → 割合 (display 基準 W/H で割る)
function toFraction(box: BoxPx, W: number, H: number): BoxFrac {
  return {
    left: box.left / W,
    top: box.top / H,
    w: box.width / W,
    h: box.height / H,
  }
}

// ★Vision 応答検証 5 項目。1 つでも落ちたら reject (4 列 null 据え置き)。
function validateBox(f: BoxFrac, bbox_x: number, bbox_y: number): boolean {
  // ① すべて 0〜1
  if (
    f.left < 0 || f.left > 1 ||
    f.top < 0 || f.top > 1 ||
    f.w < 0 || f.w > 1 ||
    f.h < 0 || f.h > 1
  ) {
    return false
  }
  // ② w/h が正
  if (f.w <= 0 || f.h <= 0) return false
  // ③ はみ出し無し (微小許容)
  if (f.left + f.w > 1 + VALIDATION_EPS) return false
  if (f.top + f.h > 1 + VALIDATION_EPS) return false
  // ④ ★点包含 (最強の検証): タップ点が矩形の内側にあるか
  if (bbox_x < f.left || bbox_x > f.left + f.w) return false
  if (bbox_y < f.top || bbox_y > f.top + f.h) return false
  // ⑤ 全体被覆でない
  if (f.w * f.h >= AREA_MAX) return false
  return true
}

// ─────────────────────────────────────────
// 対応形式判定・寸法取得 (依存追加なし)
// ─────────────────────────────────────────

// 実体形式 (マジックバイトで判定した結果)。
type ImageFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | 'unknown'

// ★ファイル先頭のマジックバイトで実体形式を判定する (Content-Type/拡張子は信用しない)。
//   本番 Storage は全ファイルに Content-Type: image/jpeg を返すため Content-Type 判定は不可。
//   マジックバイト定義:
//     JPEG : FF D8 FF                                    (b[0..2])
//     PNG  : 89 50 4E 47 0D 0A 1A 0A                      (b[0..7])
//     GIF  : 47 49 46 38  ('GIF8'、87a/89a 共通)          (b[0..3])
//     WebP : 52 49 46 46 ('RIFF') … 57 45 42 50 ('WEBP')  (b[0..3] & b[8..11])
//     HEIC : b[4..7] = 66 74 79 70 ('ftyp')               (ISO-BMFF、heic/heix/hevc/mif1 等を包含)
//   判定順は個別シグネチャを先に、ftyp (HEIC 系) を後に置く (位置が異なり衝突しない)。
function detectImageFormat(b: Uint8Array): ImageFormat {
  if (b.length < 12) return 'unknown'
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return 'png'
  }
  // GIF: 'GIF8'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return 'gif'
  }
  // WebP: 'RIFF' .... 'WEBP'
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'webp'
  }
  // HEIC/HEIF 系: b[4..7] = 'ftyp' (ISO base media file format)。
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return 'heic'
  }
  return 'unknown'
}

// 実体形式 → Anthropic media_type。対応外 (heic / unknown) は null (=スキップ)。
function formatToMedia(format: ImageFormat): AllowedMedia | null {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    default:
      return null // heic / unknown
  }
}

// media 種別に応じて寸法を取得。EXIF orientation は JPEG のみ扱う (他は 1 = display=raw)。
function readImageDimensions(
  bytes: Uint8Array,
  media: AllowedMedia,
): JpegDims | null {
  if (media === 'image/jpeg') return parseJpeg(bytes)

  let wh: { w: number; h: number } | null = null
  if (media === 'image/png') wh = parsePng(bytes)
  else if (media === 'image/gif') wh = parseGif(bytes)
  else if (media === 'image/webp') wh = parseWebp(bytes)

  if (wh == null || wh.w <= 0 || wh.h <= 0) return null
  return {
    rawW: wh.w,
    rawH: wh.h,
    orientation: 1,
    displayW: wh.w,
    displayH: wh.h,
  }
}

// PNG: シグネチャ(8) + IHDR(len4+type4) → width(4 BE)@16, height(4 BE)@20。
function parsePng(b: Uint8Array): { w: number; h: number } | null {
  try {
    if (b.length < 24) return null
    if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) {
      return null
    }
    const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0
    const h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0
    return { w, h }
  } catch {
    return null
  }
}

// GIF: 'GIF87a'/'GIF89a' + logical screen descriptor width(2 LE)@6, height(2 LE)@8。
function parseGif(b: Uint8Array): { w: number; h: number } | null {
  try {
    if (b.length < 10) return null
    if (b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null // 'GIF'
    const w = b[6] | (b[7] << 8)
    const h = b[8] | (b[9] << 8)
    return { w, h }
  } catch {
    return null
  }
}

// WebP (RIFF....WEBP): VP8 (lossy) / VP8L (lossless) / VP8X (extended) の 3 形式。
function parseWebp(b: Uint8Array): { w: number; h: number } | null {
  try {
    if (b.length < 30) return null
    // 'RIFF' @0, 'WEBP' @8
    if (
      b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46 ||
      b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50
    ) {
      return null
    }
    // chunk fourCC @12
    const c0 = b[12], c1 = b[13], c2 = b[14], c3 = b[15]
    const is = (s: string) =>
      c0 === s.charCodeAt(0) && c1 === s.charCodeAt(1) &&
      c2 === s.charCodeAt(2) && c3 === s.charCodeAt(3)

    if (is('VP8 ')) {
      // lossy: key frame の start code 0x9d 0x01 0x2a @23-25、以降 width/height(14bit LE)。
      const w = ((b[27] << 8) | b[26]) & 0x3fff
      const h = ((b[29] << 8) | b[28]) & 0x3fff
      return { w, h }
    }
    if (is('VP8L')) {
      // lossless: signature 0x2f @20、続く 4 バイトに 14bit-1 の width/height。
      const b1 = b[21], b2 = b[22], b3 = b[23], b4 = b[24]
      const w = 1 + (((b2 & 0x3f) << 8) | b1)
      const h = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
      return { w, h }
    }
    if (is('VP8X')) {
      // extended: canvas width-1 (3 byte LE) @24、height-1 (3 byte LE) @27。
      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
      return { w, h }
    }
    return null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────
// JPEG 寸法 + EXIF orientation パース (依存追加なし)
//   rawW/rawH = SOF が持つ格納ピクセル。orientation = EXIF (無ければ 1)。
//   displayW/H = orientation が 90/270 回転 (5,6,7,8) なら raw を入れ替えたもの。
//   ★bbox_x/y は「表示された画像 (= ImagePicker/expo-image が正立表示したもの)」基準の
//     割合なので、往路 px 変換に使う W/H は display 基準でなければならない。
// ─────────────────────────────────────────

type JpegDims = {
  rawW: number
  rawH: number
  orientation: number
  displayW: number
  displayH: number
}

function parseJpeg(bytes: Uint8Array): JpegDims | null {
  try {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return null // SOI 不一致 = JPEG でない
    }
    let orientation = 1
    let i = 2
    const n = bytes.length
    while (i < n) {
      // マーカー先頭は 0xFF。連続 0xFF (fill) は読み飛ばす。
      if (bytes[i] !== 0xff) {
        i += 1
        continue
      }
      let marker = bytes[i + 1]
      while (marker === 0xff && i + 1 < n) {
        i += 1
        marker = bytes[i + 1]
      }
      i += 2
      // 長さを持たない standalone マーカー
      if (
        marker === 0xd8 || marker === 0xd9 || marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        continue
      }
      if (i + 1 >= n) break
      const segLen = (bytes[i] << 8) | bytes[i + 1]
      if (segLen < 2) break
      const segStart = i + 2
      const segEnd = i + segLen // 次マーカー位置 = i + segLen

      // APP1 (EXIF) → orientation 抽出
      if (marker === 0xe1) {
        orientation = readExifOrientation(bytes, segStart, segEnd) ?? orientation
      }

      // SOF0-15 (0xC0-0xCF) から DHT(C4)/JPG(C8)/DAC(CC) を除く → 寸法
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        // segStart: precision(1), height(2), width(2)
        const rawH = (bytes[segStart + 1] << 8) | bytes[segStart + 2]
        const rawW = (bytes[segStart + 3] << 8) | bytes[segStart + 4]
        const rotated = orientation >= 5 && orientation <= 8
        return {
          rawW,
          rawH,
          orientation,
          displayW: rotated ? rawH : rawW,
          displayH: rotated ? rawW : rawH,
        }
      }
      i = segEnd
    }
    return null
  } catch {
    return null
  }
}

// APP1 セグメントから EXIF orientation (tag 0x0112) を読む。無ければ null。
function readExifOrientation(
  bytes: Uint8Array,
  segStart: number,
  segEnd: number,
): number | null {
  try {
    // "Exif\0\0"
    if (segEnd - segStart < 14) return null
    if (
      bytes[segStart] !== 0x45 || bytes[segStart + 1] !== 0x78 ||
      bytes[segStart + 2] !== 0x69 || bytes[segStart + 3] !== 0x66 ||
      bytes[segStart + 4] !== 0x00 || bytes[segStart + 5] !== 0x00
    ) {
      return null
    }
    const tiff = segStart + 6
    // byte order: 'II'(little) / 'MM'(big)
    const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49
    const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d
    if (!little && !big) return null

    const u16 = (off: number) =>
      little
        ? bytes[off] | (bytes[off + 1] << 8)
        : (bytes[off] << 8) | bytes[off + 1]
    const u32 = (off: number) =>
      little
        ? (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) |
          (bytes[off + 3] << 24)) >>> 0
        : ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) |
          bytes[off + 3]) >>> 0

    const ifdOffset = u32(tiff + 4)
    const ifd0 = tiff + ifdOffset
    if (ifd0 + 2 > segEnd) return null
    const count = u16(ifd0)
    let p = ifd0 + 2
    for (let e = 0; e < count; e++) {
      if (p + 12 > segEnd) break
      const tag = u16(p)
      if (tag === 0x0112) {
        // type SHORT: 値は entry の value/offset フィールド先頭 2 バイト
        const val = u16(p + 8)
        if (val >= 1 && val <= 8) return val
        return null
      }
      p += 12
    }
    return null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────
// helpers
// ─────────────────────────────────────────

// image_url でグループ化 (画像単位で 1 回だけ Vision を呼ぶため)。
function groupByImage(rows: CardRow[]): Map<string, TapPoint[]> {
  const map = new Map<string, TapPoint[]>()
  for (const r of rows) {
    if (r.image_url == null || r.bbox_x == null || r.bbox_y == null) continue
    const arr = map.get(r.image_url) ?? []
    arr.push({ id: r.id, bbox_x: r.bbox_x, bbox_y: r.bbox_y })
    map.set(r.image_url, arr)
  }
  return map
}

// ★SSRF 検証: 自プロジェクトドメイン + /card-images/ の公開パスのみ許可。
function isAllowedImageUrl(imageUrl: string): boolean {
  let u: URL
  let base: URL
  try {
    u = new URL(imageUrl)
    base = new URL(SUPABASE_URL)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  if (u.host !== base.host) return false // 自プロジェクトドメイン
  if (!u.pathname.startsWith(STORAGE_PUBLIC_PREFIX)) return false // card-images 限定
  return true
}

// タイムアウト付き fetch (★AbortController で明示中断)。
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// timing-safe なシークレット比較。長さ差も漏らさないよう固定長ダイジェスト同士で比較。
async function secretsMatch(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  return timingSafeEqual(new Uint8Array(ha), new Uint8Array(hb))
}

// UTF-8 バイト長 (body サイズ判定用)。
function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

// ログ用に image_url を短縮 (フルURL/クエリを残さない)。
function safeShortPath(imageUrl: string): string {
  try {
    const u = new URL(imageUrl)
    const idx = u.pathname.indexOf('/card-images/')
    return idx >= 0 ? u.pathname.slice(idx) : u.pathname
  } catch {
    return '<invalid-url>'
  }
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
