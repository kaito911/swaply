-- ====================================================================
-- migration_operator_accounts.sql
-- 作成日: 2026-07-04
-- 目的  : 運営アカウントを founder-supplied として分離集計するための参照テーブル。
--
--         Trust 質 PR の一部。「取引の片側でも operator なら founder-supplied」
--         と分類するため、集計クエリで LEFT JOIN する用の存在テーブル。
--
-- 設計判断:
--   - 別表方式 (kaito 指定)。profiles に is_operator bool 列を足す案は非採用。
--     利点: 集計 exists サブクエリが明示的、profiles スキーマを膨らませない。
--   - user_id を PK (1 user 1 行)。
--   - profiles(id) FK ON DELETE CASCADE。運営アカウントは通常退会しない前提だが、
--     万一 tombstone 化された場合は operator フラグも自然に消える (安全側)。
--   - RLS: SELECT は全員可 (公開)。将来 UI で「運営」バッジを出す用途に備える。
--     INSERT / UPDATE / DELETE は policy 未作成 = 全否定 (運営 service_role のみ)。
--
-- 適用手順:
--   - Supabase SQL Editor で本ファイルを実行 (kaito が別途タイミング指示)
--   - Dashboard から service_role で運営アカウント user_id を INSERT
-- ====================================================================

begin;

create table public.operator_accounts (
  user_id     uuid        primary key references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.operator_accounts enable row level security;

-- 公開 SELECT: 集計クエリや将来 UI 表示で参照
create policy "Anyone can read operator_accounts"
  on public.operator_accounts
  for select
  using (true);

-- INSERT / UPDATE / DELETE: policy 未作成 = 全否定 (運営 service_role のみ)

commit;

-- ====================================================================
-- 分類クエリの考え方 (集計時の参考、本 PR では集計 UI は作らない)
-- ====================================================================
--
-- 「取引の片側でも operator なら founder-supplied」判定:
--
--   with trade_flags as (
--     select
--       t.id,
--       (exists (select 1 from public.operator_accounts oa where oa.user_id = t.proposer_user_id)
--        or exists (select 1 from public.operator_accounts oa where oa.user_id = t.receiver_user_id))
--         as is_founder_supplied
--     from public.trades t
--     where t.status = 'completed'
--   )
--   select is_founder_supplied, count(*) from trade_flags group by is_founder_supplied;
--
-- venue_trades も同様に proposer_id / receiver_id で判定。
--
-- ====================================================================
-- 適用後確認クエリ
-- ====================================================================
--
-- ◆ カラム
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'operator_accounts';
--   → 期待: user_id (uuid, NO) / created_at (timestamptz, NO) の 2 列
--
-- ◆ RLS policy
--   select polname, cmd, qual from pg_policies
--   where schemaname = 'public' and tablename = 'operator_accounts';
--   → 期待: 1 policy
--     "Anyone can read operator_accounts" cmd=SELECT qual=true
--     INSERT / UPDATE / DELETE の policy が存在しないこと
