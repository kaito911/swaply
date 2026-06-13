-- ====================================================================
-- migration_rpc_venue_trade_dm.sql
-- 作成日: 2026-06-14
-- 目的  : PR5 / venue_trade DM 用 RPC を 4 本まとめて定義する。
--           (1) send_venue_trade_message       : 送信窓 allowlist でユーザ送信
--           (2) mark_venue_trade_thread_read   : 既読位置の upsert
--           (3) get_venue_trade_unread_count   : グローバル未読数 (会場タブ用)
--           (4) get_venue_trade_unread_counts  : per-trade 未読 (N+1 回避)
--
--         共通方針:
--           - SECURITY DEFINER + search_path=public 固定
--           - revoke all from anon, public → grant execute to authenticated
--           - venue_trade_messages / venue_trade_reads への直 DML は
--             本 RPC からのみ (テーブル GRANT は SELECT only / RLS は SELECT only)
--
--         送信窓 allowlist (Phase 0.5 / P0):
--           pending              → 送信可
--           partially_confirmed  → 送信可
--           completed            → SEND_WINDOW_CLOSED
--           cancelled            → TRADE_CANCELLED
--           その他 / 未知        → SEND_WINDOW_CLOSED (fail-closed)
--
--         未読定義 (Phase 0.5 / P0):
--           kind = 'user'
--           AND sender_id <> auth.uid()
--           AND (r.last_read_at is null or m.created_at > r.last_read_at)
--           system message は未読カウント外。
--
-- 関連:
--   - docs/venue_mode_requirements.md §8 (DM 要件 / 送信窓 / 未読)
--   - docs/migration_venue_trade_dm_tables.sql (B1: 2 tables)
--   - docs/migration_trigger_venue_trade_system_message.sql (B3: trigger)
--   - 既存 venue_trades RLS "Participants can manage their venue trades" (FOR ALL)
--     により非 participant の trade 行可視は既に塞がれている。
-- ====================================================================
--
-- 適用前提:
--   - public.venue_trade_messages / venue_trade_reads が存在 (B1 適用済)
--   - public.venue_trades の status enum に
--     'pending' / 'partially_confirmed' / 'completed' / 'cancelled' を含む (PR4a 適用済)
--
-- ====================================================================

-- ====================================================================
-- (1) send_venue_trade_message
-- ====================================================================
create or replace function public.send_venue_trade_message(
  p_trade_id uuid,
  p_body     text
)
returns public.venue_trade_messages
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_trade  public.venue_trades;
  v_msg    public.venue_trade_messages;
  v_body   text := btrim(coalesce(p_body, ''));
begin
  -- (a) 認証
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- (b) body 長さ
  if length(v_body) = 0 then
    raise exception 'BODY_EMPTY';
  end if;
  if length(v_body) > 2000 then
    raise exception 'BODY_TOO_LONG';
  end if;

  -- (c) trade 取得 (FOR SHARE: 同時送信は許す、status 変更は直列化)
  select * into v_trade
  from public.venue_trades
  where id = p_trade_id
  for share;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  -- (d) participant チェック
  if v_trade.proposer_id <> v_uid and v_trade.receiver_id <> v_uid then
    raise exception 'NOT_PARTICIPANT';
  end if;

  -- (e) 送信窓 allowlist (Phase 0.5 / P0)
  if v_trade.status = 'pending' or v_trade.status = 'partially_confirmed' then
    null;  -- 送信可
  elsif v_trade.status = 'completed' then
    raise exception 'SEND_WINDOW_CLOSED';
  elsif v_trade.status = 'cancelled' then
    raise exception 'TRADE_CANCELLED';
  else
    -- 未知 status は fail-closed
    raise exception 'SEND_WINDOW_CLOSED';
  end if;

  -- (f) INSERT (kind='user' / system_event=NULL)
  insert into public.venue_trade_messages (trade_id, sender_id, kind, body)
  values (p_trade_id, v_uid, 'user', v_body)
  returning * into v_msg;

  return v_msg;
end;
$$;

revoke all on function public.send_venue_trade_message(uuid, text) from anon;
revoke all on function public.send_venue_trade_message(uuid, text) from public;
grant execute on function public.send_venue_trade_message(uuid, text) to authenticated;


-- ====================================================================
-- (2) mark_venue_trade_thread_read
-- ====================================================================
create or replace function public.mark_venue_trade_thread_read(
  p_trade_id uuid
)
returns public.venue_trade_reads
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.venue_trade_reads;
begin
  -- (a) 認証
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- (b) participant チェック
  if not exists (
    select 1 from public.venue_trades t
    where t.id = p_trade_id
      and (t.proposer_id = v_uid or t.receiver_id = v_uid)
  ) then
    raise exception 'NOT_PARTICIPANT';
  end if;

  -- (c) upsert
  insert into public.venue_trade_reads as r (trade_id, user_id, last_read_at, updated_at)
  values (p_trade_id, v_uid, now(), now())
  on conflict (trade_id, user_id) do update
    set last_read_at = excluded.last_read_at,
        updated_at   = excluded.updated_at
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.mark_venue_trade_thread_read(uuid) from anon;
revoke all on function public.mark_venue_trade_thread_read(uuid) from public;
grant execute on function public.mark_venue_trade_thread_read(uuid) to authenticated;


-- ====================================================================
-- (3) get_venue_trade_unread_count  -- グローバル (会場タブバッジ)
-- ====================================================================
create or replace function public.get_venue_trade_unread_count()
returns integer
language sql
security definer
set search_path to 'public'
stable
as $$
  select coalesce(count(*), 0)::int
  from public.venue_trade_messages m
  join public.venue_trades t on t.id = m.trade_id
  left join public.venue_trade_reads r
    on r.trade_id = m.trade_id
   and r.user_id  = auth.uid()
  where (t.proposer_id = auth.uid() or t.receiver_id = auth.uid())
    and m.kind = 'user'
    and m.sender_id <> auth.uid()
    and (r.last_read_at is null or m.created_at > r.last_read_at);
$$;

revoke all on function public.get_venue_trade_unread_count() from anon;
revoke all on function public.get_venue_trade_unread_count() from public;
grant execute on function public.get_venue_trade_unread_count() to authenticated;


-- ====================================================================
-- (4) get_venue_trade_unread_counts  -- per-trade 一括 (N+1 回避)
-- ====================================================================
create or replace function public.get_venue_trade_unread_counts()
returns table (trade_id uuid, unread_count integer)
language sql
security definer
set search_path to 'public'
stable
as $$
  select m.trade_id, count(*)::int as unread_count
  from public.venue_trade_messages m
  join public.venue_trades t on t.id = m.trade_id
  left join public.venue_trade_reads r
    on r.trade_id = m.trade_id
   and r.user_id  = auth.uid()
  where (t.proposer_id = auth.uid() or t.receiver_id = auth.uid())
    and m.kind = 'user'
    and m.sender_id <> auth.uid()
    and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by m.trade_id;
$$;

revoke all on function public.get_venue_trade_unread_counts() from anon;
revoke all on function public.get_venue_trade_unread_counts() from public;
grant execute on function public.get_venue_trade_unread_counts() to authenticated;


-- ====================================================================
-- 適用後確認 (Block C 相当、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ C1: 4 関数のメタ確認 (prosecdef / proconfig)
--   select p.proname, p.prosecdef, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in (
--       'send_venue_trade_message',
--       'mark_venue_trade_thread_read',
--       'get_venue_trade_unread_count',
--       'get_venue_trade_unread_counts'
--     )
--   order by p.proname;
--   → 期待: 4 行、prosecdef=t、proconfig に 'search_path=public'
--
-- ◆ C2: 4 関数の権限
--   select routine_name, grantee, privilege_type
--   from information_schema.role_routine_grants
--   where routine_schema='public'
--     and routine_name in (
--       'send_venue_trade_message',
--       'mark_venue_trade_thread_read',
--       'get_venue_trade_unread_count',
--       'get_venue_trade_unread_counts'
--     )
--   order by routine_name, grantee;
--   → 期待: 各関数で authenticated / postgres / service_role が EXECUTE。
--           anon / public は出ない。
--
-- ◆ C3: send_venue_trade_message 本体キーワード確認
--   select
--     prosrc ilike '%SEND_WINDOW_CLOSED%'   as has_send_window_closed,
--     prosrc ilike '%TRADE_CANCELLED%'      as has_trade_cancelled,
--     prosrc ilike '%NOT_PARTICIPANT%'      as has_not_participant,
--     prosrc ilike '%BODY_EMPTY%'           as has_body_empty,
--     prosrc ilike '%BODY_TOO_LONG%'        as has_body_too_long,
--     prosrc ilike '%AUTH_REQUIRED%'        as has_auth_required,
--     prosrc ilike '%for share%'            as has_for_share
--   from pg_proc
--   where proname = 'send_venue_trade_message';
--   → 期待: 全列 t
--
-- ====================================================================
-- ロールバック (緊急時、4 関数とも drop)
-- ====================================================================
-- ※ trigger fn_venue_trade_emit_system_message は別ファイル管理。
--    本 rollback は RPC のみ。
--
-- drop function if exists public.get_venue_trade_unread_counts();
-- drop function if exists public.get_venue_trade_unread_count();
-- drop function if exists public.mark_venue_trade_thread_read(uuid);
-- drop function if exists public.send_venue_trade_message(uuid, text);
