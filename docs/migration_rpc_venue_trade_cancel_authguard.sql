-- ====================================================================
-- ⚠️⚠️ 適用不要 (記録用) ⚠️⚠️  ── 2026-07-08 本番確認済み
-- --------------------------------------------------------------------
--   本番の venue_trade キャンセル系 4 RPC には、既に同等のガード
--     if p_user_id <> auth.uid() then raise exception 'AUTH_MISMATCH'
--   が入っていることを本番実体で確認済み (以前の対応と思われる)。
--   → この migration は本番適用してはならない (二重・無駄)。
--
--   repo が「未対応」に見えたのは、旧 migration ファイル
--     docs/migration_rpc_venue_trade_cancel.sql
--   が古いまま (ガード追加前の定義) で残っていたため = repo と本番の乖離。
--   本ファイルは「調査の記録 + 想定していた修正内容」として残す。
--
--   ★ Critical① は対応済み。着手すべきは Critical② / ③ のみ。
-- ====================================================================
--
-- migration_rpc_venue_trade_cancel_authguard.sql
-- 作成日: 2026-07-08
-- 目的  : Critical① 修正。venue_trade キャンセル系 4 RPC に
--         「auth.uid() = p_user_id」の DB 層ガードを追加する (なりすまし防止)。
--         ※上記のとおり本番は既に対応済みのため、本ファイルは適用不要。
--
-- 背景 (脆弱性):
--   migration_rpc_venue_trade_cancel.sql の 4 RPC は SECURITY INVOKER で
--   p_user_id を引数に取り、それが当事者かは検証するが auth.uid() との
--   突合を「呼出側 (lib) の責務」に委ねていた。
--   これにより、取引当事者 A が RPC を直接呼び、相手 B の id を p_user_id に
--   渡すことで「B としての操作」を偽装できた。特に:
--     respond_venue_trade_cancel(trade, p_user_id=B, p_accept=true)
--   を A (申請者) が呼ぶと、関数は「B が承認した」とみなし status='cancelled'。
--   → 相手 B の同意なしに A が一方的にキャンセルを成立させられた
--     (2h 待ちの confirm すら回避)。
--
--   INVOKER + RLS "Participants can manage their venue trades" は、
--   「呼出者が当事者か」までは守るが「p_user_id が呼出者本人か」は守らない。
--
-- 修正方針:
--   core trade RPC (cancel_trade_atomic / open_trade_dispute) は既に
--   SECURITY DEFINER + v_actor_id := auth.uid() で正しく actor を確定している。
--   venue_trade_cancel 4 RPC のみがこのパターンから外れていたため、
--   同水準に引き上げる。最小差分として、既存の AUTH_REQUIRED (p_user_id null)
--   チェック直後に auth.uid() 突合を 1 段追加する (関数本体の他ロジックは不変)。
--
-- アプリ影響: なし。
--   app/venue/trade/[id].tsx は userId = session?.user?.id を渡すため、
--   常に auth.uid() = p_user_id が成立し、通常フローは AUTH_MISMATCH を踏まない。
--   (直接 RPC を叩く攻撃経路のみを塞ぐ、防御的多層化)。
--
-- 新規エラー:
--   AUTH_MISMATCH — auth.uid() が p_user_id と不一致 (直接呼び出しのなりすまし)
--
-- ⚠️ 適用順序:
--   - 本 migration は CREATE OR REPLACE (追加/冪等)。列 DDL は不要。
--   - 本番適用 → C1 で 4 関数の本体にガード行が含まれるか確認 → コード commit。
--   - 既存 migration_rpc_venue_trade_cancel.sql を置き換える上書き migration。
-- ====================================================================

begin;

-- ─────────────────────────────────────────
-- 1. request_venue_trade_cancel
-- ─────────────────────────────────────────
create or replace function public.request_venue_trade_cancel(
  p_trade_id uuid,
  p_user_id  uuid
)
returns public.venue_trades
language plpgsql
security invoker
as $$
declare
  v_trade public.venue_trades;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Critical① ガード: 呼出者本人 (auth.uid()) と p_user_id の一致を強制。
  if auth.uid() is distinct from p_user_id then
    raise exception 'AUTH_MISMATCH';
  end if;

  -- 行ロック
  select * into v_trade
  from public.venue_trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  if v_trade.proposer_id <> p_user_id and v_trade.receiver_id <> p_user_id then
    raise exception 'NOT_PARTICIPANT';
  end if;

  -- partially_confirmed / completed / cancelled では申請不可
  if v_trade.status <> 'pending' then
    raise exception 'TRADE_NOT_PENDING:%', v_trade.status;
  end if;

  -- 既申請がある状態の二重申請を防ぐ
  if v_trade.cancel_requested_at is not null then
    raise exception 'CANCEL_ALREADY_REQUESTED';
  end if;

  update public.venue_trades
     set cancel_requested_at = now(),
         cancel_requested_by = p_user_id,
         updated_at = now()
   where id = p_trade_id
  returning * into v_trade;

  return v_trade;
end;
$$;

-- ─────────────────────────────────────────
-- 2. withdraw_venue_trade_cancel
-- ─────────────────────────────────────────
create or replace function public.withdraw_venue_trade_cancel(
  p_trade_id uuid,
  p_user_id  uuid
)
returns public.venue_trades
language plpgsql
security invoker
as $$
declare
  v_trade public.venue_trades;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Critical① ガード: 呼出者本人 (auth.uid()) と p_user_id の一致を強制。
  if auth.uid() is distinct from p_user_id then
    raise exception 'AUTH_MISMATCH';
  end if;

  select * into v_trade
  from public.venue_trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  if v_trade.cancel_requested_at is null then
    raise exception 'CANCEL_NOT_REQUESTED';
  end if;

  -- 申請者本人のみ取り下げ可
  if v_trade.cancel_requested_by is distinct from p_user_id then
    raise exception 'NOT_REQUESTER';
  end if;

  update public.venue_trades
     set cancel_requested_at = null,
         cancel_requested_by = null,
         updated_at = now()
   where id = p_trade_id
  returning * into v_trade;

  return v_trade;
end;
$$;

-- ─────────────────────────────────────────
-- 3. respond_venue_trade_cancel
-- ─────────────────────────────────────────
-- p_accept=true  → status='cancelled', cancel_* clear
-- p_accept=false → cancel_* clear のみ (pending に戻る、status 不変)
create or replace function public.respond_venue_trade_cancel(
  p_trade_id uuid,
  p_user_id  uuid,
  p_accept   boolean
)
returns public.venue_trades
language plpgsql
security invoker
as $$
declare
  v_trade public.venue_trades;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Critical① ガード: 呼出者本人 (auth.uid()) と p_user_id の一致を強制。
  -- ★本関数が最も危険だった経路: 申請者 A が p_user_id=B を渡して
  --   「B の承認」を偽装し一方的キャンセルを成立させる攻撃をここで塞ぐ。
  if auth.uid() is distinct from p_user_id then
    raise exception 'AUTH_MISMATCH';
  end if;

  select * into v_trade
  from public.venue_trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  if v_trade.proposer_id <> p_user_id and v_trade.receiver_id <> p_user_id then
    raise exception 'NOT_PARTICIPANT';
  end if;

  if v_trade.cancel_requested_at is null then
    raise exception 'CANCEL_NOT_REQUESTED';
  end if;

  -- 申請者本人は応答できない (= 自演承認/拒否を防ぐ)
  if v_trade.cancel_requested_by = p_user_id then
    raise exception 'IS_REQUESTER';
  end if;

  if p_accept then
    update public.venue_trades
       set status = 'cancelled',
           cancel_requested_at = null,
           cancel_requested_by = null,
           updated_at = now()
     where id = p_trade_id
    returning * into v_trade;
  else
    update public.venue_trades
       set cancel_requested_at = null,
           cancel_requested_by = null,
           updated_at = now()
     where id = p_trade_id
    returning * into v_trade;
  end if;

  return v_trade;
end;
$$;

-- ─────────────────────────────────────────
-- 4. confirm_venue_trade_cancel (2h タイムアウト後の申請者確定)
-- ─────────────────────────────────────────
create or replace function public.confirm_venue_trade_cancel(
  p_trade_id uuid,
  p_user_id  uuid
)
returns public.venue_trades
language plpgsql
security invoker
as $$
declare
  v_trade public.venue_trades;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Critical① ガード: 呼出者本人 (auth.uid()) と p_user_id の一致を強制。
  if auth.uid() is distinct from p_user_id then
    raise exception 'AUTH_MISMATCH';
  end if;

  select * into v_trade
  from public.venue_trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  if v_trade.cancel_requested_at is null then
    raise exception 'CANCEL_NOT_REQUESTED';
  end if;

  -- 申請者本人のみ確定可
  if v_trade.cancel_requested_by is distinct from p_user_id then
    raise exception 'NOT_REQUESTER';
  end if;

  -- 2 時間タイムアウト判定 (interval 比較は timestamptz で安全)
  if v_trade.cancel_requested_at + interval '2 hours' > now() then
    raise exception 'CANCEL_NOT_EXPIRED';
  end if;

  update public.venue_trades
     set status = 'cancelled',
         cancel_requested_at = null,
         cancel_requested_by = null,
         updated_at = now()
   where id = p_trade_id
  returning * into v_trade;

  return v_trade;
end;
$$;

-- ─────────────────────────────────────────
-- 権限付与 (CREATE OR REPLACE は既存 grant を保持するが、明示のため再付与)
-- ─────────────────────────────────────────
grant execute on function public.request_venue_trade_cancel(uuid, uuid)
  to authenticated;
grant execute on function public.withdraw_venue_trade_cancel(uuid, uuid)
  to authenticated;
grant execute on function public.respond_venue_trade_cancel(uuid, uuid, boolean)
  to authenticated;
grant execute on function public.confirm_venue_trade_cancel(uuid, uuid)
  to authenticated;

commit;

-- ====================================================================
-- 適用後確認
-- ====================================================================
--
-- ◆ C1: 4 関数の本体に AUTH_MISMATCH ガードが含まれるか確認
--   select proname,
--          (pg_get_functiondef(oid) ilike '%AUTH_MISMATCH%') as has_guard
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in (
--       'request_venue_trade_cancel',
--       'withdraw_venue_trade_cancel',
--       'respond_venue_trade_cancel',
--       'confirm_venue_trade_cancel'
--     )
--   order by proname;
--   → 期待 (4 行、has_guard = true)
--
-- ◆ C2: 権限確認 (authenticated に execute がある)
--   select grantee, routine_name, privilege_type
--   from information_schema.role_routine_grants
--   where routine_schema = 'public'
--     and routine_name in (
--       'request_venue_trade_cancel',
--       'withdraw_venue_trade_cancel',
--       'respond_venue_trade_cancel',
--       'confirm_venue_trade_cancel'
--     )
--     and grantee = 'authenticated';
--   → 期待 (4 行、privilege_type='EXECUTE')
--
-- ◆ C3: smoke test (SQL Editor)
--   -- 自分の id で申請 → 取り下げ の往復が従来どおり成功するか (回帰確認):
--   select request_venue_trade_cancel('<trade_id>', auth.uid());
--   select withdraw_venue_trade_cancel('<trade_id>', auth.uid());
--   -- なりすまし経路が塞がれたか (別 id を渡すと AUTH_MISMATCH):
--   select request_venue_trade_cancel('<trade_id>', '<other_user_id>');
--   → 期待: 'AUTH_MISMATCH' で失敗
--
-- ====================================================================
-- ロールバック (緊急時: ガードなしの旧定義に戻す)
-- ====================================================================
-- ※ migration_rpc_venue_trade_cancel.sql の 4 関数定義を再適用すれば
--    ガードが外れた状態に戻る (脆弱な状態に戻るため非推奨)。
-- ====================================================================
