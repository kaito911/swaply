-- ====================================================================
-- migration_venue_trade_dm_tables.sql
-- 作成日: 2026-06-14
-- 目的  : PR5 / venue_trade 専用 DM 用の 2 テーブルを新規作成する。
--           - public.venue_trade_messages : 取引メッセージ (user / system)
--           - public.venue_trade_reads    : 当事者ごとの既読位置 (last_read_at)
--
--         RLS 方針 (Phase 0.5):
--           両表とも SELECT policy のみ作成する。
--           INSERT / UPDATE / DELETE policy は意図的に作らない。
--           ユーザ INSERT は send_venue_trade_message RPC、
--           システム INSERT は trigger fn_venue_trade_emit_system_message から
--           のみ行う。RPC / trigger は SECURITY DEFINER で RLS をバイパスする。
--
--         テーブル GRANT 方針 (Phase 0.5):
--           revoke all from anon, authenticated, public
--           grant select to authenticated
--           クライアントから直接 INSERT/UPDATE/DELETE できないようにする。
--           送信窓判定の RPC 経路を二重防御する目的。
--
--         整合性 CHECK 制約:
--           - vtm_user_requires_sender : kind='user' なら sender_id NOT NULL
--           - vtm_system_no_sender     : kind='system' なら sender_id NULL
--           - vtm_system_event_match   : kind と system_event の整合
--                                        kind='system' ↔ system_event NOT NULL
--                                        kind='user'   ↔ system_event NULL
--           - vtm_body_len             : 1 <= length(body) <= 2000
--
--         sender_id FK 方針:
--           on delete 句なし (=NO ACTION)。SET NULL は vtm_user_requires_sender
--           CHECK と衝突する。Swaply の退会は profiles tombstone で id 維持の
--           ため通常退会で削除されない。手動 DELETE は運用禁止。
--
-- 関連:
--   - docs/venue_mode_requirements.md §8 (DM 要件)
--   - docs/migration_rpc_venue_trade_dm.sql (B2: 4 RPCs)
--   - docs/migration_trigger_venue_trade_system_message.sql (B3: trigger)
--   - 既存 venue_trades RLS "Participants can manage their venue trades" (FOR ALL)
--     が非 participant の trade 行可視を既に塞いでいるため、本 PR は messages /
--     reads 側のみ追加で塞ぐ。
-- ====================================================================
--
-- 適用前提:
--   - public.venue_trades が存在 (PR4a / PR4b 適用済)
--   - public.profiles が tombstone 前提で id を物理削除しない運用
--   - 既存 venue_trade_messages / venue_trade_reads が無い
--
-- ====================================================================

begin;

-- ============ messages ============
create table public.venue_trade_messages (
  id           uuid primary key default gen_random_uuid(),
  trade_id     uuid not null references public.venue_trades(id) on delete cascade,
  sender_id    uuid          references public.profiles(id),
  kind         text not null,
  body         text not null,
  system_event text,
  created_at   timestamptz not null default now(),
  constraint vtm_kind_values
    check (kind in ('user', 'system')),
  constraint vtm_user_requires_sender
    check (kind <> 'user'   or sender_id   is not null),
  constraint vtm_system_no_sender
    check (kind <> 'system' or sender_id   is null),
  constraint vtm_system_event_match
    check ((kind = 'system' and system_event is not null)
        or (kind = 'user'   and system_event is null)),
  constraint vtm_body_len
    check (length(body) between 1 and 2000)
);

create index venue_trade_messages_trade_created_idx
  on public.venue_trade_messages (trade_id, created_at desc);

create index venue_trade_messages_sender_idx
  on public.venue_trade_messages (sender_id);

-- ============ reads ============
create table public.venue_trade_reads (
  trade_id     uuid not null references public.venue_trades(id) on delete cascade,
  user_id      uuid not null references public.profiles(id)     on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (trade_id, user_id)
);

-- ============ RLS ============
alter table public.venue_trade_messages enable row level security;
alter table public.venue_trade_reads    enable row level security;

-- messages: SELECT のみ (participant 限定)
-- INSERT/UPDATE/DELETE policy は意図的に作らない。
create policy "Participants can read venue trade messages"
  on public.venue_trade_messages
  for select
  using (
    exists (
      select 1 from public.venue_trades t
      where t.id = venue_trade_messages.trade_id
        and (t.proposer_id = auth.uid() or t.receiver_id = auth.uid())
    )
  );

-- reads: SELECT のみ、自分の行 + participant のみ
-- upsert は mark_venue_trade_thread_read RPC からのみ。
create policy "User can read own venue trade reads"
  on public.venue_trade_reads
  for select
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.venue_trades t
      where t.id = venue_trade_reads.trade_id
        and (t.proposer_id = auth.uid() or t.receiver_id = auth.uid())
    )
  );

-- ============ テーブル権限 (Phase 0.5: SELECT only) ============
revoke all on public.venue_trade_messages from anon, authenticated, public;
grant  select on public.venue_trade_messages to authenticated;

revoke all on public.venue_trade_reads from anon, authenticated, public;
grant  select on public.venue_trade_reads to authenticated;
-- INSERT/UPDATE/DELETE は SECURITY DEFINER の RPC / trigger からのみ。
-- authenticated 直接 DML は不可。

commit;

-- ====================================================================
-- 適用後確認 (Block C 相当、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ C1: テーブル / 列 / nullable
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='venue_trade_messages'
--   order by ordinal_position;
--   → 期待: id/trade_id/sender_id/kind/body/system_event/created_at の 7 列
--           sender_id, system_event は is_nullable='YES'
--           kind, body は is_nullable='NO'
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='venue_trade_reads'
--   order by ordinal_position;
--   → 期待: trade_id/user_id/last_read_at/updated_at の 4 列
--
-- ◆ C2: CHECK 制約 (vtm_*)
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.venue_trade_messages'::regclass
--     and contype = 'c'
--   order by conname;
--   → 期待: vtm_body_len / vtm_kind_values / vtm_system_event_match /
--           vtm_system_no_sender / vtm_user_requires_sender の 5 件
--
-- ◆ C3: RLS 有効化と policy が SELECT のみ
--   select relname, relrowsecurity
--   from pg_class
--   where relname in ('venue_trade_messages','venue_trade_reads');
--   → 期待: 両方 relrowsecurity = t
--
--   select tablename, policyname, cmd
--   from pg_policies
--   where schemaname='public'
--     and tablename in ('venue_trade_messages','venue_trade_reads')
--   order by tablename, policyname;
--   → 期待: 各テーブル 1 行ずつ、cmd = 'SELECT' のみ
--
-- ◆ C4: テーブル権限が SELECT のみ
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema='public'
--     and table_name in ('venue_trade_messages','venue_trade_reads')
--     and grantee in ('anon','authenticated','public')
--   order by table_name, grantee, privilege_type;
--   → 期待: authenticated に SELECT のみ。anon / public は出ない。
--           postgres / service_role は別途すべて持っていて構わない。
--
-- ◆ C5: index
--   select indexname, indexdef
--   from pg_indexes
--   where schemaname='public'
--     and tablename='venue_trade_messages'
--   order by indexname;
--   → 期待: venue_trade_messages_pkey
--           venue_trade_messages_sender_idx
--           venue_trade_messages_trade_created_idx
--
-- ====================================================================
-- ロールバック (緊急時、DM 履歴は完全消失する)
-- ====================================================================
-- ※ B2 (RPC) と B3 (trigger) を先に drop してから本 rollback を流す。
--    そうしないと trigger からの INSERT 経路が dangling になる。
--
-- begin;
-- drop policy if exists "Participants can read venue trade messages"
--   on public.venue_trade_messages;
-- drop policy if exists "User can read own venue trade reads"
--   on public.venue_trade_reads;
-- drop table if exists public.venue_trade_reads;
-- drop table if exists public.venue_trade_messages;
-- commit;
