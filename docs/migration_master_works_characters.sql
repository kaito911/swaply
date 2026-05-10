-- master_works / master_characters / user_keyword_history テーブル + 初期 seed
-- Supabase SQL Editor で手動実行してください
--
-- 前提:
--   1. pg_trgm extension が有効化されていること (migration_pg_trgm.sql)
--   2. update_updated_at_column() 関数が存在すること (wanted_cards migration で定義済)
--
-- 設計方針:
--   - 著作権配慮: master_works / master_characters は image_url カラムを持たない
--     (refactor_plan v1.9 章 3.10、Day 1 必須項目 #5)
--   - PK は TEXT slug (例: 'kimetsu', 'conan', 'sanrio')。
--     コード/クエリで参照しやすく、固定マスタとして妥当。
--   - aliases (TEXT[]) で表記ゆれを吸収、pg_trgm GIN index と二重構造で検索性能確保。
--   - cards.work_id / character_id は本テーブルを論理参照するが FK 制約は付けない
--     (ハイブリッドマスタ = フリーテキスト入力許容のため、別 migration)。
--   - master_* の書き込みは Supabase Dashboard / service_role のみ。
--     RLS は SELECT のみ公開、INSERT/UPDATE/DELETE は policy なし (= 拒否)。

-- ─────────────────────────────────────────
-- 1. master_works (大カテゴリマスタ)
-- ─────────────────────────────────────────
create table public.master_works (
  id              text        primary key,
  display_name_ja text        not null,
  display_name_en text,
  aliases         text[]      not null default '{}',
  category        text        not null,
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint master_works_category_check
    check (category in ('anime', 'idol', 'character', 'manga', 'other'))
);

create trigger update_master_works_updated_at
  before update on public.master_works
  for each row
  execute function public.update_updated_at_column();

-- pg_trgm GIN index (表記ゆれ検索用)
create index master_works_display_name_ja_trgm_idx
  on public.master_works using gin (display_name_ja gin_trgm_ops);
create index master_works_display_name_en_trgm_idx
  on public.master_works using gin (display_name_en gin_trgm_ops);
create index master_works_aliases_gin_idx
  on public.master_works using gin (aliases);

alter table public.master_works enable row level security;
create policy "Anyone can read master_works"
  on public.master_works for select
  using (true);

-- 初期 seed (Phase 1 β の 3 IP)
insert into public.master_works (id, display_name_ja, display_name_en, aliases, category, sort_order) values
  ('kimetsu', '鬼滅の刃', 'Demon Slayer',
    array['鬼滅', 'kimetsu', 'demonslayer', 'demon slayer', 'きめつのやいば', 'キメツノヤイバ'],
    'anime', 10),
  ('conan',   '名探偵コナン', 'Detective Conan',
    array['コナン', 'conan', 'detective conan', 'めいたんていこなん', 'メイタンテイコナン'],
    'anime', 20),
  ('sanrio',  'サンリオ', 'Sanrio',
    array['さんりお', 'sanrio', 'ハローキティ', 'hello kitty', 'マイメロ', 'クロミ', 'シナモロール', 'ポムポムプリン'],
    'character', 30);

-- ─────────────────────────────────────────
-- 2. master_characters (主要キャラマスタ、seed は Step 2 別 migration)
-- ─────────────────────────────────────────
create table public.master_characters (
  id              text        primary key,
  work_id         text        not null references public.master_works(id) on delete cascade,
  display_name_ja text        not null,
  display_name_en text,
  aliases         text[]      not null default '{}',
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger update_master_characters_updated_at
  before update on public.master_characters
  for each row
  execute function public.update_updated_at_column();

create index master_characters_work_id_idx
  on public.master_characters (work_id);
create index master_characters_display_name_ja_trgm_idx
  on public.master_characters using gin (display_name_ja gin_trgm_ops);
create index master_characters_display_name_en_trgm_idx
  on public.master_characters using gin (display_name_en gin_trgm_ops);
create index master_characters_aliases_gin_idx
  on public.master_characters using gin (aliases);

alter table public.master_characters enable row level security;
create policy "Anyone can read master_characters"
  on public.master_characters for select
  using (true);

-- ─────────────────────────────────────────
-- 3. user_keyword_history (ユーザー検索/入力履歴、master 拡張判断用)
-- 設計目的:
--   - マスタにないキーワードを蓄積、5 件以上で運営が master 化判断
--   - 検索・出品入力の文脈をキャプチャ (source カラム)
-- ─────────────────────────────────────────
create table public.user_keyword_history (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  keyword     text        not null,
  source      text        not null default 'search',
  searched_at timestamptz not null default now(),
  constraint user_keyword_history_source_check
    check (source in ('search', 'listing_input'))
);

create index user_keyword_history_user_id_searched_at_idx
  on public.user_keyword_history (user_id, searched_at desc);
create index user_keyword_history_keyword_trgm_idx
  on public.user_keyword_history using gin (keyword gin_trgm_ops);

alter table public.user_keyword_history enable row level security;

-- 自分の履歴のみ insert/select 可
create policy "Users can insert their own keyword history"
  on public.user_keyword_history for insert
  with check (auth.uid() = user_id);
create policy "Users can read their own keyword history"
  on public.user_keyword_history for select
  using (auth.uid() = user_id);
