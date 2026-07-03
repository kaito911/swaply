-- ====================================================================
-- migration_rpc_get_distinct_partner_count.sql
-- 作成日: 2026-07-04
-- 目的  : 自分がこれまでに交換した distinct 相手数を返す RPC (Trust 質 PR)。
--         「これまでに X 人と交換」の表示用。ソート・ランキングには使わない。
--
-- 設計判断 (kaito 指示、承認済):
--   - SECURITY INVOKER (RLS 経由)。呼出者の権限で trades / venue_trades を SELECT。
--   - 引数なし。他人の数値を取れる余地を作らない (auth.uid() 一択)。
--   - 二重防御として関数内 WHERE 句でも proposer/receiver に auth.uid() を明示。
--     RLS が緩い / 想定外に緩められた場合でも「自分の数値のみ」返る。
--
--         DEFINER 化するとサーバ権限で他人の trade を集計できる余地が生まれるため、
--         「他人のプロフィールに交換人数を表示する要件は現時点でスコープ外」の
--         kaito 指示に従い、INVOKER で他人集計の道を閉じる。
--
-- 引数: なし
-- 戻り値: integer (自分の distinct partner 数、0 以上)
--
-- 対象:
--   - trades.status = 'completed' の participant 相手
--   - venue_trades.status = 'completed' の participant 相手
--   - 両方の UNION の distinct 数
--
-- エラー:
--   AUTH_REQUIRED - 未認証
-- ====================================================================

create or replace function public.get_distinct_partner_count()
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_count    integer;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- trades / venue_trades 両表から自分が participant で completed の
  -- 相手ユーザー id を UNION して distinct count を取る。
  -- INVOKER のため RLS でフィルタが働く前提だが、二重防御として
  -- WHERE 句で明示的に auth.uid() を絞る。
  select count(distinct partner_id)::integer into v_count
  from (
    select case
             when proposer_user_id = v_actor_id then receiver_user_id
             else proposer_user_id
           end as partner_id
    from public.trades
    where status = 'completed'
      and (proposer_user_id = v_actor_id or receiver_user_id = v_actor_id)
    union
    select case
             when proposer_id = v_actor_id then receiver_id
             else proposer_id
           end as partner_id
    from public.venue_trades
    where status = 'completed'
      and (proposer_id = v_actor_id or receiver_id = v_actor_id)
  ) as partners
  where partner_id is not null;

  return coalesce(v_count, 0);
end;
$function$;

-- 権限: 認証ユーザーのみ実行可
revoke all on function public.get_distinct_partner_count() from anon, public;
grant execute on function public.get_distinct_partner_count() to authenticated;

-- ====================================================================
-- 適用後確認クエリ
-- ====================================================================
--
-- ◆ 関数存在 + INVOKER 確認
--   select proname, pg_get_function_identity_arguments(oid) as args, prosecdef
--   from pg_proc
--   where proname = 'get_distinct_partner_count' and pronamespace = 'public'::regnamespace;
--   → 期待: 1 行、args = "" (空、引数なし)、prosecdef = false (SECURITY INVOKER)
--
-- ◆ 権限
--   select grantee, privilege_type from information_schema.routine_privileges
--   where specific_schema = 'public' and routine_name = 'get_distinct_partner_count'
--   order by grantee;
--   → 期待: authenticated=EXECUTE のみ
--
-- ◆ 動作確認 (実機 or SQL で)
--   - 認証ユーザーで実行 → 自分の completed 相手 distinct 数
--   - completed が無いユーザー → 0
--   - 引数なしのため他人の数を取る呼び方は存在しない
