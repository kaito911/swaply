-- migration_add_image_back_url.sql の rollback
-- Supabase SQL Editor で手動実行してください
--
-- ⚠️ データロス警告:
--   image_back_url 列に保存された裏面画像 URL は復元不能。
--   rollback 前に必要なら別テーブルに退避を検討すること。

alter table public.cards
  drop column if exists image_back_url;
