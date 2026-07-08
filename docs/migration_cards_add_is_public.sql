-- ====================================================================
-- migration_cards_add_is_public.sql
-- 作成日: 2026-07-09
-- 目的  : cards に is_public (boolean) を追加する。商品棚統合 (顔2) の基盤。
--         is_public=true  … 公開出品 (誰でも提案可、フィード/検索に出る)
--         is_public=false … 私物/手札 (商品棚。提案の材料にはできるが公開されない)
--
-- ★非破壊 (additive + default true):
--   - not null default true のため、既存の全 cards は is_public=true になり、
--     現在の挙動と完全に同一 (全カードが公開=今と同じ)。
--   - 本 migration では RLS を一切変更しない (cards の SELECT は using(true) のまま)。
--     RLS の絞り (is_public=false を非当事者から隠す) は後続 Step 3-c で、
--     lib の is_public 対応をビルド→実機確認した後に別途行う。
--
-- 適用順 (③-A / Step 3-a 共通ルール):
--   1. 本 DDL を先に本番適用 (列追加)。
--   2. その後に lib/supabase.ts の is_public 対応 (フィード/検索クエリへ
--      .eq('is_public', true) 追加 + 出品作成で is_public=true 明示) を含むビルドを配信。
--   ※ 逆順だと lib が存在しない列を参照して PostgREST エラーになる。
--
-- アプリ影響: なし (default true で既存挙動維持)。
-- ====================================================================

begin;

alter table public.cards
  add column if not exists is_public boolean not null default true;

-- フィード/検索の主フィルタ (status='active' AND is_public=true) を高速化する複合 index。
-- 既存の status 単独 index があっても、is_public 併用フィルタの選択性向上のため追加。
create index if not exists idx_cards_status_is_public
  on public.cards (status, is_public);

commit;

-- ====================================================================
-- 適用後確認
-- ====================================================================
--
-- ◆ C1: 列が追加され、既存行がすべて is_public=true
--   select count(*) as total,
--          count(*) filter (where is_public) as public_true,
--          count(*) filter (where not is_public) as public_false
--   from public.cards;
--   → 期待: total = public_true、public_false = 0
--
-- ◆ C2: 列定義 (not null default true)
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema='public' and table_name='cards' and column_name='is_public';
--   → 期待: boolean / NO / true
--
-- ◆ C3: index 作成確認
--   select indexname, indexdef from pg_indexes
--   where schemaname='public' and tablename='cards' and indexname='idx_cards_status_is_public';
--   → 期待: 1 行
--
-- ====================================================================
-- ロールバック (列と index を削除。lib 側の is_public 参照を外すこととセット)
-- ====================================================================
-- begin;
--   drop index if exists public.idx_cards_status_is_public;
--   alter table public.cards drop column if exists is_public;
-- commit;
-- ====================================================================
