-- cards.character_id (TEXT) → characters TEXT[]
-- cards.item_type (TEXT) → item_types TEXT[]
-- 既存 63 行のテストデータは保全 (data migration 経由で新 schema に移行)
-- legacy K-POP 列 (member_name/group_name/series) は DEPRECATED コメント追加で保全
-- Supabase SQL Editor で手動実行してください
--
-- 前提:
--   1. Step 1 migration_extend_cards_to_items.sql 適用済
--      (character_id, item_type, work_id, category が cards に追加済)
--   2. Step 2 master_characters_seed / master_item_types_seed の適用は本 migration と独立
--   3. cards テーブルに既存テストデータ (約 63 件、ユーザー本人出品) が存在する想定
--
-- 設計方針:
--   - Step 1 で追加した character_id (TEXT) / item_type (TEXT) は **data migration で配列化**
--     (既存テストデータが Step 1 列に値を入れていなければ NULL のまま、入っていれば配列化)
--   - 配列化後に旧単数カラムを drop、既存 63 行は新 schema (characters[], item_types[]) で生存
--   - work_id (単数) / category (単数 enum) は変更なし
--   - legacy K-POP 列 (member_name/group_name/series) は物理削除せず DEPRECATED コメント追加
--     (rollback 安全網 + Phase 1.5 で正式統一までの保全)
--   - GIN index は配列の標準 gin (@>, <@, &&) を使用、pg_trgm 連携は unnest 経由で Step 3
--
-- 実行順序:
--   1. 配列カラム追加 (NOT NULL DEFAULT '{}')
--   2. data migration (character_id → characters[0], item_type → item_types[0])
--   3. 旧 index drop
--   4. 旧単数カラム drop
--   5. 配列カラムの GIN index 追加
--   6. legacy K-POP 列に DEPRECATED コメント
--
-- 関連: refactor_plan v1.11 章 3.9、ユーザー観察「セット出品 = いらないものをまとめて処分」
--      (project_research_sanrio_2026-05-08.md 205 行で裏付け)

-- ─────────────────────────────────────────
-- 1. 配列カラム追加 (既存行は空配列 '{}' で初期化)
-- ─────────────────────────────────────────
alter table public.cards
  add column characters  text[] not null default '{}',
  add column item_types  text[] not null default '{}';

-- ─────────────────────────────────────────
-- 2. data migration: 単数カラム → 配列カラムの 0 番目要素
-- ─────────────────────────────────────────
-- 既存 63 行は Step 1 後に出品コードで character_id / item_type が更新されていない想定
-- (cardinfo→confirm の出品 form は character_id を書き込まないため、ほぼ NULL のはず)
-- それでも値が入っていれば安全に配列化する
update public.cards
set characters = array[character_id]
where character_id is not null and character_id <> '';

update public.cards
set item_types = array[item_type]
where item_type is not null and item_type <> '';

-- ─────────────────────────────────────────
-- 3. 旧 index drop (drop column 前に必須)
-- ─────────────────────────────────────────
drop index if exists public.cards_character_id_idx;
drop index if exists public.cards_item_type_idx;

-- ─────────────────────────────────────────
-- 4. 旧単数カラム drop (data migration 完了後で安全)
-- ─────────────────────────────────────────
alter table public.cards
  drop column if exists character_id,
  drop column if exists item_type;

-- ─────────────────────────────────────────
-- 5. 配列カラムの GIN index 追加
-- ─────────────────────────────────────────
-- 注: pg_trgm gin_trgm_ops は text 用、配列には標準 gin (@>, <@, && サポート) を使う
-- 配列要素の fuzzy 検索 (例: '炭治郎' を含むセット検索) は unnest 経由で実装 (Step 3 RPC)
create index cards_characters_gin_idx on public.cards using gin (characters);
create index cards_item_types_gin_idx on public.cards using gin (item_types);

-- ─────────────────────────────────────────
-- 6. legacy K-POP 列に DEPRECATED コメント (物理削除なし、保全)
-- ─────────────────────────────────────────
comment on column public.cards.member_name is
  'DEPRECATED 2026-05-10 (Step 2.5): legacy K-POP single-value column. '
  'Use characters TEXT[] going forward. Phase 1.5 で master_characters への正式統一予定。';
comment on column public.cards.group_name is
  'DEPRECATED 2026-05-10 (Step 2.5): legacy K-POP single-value column. '
  'Use work_id (single) と characters[] going forward. Phase 1.5 で正式統一予定。';
comment on column public.cards.series is
  'DEPRECATED 2026-05-10 (Step 2.5): legacy K-POP series fragment. '
  'Phase 1.5 で master_series 検討予定 (β1 は description で代替)。';
