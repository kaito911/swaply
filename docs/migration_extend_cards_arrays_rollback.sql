-- migration_extend_cards_arrays.sql の rollback (緊急時の安全網)
-- Supabase SQL Editor で手動実行してください
--
-- ⚠️ データロス警告:
--   characters / item_types が **複数要素** (セット出品、N>=2) を含む状態で本 rollback を
--   実行すると、要素 0 番目以外のデータは失われる (TEXT[] → TEXT 単数への自動変換ルール)。
--   β1 で本番出品が始まる前 (= セット出品が登録される前) に rollback 判断すること。
--   それ以降は forward-only と認識する。
--
-- 実行順序 (forward と対称):
--   1. legacy K-POP 列のコメント解除
--   2. 新 GIN index drop
--   3. 旧単数カラム再追加
--   4. data migration 復元 (characters[1] → character_id, item_types[1] → item_type)
--   5. 新配列カラム drop
--   6. 旧 index 再作成

-- ─────────────────────────────────────────
-- 1. legacy K-POP 列の DEPRECATED コメント解除
-- ─────────────────────────────────────────
comment on column public.cards.member_name is null;
comment on column public.cards.group_name is null;
comment on column public.cards.series is null;

-- ─────────────────────────────────────────
-- 2. 新 GIN index drop
-- ─────────────────────────────────────────
drop index if exists public.cards_characters_gin_idx;
drop index if exists public.cards_item_types_gin_idx;

-- ─────────────────────────────────────────
-- 3. 旧単数カラム再追加 (NULL 値で初期化、次の UPDATE で復元)
-- ─────────────────────────────────────────
alter table public.cards
  add column character_id text,
  add column item_type    text;

-- ─────────────────────────────────────────
-- 4. data migration 復元: 配列の 1 番目要素 (PostgreSQL は 1-indexed) を単数に
--    複数要素が入っていた場合、要素 1 以外は失われる (forward-only リスク)
-- ─────────────────────────────────────────
update public.cards
set character_id = characters[1]
where array_length(characters, 1) > 0;

update public.cards
set item_type = item_types[1]
where array_length(item_types, 1) > 0;

-- ─────────────────────────────────────────
-- 5. 新配列カラム drop
-- ─────────────────────────────────────────
alter table public.cards
  drop column if exists characters,
  drop column if exists item_types;

-- ─────────────────────────────────────────
-- 6. Step 1 状態の単数 index 再作成
-- ─────────────────────────────────────────
create index if not exists cards_character_id_idx on public.cards (character_id);
create index if not exists cards_item_type_idx    on public.cards (item_type);
