-- cards テーブルに items 系列カラムを追加 (純 additive migration)
-- Supabase SQL Editor で手動実行してください
--
-- 前提:
--   1. master_works が存在すること (migration_master_works_characters.sql)
--   2. master_item_types が存在すること (migration_master_item_types.sql)
--      ※ FK 制約は付けないため厳密には不要だが、論理的整合性のため事前適用を推奨
--
-- 設計方針:
--   - 既存データは NULL のまま (後方互換、β 前提でデータ少量)
--   - 新規出品時に値を要求する運用 (UI 層で必須化)
--   - work_id / character_id / item_type は論理的に master_* を参照するが
--     FK 制約は付けない (ハイブリッドマスタ = フリーテキスト入力許容)
--   - category のみ CHECK 制約 (5 値で固定)
--   - item_type の CHECK 制約は撤廃 (master_item_types でマスタ化、Q4 再設計)

alter table public.cards
  add column if not exists category     text,
  add column if not exists work_id      text,
  add column if not exists character_id text,
  add column if not exists item_type    text;

-- category のみ CHECK 制約 (NULL 許可、後方互換)
-- 値は master_works.category と同値
alter table public.cards
  add constraint cards_category_check
    check (category is null or category in ('anime', 'idol', 'character', 'manga', 'other'));

-- インデックス追加 (検索パフォーマンス用)
create index if not exists cards_category_idx     on public.cards (category);
create index if not exists cards_work_id_idx      on public.cards (work_id);
create index if not exists cards_character_id_idx on public.cards (character_id);
create index if not exists cards_item_type_idx    on public.cards (item_type);

-- 注: work_id / character_id / item_type は論理的に master_* を参照するが、
--     FK 制約は付けない (ハイブリッドマスタ = フリー入力許容のため)。
--     マスタにない値は user_keyword_history で別途記録、運営が後で master 化判断。
