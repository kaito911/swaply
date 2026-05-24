-- ─────────────────────────────────────────
-- [DEPRECATED] 動画 #9 用 デモシードデータ - 画像 URL 修正 (placehold.co PNG 化)
-- ─────────────────────────────────────────
-- ⚠️ 本ファイルは 2026-05-23 で廃止されました。
--    新画像 (AI 生成、Supabase Storage 配信) への切替は
--    docs/seed_video9_update_to_storage_urls.sql を使用してください。
--
-- 履歴参照用として保持。新規実行禁止。
-- ─────────────────────────────────────────
-- Supabase SQL Editor で手動実行してください
--
-- 背景:
--   既存 seed_video9_demo.sql (commit 3d6ddca/ba4dbb1) の placehold.co URL は
--   拡張子なし → デフォルトで SVG 返却 → React Native Image が表示できない問題発覚
--
-- 修正内容:
--   '/FFFFFF?text=' → '/FFFFFF.png?text=' に置換
--   PNG 強制返却で RN Image / expo-image どちらでも表示可能に
--
-- 影響対象:
--   description LIKE '[SEED_V9]%' の seed cards のみ (30 件想定)
--   既存の非 seed データには影響なし

UPDATE public.cards
SET image_url = REPLACE(image_url, '/FFFFFF?text=', '/FFFFFF.png?text=')
WHERE description LIKE '[SEED_V9]%'
AND image_url LIKE '%placehold.co%/FFFFFF?text=%';

-- 完了確認
SELECT
  'fix_image_urls completed' AS status,
  COUNT(*) AS updated_count,
  (SELECT COUNT(*) FROM public.cards
   WHERE description LIKE '[SEED_V9]%'
   AND image_url LIKE '%/FFFFFF.png?%') AS png_url_count,
  (SELECT COUNT(*) FROM public.cards
   WHERE description LIKE '[SEED_V9]%'
   AND image_url LIKE '%/FFFFFF?%') AS old_svg_url_count
FROM public.cards
WHERE description LIKE '[SEED_V9]%'
AND image_url LIKE '%/FFFFFF.png?%';

-- 期待値: updated_count = 30, png_url_count = 30, old_svg_url_count = 0
