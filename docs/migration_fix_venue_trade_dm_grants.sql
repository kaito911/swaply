-- ====================================================================
-- migration_fix_venue_trade_dm_grants.sql
-- 作成日: 2026-06-15
-- 目的  : venue_trade DM 4 RPC の authenticated EXECUTE 権限を再付与する。
--
-- 経緯:
--   docs/migration_rpc_venue_trade_dm.sql (PR #32) で定義した 4 RPC のうち、
--   本番 DB で get_venue_trade_unread_count() に対する authenticated EXECUTE が
--   付与されていない状態を確認 (error code 42501、本番アプリで実証 2026-06-15)。
--   原因として grant 文の本番未反映 / 後続操作での権限消失が推定される。
--
-- 処理内容:
--   docs/migration_rpc_venue_trade_dm.sql 内に元から含まれていた
--   revoke / grant 文と同一内容を、4 RPC 全てに対して idempotent に再適用する。
--   関数本体 (CREATE OR REPLACE) は触らない。権限 (revoke / grant) のみを
--   再付与し、本番 DB と migration 仕様を一致させる。
--
-- 安全性:
--   - revoke / grant は冪等。既に正しい状態なら no-op。
--   - SECURITY DEFINER / search_path / 関数本体は無改変。
--   - RLS は別管理、影響なし。
--   - rollback 不要 (元 migration 仕様への復元)。
--
-- 関連:
--   - 元: docs/migration_rpc_venue_trade_dm.sql (PR #32 / B2)
--   - 経緯コミット: db8c076 (PR #32 merge)
--   - 検知箇所: providers/BadgeProvider.tsx → fetchVenueTradeUnreadCount
-- ====================================================================

begin;

-- (1) send_venue_trade_message(uuid, text)
revoke all on function public.send_venue_trade_message(uuid, text) from anon;
revoke all on function public.send_venue_trade_message(uuid, text) from public;
grant execute on function public.send_venue_trade_message(uuid, text) to authenticated;

-- (2) mark_venue_trade_thread_read(uuid)
revoke all on function public.mark_venue_trade_thread_read(uuid) from anon;
revoke all on function public.mark_venue_trade_thread_read(uuid) from public;
grant execute on function public.mark_venue_trade_thread_read(uuid) to authenticated;

-- (3) get_venue_trade_unread_count()  ← 今回エラー発生の RPC
revoke all on function public.get_venue_trade_unread_count() from anon;
revoke all on function public.get_venue_trade_unread_count() from public;
grant execute on function public.get_venue_trade_unread_count() to authenticated;

-- (4) get_venue_trade_unread_counts()  ← 同パターンで grant 漏れの可能性
revoke all on function public.get_venue_trade_unread_counts() from anon;
revoke all on function public.get_venue_trade_unread_counts() from public;
grant execute on function public.get_venue_trade_unread_counts() to authenticated;

commit;

-- ====================================================================
-- 適用後確認 SQL (Supabase SQL Editor で実行、本ファイルとは別 transaction)
-- ====================================================================
--
-- ◆ C1: 4 RPC の権限が authenticated / postgres / service_role に EXECUTE 付与済、
--       anon / public は EXECUTE を持たないことを確認
--
-- select routine_name, grantee, privilege_type
-- from information_schema.role_routine_grants
-- where routine_schema = 'public'
--   and routine_name in (
--     'send_venue_trade_message',
--     'mark_venue_trade_thread_read',
--     'get_venue_trade_unread_count',
--     'get_venue_trade_unread_counts'
--   )
-- order by routine_name, grantee;
--
-- → 期待:
--   各関数に authenticated / postgres / service_role の EXECUTE 行が出る (合計 12 行)
--   anon / public は出ない
--
-- ◆ C2: 関数自体は無改変であることの確認 (本 migration では本体を触らない)
--
-- select proname, prosecdef, proconfig
-- from pg_proc
-- where pronamespace = 'public'::regnamespace
--   and proname in (
--     'send_venue_trade_message',
--     'mark_venue_trade_thread_read',
--     'get_venue_trade_unread_count',
--     'get_venue_trade_unread_counts'
--   )
-- order by proname;
--
-- → 期待: 全 4 行とも prosecdef=true、proconfig に 'search_path=public'
--
-- ====================================================================
