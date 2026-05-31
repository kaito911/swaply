-- migration_add_card_want_and_bbox.sql の rollback
-- Supabase SQL Editor で手動実行してください
--
-- 注意:
--   want_characters / want_item_types / want_works 列を drop すると、
--   matcher v3 (3.5d 以降) が走っていた場合に出品の「求」情報が消失する。
--   本 rollback は migration 適用直後 (出品 form 再設計 3.5c 前) のみ安全。
--
-- 実行順序 (forward と逆):
--   1. GIN index 3 件 drop (column drop 前に必須)
--   2. want_* 5 列 drop
--   3. bbox 5 列 drop

-- ─────────────────────────────────────────
-- 1. GIN index drop
-- ─────────────────────────────────────────
drop index if exists public.cards_want_characters_gin_idx;
drop index if exists public.cards_want_item_types_gin_idx;
drop index if exists public.cards_want_works_gin_idx;

-- ─────────────────────────────────────────
-- 2. want_* 5 列 drop
-- ─────────────────────────────────────────
alter table public.cards
  drop column if exists want_image_url,
  drop column if exists want_image_back_url,
  drop column if exists want_characters,
  drop column if exists want_item_types,
  drop column if exists want_works;

-- ─────────────────────────────────────────
-- 3. bbox 5 列 drop
-- ─────────────────────────────────────────
alter table public.cards
  drop column if exists bbox_x,
  drop column if exists bbox_y,
  drop column if exists bbox_w,
  drop column if exists bbox_h,
  drop column if exists image_url_cropped;
