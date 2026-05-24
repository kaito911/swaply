-- master_item_types テーブル + GIN index + RLS (空テーブル、seed は Step 2)
-- Supabase SQL Editor で手動実行してください
--
-- 前提:
--   1. pg_trgm extension が有効化されていること (migration_pg_trgm.sql)
--   2. update_updated_at_column() 関数が存在すること
--
-- 設計方針:
--   - 当初は cards.item_type を CHECK enum で実装する案だったが、
--     ユーザー指摘「ガチャガチャ系が今熱い」「今後どんどん追加していけるように」を受け
--     master_works / master_characters と同じパターンのマスタテーブル化に変更。
--   - ハイブリッドマスタ + フリーテキスト fallback (cards.item_type は FK なし TEXT、別 migration)。
--   - is_active カラムで廃止フラグを持つ (将来的に旧 item_type を非表示化する用途)。
--   - category_hint は主な使用カテゴリのヒント、cards.category enum と同値。
--   - 書き込みは Supabase Dashboard / service_role のみ。

create table public.master_item_types (
  id              text        primary key,
  display_name_ja text        not null,
  display_name_en text,
  aliases         text[]      not null default '{}',
  category_hint   text,
  sort_order      integer     not null default 0,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint master_item_types_category_hint_check
    check (category_hint is null or category_hint in ('anime', 'idol', 'character', 'manga', 'other'))
);

create trigger update_master_item_types_updated_at
  before update on public.master_item_types
  for each row
  execute function public.update_updated_at_column();

-- pg_trgm GIN index (表記ゆれ検索用)
create index master_item_types_display_name_ja_trgm_idx
  on public.master_item_types using gin (display_name_ja gin_trgm_ops);
create index master_item_types_display_name_en_trgm_idx
  on public.master_item_types using gin (display_name_en gin_trgm_ops);
create index master_item_types_aliases_gin_idx
  on public.master_item_types using gin (aliases);

-- 廃止フラグでの絞り込み高速化
create index master_item_types_is_active_idx
  on public.master_item_types (is_active) where is_active = true;

alter table public.master_item_types enable row level security;
create policy "Anyone can read master_item_types"
  on public.master_item_types for select
  using (true);

-- (item_type seed は Step 2 で別 migration として作成、想定: アクスタ/缶バッジ/ガチャガチャ/ぬいぐるみ等)
