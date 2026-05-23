-- ─────────────────────────────────────────
-- 動画 #9 用 seed cards の image_url を Supabase Storage URL に切替
-- ─────────────────────────────────────────
-- Supabase SQL Editor で手動実行してください
--
-- 背景:
--   commit 3d6ddca/ba4dbb1/859e922 の placehold.co URL を、
--   AI 生成画像 (Supabase Storage seed-card-images バケット) に置換
--
-- 前提:
--   1. Supabase Storage に seed-card-images バケット (public) 作成済
--   2. card-001.png 〜 card-030.png を一括アップロード済
--   3. 本 SQL を実行する前に、{PROJECT_REF} を実プロジェクト ref に置換
--      Supabase Dashboard → Settings → API → "Project URL" から取得
--      例: https://abcdefghijklmno.supabase.co の "abcdefghijklmno" 部分
--
-- 置換方法 (ローカルで sed):
--   sed -i 's/{PROJECT_REF}/abcdefghijklmno/g' docs/seed_video9_update_to_storage_urls.sql
--   または SQL Editor 内のテキストを直接置換してから Run
--
-- 識別マーカー:
--   description LIKE '[SEED_V9]%' で seed cards 限定、非 seed データ影響なし
--
-- 置換ロジック (regexp_replace で 1 文 30 件一括):
--   - 旧 URL: 'https://placehold.co/400x560/{色}/FFFFFF.png?text=Card+0NN' (色は 10 種類混在)
--   - 抽出: regexp_match で 'Card\+(\d+)' から NN を抽出
--   - 新 URL: 'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-0NN.png'

UPDATE public.cards
SET image_url = 'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-'
  || lpad((regexp_match(image_url, 'Card\+(\d+)'))[1], 3, '0') || '.png'
WHERE description LIKE '[SEED_V9]%'
  AND image_url LIKE '%placehold.co%Card+%';

-- 完了確認
SELECT
  'update_to_storage_urls completed' AS status,
  COUNT(*) AS updated_count,
  (SELECT COUNT(*) FROM public.cards
   WHERE description LIKE '[SEED_V9]%'
   AND image_url LIKE '%supabase.co/storage/v1/object/public/seed-card-images/%') AS storage_url_count,
  (SELECT COUNT(*) FROM public.cards
   WHERE description LIKE '[SEED_V9]%'
   AND image_url LIKE '%placehold.co%') AS remaining_placehold_count
FROM public.cards
WHERE description LIKE '[SEED_V9]%'
  AND image_url LIKE '%supabase.co/storage/v1/object/public/seed-card-images/%';

-- 期待値: updated_count = 30, storage_url_count = 30, remaining_placehold_count = 0

-- サンプル確認 (5 件抽出して新 URL を目視)
SELECT id, name, image_url
FROM public.cards
WHERE description LIKE '[SEED_V9]%'
ORDER BY image_url
LIMIT 5;
