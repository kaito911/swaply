-- ====================================================================
-- migration_rpc_venue_trade_cancel_definer.sql
-- 作成日: 2026-07-09
-- 目的  : Critical③ の ③-B。venue_trade_cancel 4 RPC を
--         SECURITY INVOKER → SECURITY DEFINER に切り替える。
--
-- 背景 (③-C の前提整備):
--   ③-C で venue_trades の RLS を "SELECT only" に絞ると、INVOKER の
--   cancel 4 RPC は RLS "Participants can manage" (FOR ALL) に依存して
--   UPDATE していたため書き込めなくなり、キャンセル機能が全停止する。
--   → 先に DEFINER 化して RLS 非依存で書けるようにする (③-A の 4 RPC と同様)。
--
-- ★方式: ALTER FUNCTION ... SECURITY DEFINER (本文を書き換えない)
--   CREATE OR REPLACE で本文を再記述すると、本番 live 定義との drift リスクがある。
--   ALTER は security mode のみを変更し、本番に今ある本文
--     (AUTH_MISMATCH ガード / for update / 当事者判定 / 状態判定 /
--      confirm の 2h 経過チェック / SET search_path TO 'public')
--   をそのまま保持する。= 「ロジック一切不変」を構造的に保証。
--
-- ★前提 (本番確認済 2026-07-09):
--   - 4 本すべて存在 (request/withdraw/respond/confirm_venue_trade_cancel)
--   - LANGUAGE plpgsql / SET search_path TO 'public' 済
--   - AUTH_MISMATCH ガードが 4 本すべてに存在 (= DEFINER でも唯一の防波堤が生きる)
--   - 現状 SECURITY INVOKER (明示なし=デフォルト)
--
-- ★DEFINER 化で AUTH_MISMATCH ガードは死守される:
--   DEFINER は RLS を抜けるため、"呼出者本人か" の検証は関数内の
--   auth.uid()=p_user_id ガードのみが担う。本 ALTER は本文に触れないので
--   ガードは確実に残る。
--
-- アプリ影響: なし (RPC 名・引数不変)。lib/supabase.ts 無変更。
-- RLS / GRANT の絞りは ③-C (本ファイルでは触れない)。
--
-- 適用: Kが本番 SQL Editor で実行。適用後 C1 で is_definer=true を確認。
-- ====================================================================

begin;

-- ─────────────────────────────────────────
-- security mode: INVOKER → DEFINER (本文は不変)
-- ─────────────────────────────────────────
alter function public.request_venue_trade_cancel(uuid, uuid)           security definer;
alter function public.withdraw_venue_trade_cancel(uuid, uuid)          security definer;
alter function public.respond_venue_trade_cancel(uuid, uuid, boolean)  security definer;
alter function public.confirm_venue_trade_cancel(uuid, uuid)           security definer;

-- ─────────────────────────────────────────
-- 権限: anon 締め出し (③-A と同様、PUBLIC 自動付与を剥がして authenticated のみ)
-- ─────────────────────────────────────────
revoke execute on function public.request_venue_trade_cancel(uuid, uuid)          from public;
revoke execute on function public.withdraw_venue_trade_cancel(uuid, uuid)         from public;
revoke execute on function public.respond_venue_trade_cancel(uuid, uuid, boolean) from public;
revoke execute on function public.confirm_venue_trade_cancel(uuid, uuid)          from public;

grant execute on function public.request_venue_trade_cancel(uuid, uuid)          to authenticated;
grant execute on function public.withdraw_venue_trade_cancel(uuid, uuid)         to authenticated;
grant execute on function public.respond_venue_trade_cancel(uuid, uuid, boolean) to authenticated;
grant execute on function public.confirm_venue_trade_cancel(uuid, uuid)          to authenticated;

commit;

-- ====================================================================
-- 適用後確認
-- ====================================================================
--
-- ◆ C1: 4 関数が DEFINER + search_path 維持
--   select proname, prosecdef as is_definer, proconfig
--   from pg_proc
--   where pronamespace='public'::regnamespace
--     and proname in ('request_venue_trade_cancel','withdraw_venue_trade_cancel',
--                     'respond_venue_trade_cancel','confirm_venue_trade_cancel')
--   order by proname;
--   → 期待: 4 行、is_definer=true、proconfig に {search_path=public}
--
-- ◆ C2: 権限 (authenticated に EXECUTE、public には無し)
--   select routine_name, grantee, privilege_type
--   from information_schema.role_routine_grants
--   where routine_schema='public'
--     and routine_name in ('request_venue_trade_cancel','withdraw_venue_trade_cancel',
--                          'respond_venue_trade_cancel','confirm_venue_trade_cancel')
--   order by routine_name, grantee;
--   → 期待: grantee='authenticated' の EXECUTE。'PUBLIC' は出ない。
--
-- ◆ C3: AUTH_MISMATCH ガードが本文に残存 (ALTER は本文不変だが念のため)
--   select proname, (pg_get_functiondef(oid) ilike '%AUTH_MISMATCH%') as has_guard
--   from pg_proc
--   where pronamespace='public'::regnamespace
--     and proname in ('request_venue_trade_cancel','withdraw_venue_trade_cancel',
--                     'respond_venue_trade_cancel','confirm_venue_trade_cancel')
--   order by proname;
--   → 期待: 4 行すべて has_guard=true
--
-- ====================================================================
-- ロールバック (INVOKER に戻す。③-C の RLS 絞りが未適用の間のみ安全)
-- ====================================================================
-- begin;
--   alter function public.request_venue_trade_cancel(uuid, uuid)          security invoker;
--   alter function public.withdraw_venue_trade_cancel(uuid, uuid)         security invoker;
--   alter function public.respond_venue_trade_cancel(uuid, uuid, boolean) security invoker;
--   alter function public.confirm_venue_trade_cancel(uuid, uuid)          security invoker;
-- commit;
-- ※ ③-C 適用後に INVOKER へ戻すとキャンセルが書けなくなるため、③-C 後は戻さないこと。
-- ====================================================================
