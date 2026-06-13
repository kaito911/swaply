-- ====================================================================
-- migration_trigger_venue_trade_system_message.sql
-- 作成日: 2026-06-14
-- 目的  : venue_trades の INSERT / UPDATE(status) を契機に、システム発の
--         (kind='system' / sender_id IS NULL / system_event NOT NULL) な
--         venue_trade_messages を 1 件 INSERT する trigger を作成する。
--
--         発火イベント:
--           INSERT (trade 生成)                 → system_event='trade_created'
--           UPDATE status -> 'partially_confirmed' → system_event='partially_confirmed'
--           UPDATE status -> 'completed'         → system_event='completed'
--           UPDATE status -> 'cancelled'         → system_event='cancelled'
--
--         未読カウントへの影響:
--           送信窓 RPC / 未読 RPC は m.kind = 'user' のみを対象とするため、
--           ここで作る system message は未読数に乗らない。
--
--         権限方針:
--           本 trigger function は SECURITY DEFINER で動くため、
--           B1 のテーブル GRANT が SELECT only でも INSERT できる。
--           ただし trigger function 自体を anon / authenticated / public が
--           直接 CALL する経路は塞ぐ:
--             revoke all on function ... from anon, authenticated, public;
--           (trigger 経由の発火は所有者権限で動くため REVOKE 影響なし)
--
--         sender_id 設計 (Phase 0.5 / Option A 採用):
--           system message は sender_id を NULL にする。
--           B1 の vtm_system_no_sender / vtm_user_requires_sender CHECK と整合。
--           UI 側は kind='system' で吹き出しスタイルを切り替える。
--
-- 関連:
--   - docs/venue_mode_requirements.md §8 (DM 要件 / system_event)
--   - docs/migration_venue_trade_dm_tables.sql (B1: 2 tables + CHECK)
--   - docs/migration_rpc_venue_trade_dm.sql (B2: 4 RPCs)
--   - 既存 accept_venue_hold RPC が venue_trades INSERT する → 本 trigger 発火で
--     'trade_created' system message が自動投入される。
--   - PR4a で導入した partially_confirmed / completed / cancelled 遷移経路に
--     対しても、同 trigger で system_event が記録される。
-- ====================================================================
--
-- 適用前提:
--   - public.venue_trade_messages が存在 (B1 適用済)
--   - public.venue_trades の status enum に
--     'pending' / 'partially_confirmed' / 'completed' / 'cancelled' を含む (PR4a 適用済)
--
-- ====================================================================

begin;

create or replace function public.fn_venue_trade_emit_system_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.venue_trade_messages
      (trade_id, sender_id, kind, body, system_event)
    values
      (new.id, null, 'system', '取引が開始されました', 'trade_created');
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'partially_confirmed' then
      insert into public.venue_trade_messages
        (trade_id, sender_id, kind, body, system_event)
      values
        (new.id, null, 'system', '一方が受け取り確認しました', 'partially_confirmed');
    elsif new.status = 'completed' then
      insert into public.venue_trade_messages
        (trade_id, sender_id, kind, body, system_event)
      values
        (new.id, null, 'system', '取引が完了しました', 'completed');
    elsif new.status = 'cancelled' then
      insert into public.venue_trade_messages
        (trade_id, sender_id, kind, body, system_event)
      values
        (new.id, null, 'system', '取引がキャンセルされました', 'cancelled');
    end if;
  end if;

  return new;
end;
$$;

-- trigger function 自体への直接 CALL を塞ぐ (trigger 発火は所有者権限で動く)
revoke all on function public.fn_venue_trade_emit_system_message() from anon;
revoke all on function public.fn_venue_trade_emit_system_message() from authenticated;
revoke all on function public.fn_venue_trade_emit_system_message() from public;

-- 既存 trigger を drop してから貼り直し (冪等)
drop trigger if exists trg_venue_trade_system_message_ins on public.venue_trades;
drop trigger if exists trg_venue_trade_system_message_upd on public.venue_trades;

create trigger trg_venue_trade_system_message_ins
  after insert on public.venue_trades
  for each row execute function public.fn_venue_trade_emit_system_message();

create trigger trg_venue_trade_system_message_upd
  after update of status on public.venue_trades
  for each row execute function public.fn_venue_trade_emit_system_message();

commit;

-- ====================================================================
-- 適用後確認 (Block C 相当、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ C1: trigger function のメタ確認 (prosecdef / proconfig)
--   select p.proname, p.prosecdef, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname = 'fn_venue_trade_emit_system_message';
--   → 期待: 1 行、prosecdef=t、proconfig に 'search_path=public'
--
-- ◆ C2: trigger function の権限
--   select routine_name, grantee, privilege_type
--   from information_schema.role_routine_grants
--   where routine_schema='public'
--     and routine_name='fn_venue_trade_emit_system_message'
--   order by grantee;
--   → 期待: anon / authenticated / public は EXECUTE を持たない。
--           postgres / service_role は持っていて構わない (所有者経路)。
--
-- ◆ C3: trigger 2 本が venue_trades に bind されているか
--   select tgname, tgenabled, tgtype
--   from pg_trigger
--   where tgrelid = 'public.venue_trades'::regclass
--     and tgname in (
--       'trg_venue_trade_system_message_ins',
--       'trg_venue_trade_system_message_upd'
--     )
--   order by tgname;
--   → 期待: 2 行、tgenabled='O' (origin / 有効)
--
-- ◆ C4: function 本体キーワード確認
--   select
--     prosrc ilike '%trade_created%'         as has_trade_created,
--     prosrc ilike '%partially_confirmed%'   as has_partially_confirmed,
--     prosrc ilike '%completed%'             as has_completed,
--     prosrc ilike '%cancelled%'             as has_cancelled,
--     prosrc ilike '%is distinct from%'      as has_distinct_from,
--     prosrc ilike '%sender_id, kind%'       as has_kind_column
--   from pg_proc
--   where proname = 'fn_venue_trade_emit_system_message';
--   → 期待: 全列 t
--
-- ====================================================================
-- ロールバック (緊急時、trigger / function 共に drop)
-- ====================================================================
-- ※ B1 (tables) を rollback する前に必ず本 trigger を drop すること。
--    そうしないと B1 drop 時に dangling trigger 経路が残る。
--
-- begin;
-- drop trigger if exists trg_venue_trade_system_message_upd on public.venue_trades;
-- drop trigger if exists trg_venue_trade_system_message_ins on public.venue_trades;
-- drop function if exists public.fn_venue_trade_emit_system_message();
-- commit;
