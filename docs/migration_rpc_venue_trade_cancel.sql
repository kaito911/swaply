-- ====================================================================
-- migration_rpc_venue_trade_cancel.sql
-- 作成日: 2026-06-21
-- 目的  : venue_trade のキャンセル申請モデルを実装する 4 RPC を追加する。
--
--         関連列: venue_trades.cancel_requested_at / cancel_requested_by
--           (docs/migration_venue_trades_cancel_request.sql で追加)
--
-- 関数一覧:
--   1. request_venue_trade_cancel(p_trade_id, p_user_id)
--        当事者の一方がキャンセル申請する。pending かつ未申請のみ可。
--   2. withdraw_venue_trade_cancel(p_trade_id, p_user_id)
--        申請者本人が取り下げる (pending に戻る)。
--   3. respond_venue_trade_cancel(p_trade_id, p_user_id, p_accept)
--        非申請側が承認 (cancelled) / 拒否 (pending に戻す)。
--   4. confirm_venue_trade_cancel(p_trade_id, p_user_id)
--        申請者本人が「相手 2h 無応答」の確定権を行使、cancelled に倒す。
--
-- 設計方針:
--   - SECURITY INVOKER (デフォルト) を使う。RLS の "Participants can manage their venue trades"
--     により呼出者が当事者でなければ SELECT/UPDATE が許可されない。
--     関数内のロジックでは p_user_id を再検証し、auth.uid() との突合は呼出側 (lib/supabase.ts)
--     の責務とする (既存の cancelVenueHold / declineVenueHold 同様の設計)。
--   - SELECT ... FOR UPDATE で行ロック、競合 (同時申請 / 取り下げ ⇄ 応答 等) を防ぐ。
--   - エラーは RAISE EXCEPTION で文字列を返し、UI 側 (Alert.alert) が解釈する。
--     既存 accept_venue_hold RPC のパターンに揃える。
--   - 各関数は更新後の venue_trades 行を 1 件返す (lib 側で setTrade に直接渡せる)。
--
-- エラー一覧 (各関数で使用):
--   AUTH_REQUIRED         — p_user_id NULL
--   TRADE_NOT_FOUND       — trade 行未発見
--   NOT_PARTICIPANT       — p_user_id が proposer_id / receiver_id どちらでもない
--   TRADE_NOT_PENDING:<status>     — status が pending 以外 (request 限定)
--   CANCEL_ALREADY_REQUESTED       — 既に申請済 (request 限定)
--   CANCEL_NOT_REQUESTED  — 申請が無い状態で withdraw / respond / confirm
--   NOT_REQUESTER         — withdraw / confirm を申請者以外が呼んだ
--   IS_REQUESTER          — respond を申請者本人が呼んだ
--   CANCEL_NOT_EXPIRED    — confirm を 2h 経過前に呼んだ
--
-- ⚠️ 適用順序:
--   - 先に migration_venue_trades_cancel_request.sql を本番適用 (列追加)
--   - 本 migration を本番適用 (RPC 4 つを CREATE OR REPLACE)
--   - C1 / C2 で関数存在確認
--   - その後にコード commit を main へ merge → push
--
-- 関連:
--   - 列 DDL: docs/migration_venue_trades_cancel_request.sql
--   - 連動 コード: lib/supabase.ts (requestVenueTradeCancel 等 4 関数)
--                  app/venue/trade/[id].tsx (キャンセル CTA)
--                  supabase/functions/notify-on-event/index.ts (UPDATE Push 2 種)
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
-- 権限付与 (authenticated のみ実行可、anon は不可)
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
-- ◆ C1: 4 関数の存在確認
--   select proname, pg_get_function_identity_arguments(oid) as args
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in (
--       'request_venue_trade_cancel',
--       'withdraw_venue_trade_cancel',
--       'respond_venue_trade_cancel',
--       'confirm_venue_trade_cancel'
--     )
--   order by proname;
--   → 期待 (4 行、args が p_trade_id uuid, p_user_id uuid (respond は + p_accept boolean))
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
-- ◆ C3: smoke test (任意、SQL Editor で実機の trade を 1 件選んで実行)
--   -- 申請 → 取り下げ の往復で行が想定どおり書き換わるか:
--   select request_venue_trade_cancel('<trade_id>', '<user_id>');
--   select withdraw_venue_trade_cancel('<trade_id>', '<user_id>');
--   select cancel_requested_at, cancel_requested_by from public.venue_trades where id='<trade_id>';
--   → 期待: 申請後は両列 NOT NULL、取り下げ後は両列 NULL
--
-- ====================================================================
-- ロールバック (緊急時、申請中の trade は残る = 列値はそのまま、関数のみ削除)
-- ====================================================================
-- ※ 本 migration を rollback すると UI の 4 操作が機能停止する。
--   ただし既に cancel_requested_at が NOT NULL の trade は残るため、
--   DB 直接 UPDATE で NULL に戻すか、列 DDL もロールバックする (列ごと drop)。
--
-- begin;
-- drop function if exists public.confirm_venue_trade_cancel(uuid, uuid);
-- drop function if exists public.respond_venue_trade_cancel(uuid, uuid, boolean);
-- drop function if exists public.withdraw_venue_trade_cancel(uuid, uuid);
-- drop function if exists public.request_venue_trade_cancel(uuid, uuid);
-- commit;
