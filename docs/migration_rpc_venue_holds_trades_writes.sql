-- ====================================================================
-- migration_rpc_venue_holds_trades_writes.sql
-- 作成日: 2026-07-09
-- 目的  : Critical③ の ③-A (非破壊)。venue_holds / venue_trades への
--         アプリ直接 write を、SECURITY DEFINER RPC 4種に集約する。
--
-- 背景 (Critical③):
--   venue_holds / venue_trades の RLS は現在
--     "Participants can manage ..." FOR ALL
--       using/with check (auth.uid()=proposer_id or auth.uid()=receiver_id)
--   であり、当事者なら RPC を通さず INSERT/UPDATE/DELETE を直接行使でき、
--   二者確認の状態機械 (対称 confirm / hold の pending 遷移) をバイパスできる。
--
-- ③ の全体像 (3 段階、本ファイルは ③-A のみ):
--   ③-A: 直接 write を DEFINER RPC 4種に集約 (本ファイル + lib 書換)。非破壊。
--        RLS は FOR ALL のまま = 新旧クライアント両方が動作する。
--   ③-B: 既存 venue_trade_cancel 4 RPC を INVOKER→DEFINER 化 (要 prod 現行定義)。
--        ※ RLS を絞ると INVOKER の cancel RPC が書けなくなるための前提整備。
--   ③-C: RLS を "SELECT only" に絞り、authenticated から write GRANT を剥奪 (破壊的)。
--        全クライアントが RPC 版に更新済であることを確認してから適用。
--
-- 本ファイルの 4 RPC (すべて SECURITY DEFINER + search_path 固定):
--   1. create_venue_hold      ← createVenueHold  (INSERT)
--   2. decline_venue_hold     ← declineVenueHold (UPDATE→declined)
--   3. cancel_venue_hold      ← cancelVenueHold  (UPDATE→cancelled)
--   4. confirm_venue_trade    ← confirmVenueTrade(対称確定 UPDATE)
--
-- 設計原則 (①②の教訓を継承):
--   - actor は常に auth.uid()。クライアントの自己申告 (proposer_id / role / user_id) は
--     信用しない。create は proposer_id=auth.uid() 固定、confirm は role をサーバ導出。
--   - 既存の当事者/状態ガードは SQL 内に移植し「緩めない」。
--   - expires_at はサーバ側計算 (lib/venueExpiry.computeVenueExpiry の移植:
--     event_date の JST 23:59:59 → UTC)。クライアント改竄を排除。
--   - SECURITY DEFINER のため search_path を public に固定 (関数乗っ取り対策)。
--   - grant execute は authenticated のみ (anon 不可)。
--
-- ★挙動の変更点 (要認識):
--   decline / cancel は旧 JS では「status<>pending 等で 0 行更新 = 無言成功 (void)」
--   だったが、本 RPC では他の venue RPC 同様に明示 raise (HOLD_NOT_PENDING 等) に統一する。
--   → 古いボタンの stale tap で Alert が出る。UI は error.message を解釈する既存様式に沿う。
--   confirm は旧 JS の冪等性 (終端/自分側確定済は no-op) をそのまま維持する。
--
-- 適用 (Kが手で実行):
--   - 本ファイルを本番適用 (CREATE OR REPLACE、追加/冪等、RLS/GRANT は不変)。
--   - その後に lib/supabase.ts の 4 関数を RPC 呼び出しに差し替えたビルドを配信。
--   ※ RPC を先に本番へ入れてから app 更新すること (逆順だと新 app が RPC 不在で失敗)。
--
-- アプリ影響: lib/supabase.ts 内部のみ (シグネチャ維持)。画面 (app/venue/*) は無変更。
-- ====================================================================

begin;

-- ─────────────────────────────────────────
-- 1. create_venue_hold  (← createVenueHold)
--    proposer_id = auth.uid() 固定。expires_at をサーバ計算。
-- ─────────────────────────────────────────
create or replace function public.create_venue_hold(
  p_venue_id           uuid,
  p_receiver_id        uuid,
  p_proposer_card      text,
  p_receiver_card      text,
  p_supply_post_id     uuid    default null,
  p_proposer_image_url text    default null
)
returns public.venue_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor      uuid := auth.uid();
  v_event_date date;
  v_expires_at timestamptz;
  v_hold       public.venue_holds;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- expires_at = event_date の JST 23:59:59 → UTC (computeVenueExpiry の移植)
  select event_date into v_event_date
  from public.venues
  where id = p_venue_id;

  if not found then
    raise exception 'VENUE_NOT_FOUND';
  end if;

  v_expires_at := (v_event_date + time '23:59:59') at time zone 'Asia/Tokyo';

  insert into public.venue_holds (
    venue_id, proposer_id, receiver_id,
    proposer_card, receiver_card, supply_post_id,
    proposer_image_url, expires_at
  ) values (
    p_venue_id, v_actor, p_receiver_id,
    p_proposer_card, p_receiver_card, p_supply_post_id,
    p_proposer_image_url, v_expires_at
  )
  returning * into v_hold;

  return v_hold;
end;
$$;

-- ─────────────────────────────────────────
-- 2. decline_venue_hold  (← declineVenueHold)
--    受信者本人 + pending のみ。→ declined。
-- ─────────────────────────────────────────
create or replace function public.decline_venue_hold(
  p_hold_id uuid
)
returns public.venue_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_hold  public.venue_holds;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_hold
  from public.venue_holds
  where id = p_hold_id
  for update;

  if not found then
    raise exception 'HOLD_NOT_FOUND';
  end if;

  -- 既存ガード移植 (緩めない): 受信者本人のみ
  if v_hold.receiver_id <> v_actor then
    raise exception 'NOT_RECEIVER';
  end if;
  -- 既存ガード移植: pending のみ
  if v_hold.status <> 'pending' then
    raise exception 'HOLD_NOT_PENDING:%', v_hold.status;
  end if;

  update public.venue_holds
     set status = 'declined', updated_at = now()
   where id = p_hold_id
  returning * into v_hold;

  return v_hold;
end;
$$;

-- ─────────────────────────────────────────
-- 3. cancel_venue_hold  (← cancelVenueHold)
--    申請者本人 + pending のみ。→ cancelled。
-- ─────────────────────────────────────────
create or replace function public.cancel_venue_hold(
  p_hold_id uuid
)
returns public.venue_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_hold  public.venue_holds;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_hold
  from public.venue_holds
  where id = p_hold_id
  for update;

  if not found then
    raise exception 'HOLD_NOT_FOUND';
  end if;

  -- 既存ガード移植 (緩めない): 申請者本人のみ
  if v_hold.proposer_id <> v_actor then
    raise exception 'NOT_PROPOSER';
  end if;
  -- 既存ガード移植: pending のみ
  if v_hold.status <> 'pending' then
    raise exception 'HOLD_NOT_PENDING:%', v_hold.status;
  end if;

  update public.venue_holds
     set status = 'cancelled', updated_at = now()
   where id = p_hold_id
  returning * into v_hold;

  return v_hold;
end;
$$;

-- ─────────────────────────────────────────
-- 4. confirm_venue_trade  (← confirmVenueTrade)
--    role はサーバ側で auth.uid() から導出 (クライアント role を廃止)。
--    対称確定: 片方 → partially_confirmed、両方 → completed。冪等維持。
-- ─────────────────────────────────────────
create or replace function public.confirm_venue_trade(
  p_trade_id uuid
)
returns public.venue_trades
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_trade       public.venue_trades;
  v_is_proposer boolean;
  v_my_ts       timestamptz;
  v_other_ts    timestamptz;
  v_new_status  text;
  v_now         timestamptz := now();
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_trade
  from public.venue_trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  -- role をサーバ導出 (判断点2: クライアントの自己申告 role を信用しない)
  if v_trade.proposer_id = v_actor then
    v_is_proposer := true;
  elsif v_trade.receiver_id = v_actor then
    v_is_proposer := false;
  else
    raise exception 'NOT_PARTICIPANT';
  end if;

  -- 既に終端状態 → no-op (冪等、二重押し / 古いタップ吸収)
  if v_trade.status in ('completed', 'cancelled') then
    return v_trade;
  end if;

  -- 自分側 / 相手側 timestamp を role で振り分け
  if v_is_proposer then
    v_my_ts    := v_trade.proposer_confirmed_at;
    v_other_ts := v_trade.receiver_confirmed_at;
  else
    v_my_ts    := v_trade.receiver_confirmed_at;
    v_other_ts := v_trade.proposer_confirmed_at;
  end if;

  -- 自分側が既に確定済 → no-op (冪等)
  if v_my_ts is not null then
    return v_trade;
  end if;

  -- 相手側 timestamp の有無で派生 status を決定
  if v_other_ts is not null then
    v_new_status := 'completed';
  else
    v_new_status := 'partially_confirmed';
  end if;

  -- UPDATE 側でも非終端状態を再強制 (race 防御)。role に応じ自分側 timestamp のみ書く。
  update public.venue_trades
     set proposer_confirmed_at =
           case when v_is_proposer then v_now else proposer_confirmed_at end,
         receiver_confirmed_at =
           case when v_is_proposer then receiver_confirmed_at else v_now end,
         status = v_new_status,
         completed_at =
           case when v_new_status = 'completed' then v_now else completed_at end,
         updated_at = v_now
   where id = p_trade_id
     and status in ('pending', 'partially_confirmed')
  returning * into v_trade;

  return v_trade;
end;
$$;

-- ─────────────────────────────────────────
-- 権限付与 (authenticated のみ、anon 不可)
--
-- ★ PostgreSQL は関数作成時に自動で PUBLIC へ EXECUTE を付与するため、
--   grant to authenticated だけでは anon も呼べてしまう (AUTH_REQUIRED ガードで
--   実害はないが「anon 不可」の実態と揃えるため)。PUBLIC から revoke してから
--   authenticated へ明示付与する。
-- ─────────────────────────────────────────
revoke execute on function public.create_venue_hold(uuid, uuid, text, text, uuid, text)
  from public;
revoke execute on function public.decline_venue_hold(uuid)
  from public;
revoke execute on function public.cancel_venue_hold(uuid)
  from public;
revoke execute on function public.confirm_venue_trade(uuid)
  from public;

grant execute on function public.create_venue_hold(uuid, uuid, text, text, uuid, text)
  to authenticated;
grant execute on function public.decline_venue_hold(uuid)
  to authenticated;
grant execute on function public.cancel_venue_hold(uuid)
  to authenticated;
grant execute on function public.confirm_venue_trade(uuid)
  to authenticated;

commit;

-- ====================================================================
-- 適用後確認
-- ====================================================================
--
-- ◆ C1: 4 関数の存在 + DEFINER + search_path 確認
--   select proname, prosecdef as is_definer, proconfig
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in ('create_venue_hold','decline_venue_hold',
--                     'cancel_venue_hold','confirm_venue_trade')
--   order by proname;
--   → 期待 (4 行、is_definer=true、proconfig に search_path=public)
--
-- ◆ C2: 権限 (authenticated に execute)
--   select routine_name, grantee, privilege_type
--   from information_schema.role_routine_grants
--   where routine_schema='public'
--     and routine_name in ('create_venue_hold','decline_venue_hold',
--                          'cancel_venue_hold','confirm_venue_trade')
--     and grantee='authenticated';
--   → 期待 (4 行、EXECUTE)
--
-- ◆ C3: expires_at の JST 整合 smoke (event_date のある venue で)
--   select (date '2026-06-13' + time '23:59:59') at time zone 'Asia/Tokyo';
--   → 期待: 2026-06-13 14:59:59+00 (= JST 23:59:59)
--
-- ◆ C4: 回帰 (アプリ経由) — 供給板→hold作成→accept→対称confirm→completed、
--        decline / cancel、および直接 write が「まだ FOR ALL のため」通ることを確認
--        (③-A は非破壊。直接 write の遮断は ③-C で実施)。
--
-- ====================================================================
-- ロールバック (関数削除。lib を旧 直接 write 版に戻すこととセット)
-- ====================================================================
-- begin;
--   drop function if exists public.create_venue_hold(uuid, uuid, text, text, uuid, text);
--   drop function if exists public.decline_venue_hold(uuid);
--   drop function if exists public.cancel_venue_hold(uuid);
--   drop function if exists public.confirm_venue_trade(uuid);
-- commit;
-- ====================================================================
