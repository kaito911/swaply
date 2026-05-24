-- migration_extend_cards_to_items.sql の rollback
-- Supabase SQL Editor で手動実行してください
--
-- 注意: 本 rollback を先に実行することで master_* テーブルの安全な drop が可能になる。

-- インデックス削除
drop index if exists public.cards_category_idx;
drop index if exists public.cards_work_id_idx;
drop index if exists public.cards_character_id_idx;
drop index if exists public.cards_item_type_idx;

-- CHECK 制約削除
alter table public.cards
  drop constraint if exists cards_category_check;

-- カラム削除
alter table public.cards
  drop column if exists category,
  drop column if exists work_id,
  drop column if exists character_id,
  drop column if exists item_type;
