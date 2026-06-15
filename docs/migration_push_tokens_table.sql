-- ====================================================================
-- migration_push_tokens_table.sql
-- 作成日: 2026-06-16
-- 目的  : Expo Push Token 保存テーブル public.push_tokens を新規作成する。
--
--         Push 通知 PR1 (token 保存基盤) の DB 側。Push 送信側 (Edge Function /
--         Database Webhooks / 各イベント trigger) は本ファイル適用後に PR2 以降で
--         着手する。
--
-- スキーマ:
--   - 1 ユーザー複数端末を許容 (iPhone + iPad / 機種変更時の旧端末等)
--   - 同 user × 同 token の重複は unique 制約で防止 (upsert キー)
--   - profiles(id) ON DELETE CASCADE: profile 物理削除時は token も削除
--     (tombstone (PII NULL 化) では CASCADE 発火しないため通常退会で消えない)
--   - updated_at は BEFORE UPDATE trigger で自動更新
--     (既存の共通関数 public.update_updated_at_column() を再利用、
--      wanted_cards / reports / shelf_items 等と同じパターン)
--
-- RLS:
--   - authenticated ユーザは自分の token のみ SELECT / INSERT / UPDATE / DELETE
--   - anon / public は全権限を持たない
--   - service_role は RLS bypass、Edge Function (send-push、PR3) から全 token 読取可
--   - INSERT WITH CHECK で他人になりすました user_id での INSERT を防ぐ
--
-- 関連:
--   - 連携 helper: lib/pushNotifications.ts (本 PR1 内)
--   - 連携 plugin: app.json (expo-notifications plugin、android.package)
--   - 設計レポート: 2026-06-16 セッション「Push 通知実装設計 調査レポート」
--   - 後続: PR2 (許可フロー UI) / PR3 (send-push Edge Function) / PR4-5 (イベント連携)
-- ====================================================================
--
-- 適用前提:
--   - 既存 push_tokens テーブルが無いこと (Block A1 で確認)
--   - profiles テーブルが存在 (id PK)
--   - auth.uid() が利用可能 (Supabase Auth 標準)
--
-- ====================================================================

begin;

-- ============ テーブル ============
create table public.push_tokens (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  expo_push_token text        not null,
  platform        text        not null,
  device_id       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint push_tokens_platform_check
    check (platform in ('ios', 'android')),
  constraint push_tokens_user_token_unique
    unique (user_id, expo_push_token)
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

-- ============ updated_at 自動更新トリガー ============
-- 既存共通関数 public.update_updated_at_column() を再利用 (wanted_cards 等と同じパターン)。
-- INSERT 時は列 default の now() が、UPDATE 時は本トリガーが updated_at を更新する。
-- Supabase client の upsert(onConflict) は内部的に INSERT ... ON CONFLICT DO UPDATE になるため、
-- conflict 時は UPDATE 経路を通り本トリガーが発火する。helper 側で updated_at を渡す必要はない。
create trigger update_push_tokens_updated_at
  before update on public.push_tokens
  for each row
  execute function public.update_updated_at_column();

-- ============ RLS ============
alter table public.push_tokens enable row level security;

-- (1) 自分の token のみ SELECT
create policy "User can read own push tokens"
  on public.push_tokens
  for select
  using (user_id = auth.uid());

-- (2) 自分宛の token のみ INSERT (なりすまし防止)
create policy "User can insert own push tokens"
  on public.push_tokens
  for insert
  with check (user_id = auth.uid());

-- (3) 自分の token のみ UPDATE
create policy "User can update own push tokens"
  on public.push_tokens
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- (4) 自分の token のみ DELETE
create policy "User can delete own push tokens"
  on public.push_tokens
  for delete
  using (user_id = auth.uid());

-- ============ テーブル権限 (最小権限) ============
revoke all on public.push_tokens from anon, authenticated, public;
grant select, insert, update, delete on public.push_tokens to authenticated;
-- service_role は Supabase 内部で全権限 (RLS も bypass)、明示 grant 不要。

commit;

-- ====================================================================
-- 適用後確認 (Block C 相当、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ C1: テーブル / 列 / nullable / 型
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'push_tokens'
--   order by ordinal_position;
--   → 期待: id / user_id / expo_push_token / platform / device_id /
--           created_at / updated_at の 7 列
--           expo_push_token, platform は is_nullable='NO'
--           device_id は is_nullable='YES'
--
-- ◆ C2: 制約 (CHECK / UNIQUE / FK)
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.push_tokens'::regclass
--   order by conname;
--   → 期待: push_tokens_pkey / push_tokens_platform_check /
--           push_tokens_user_token_unique / push_tokens_user_id_fkey
--
-- ◆ C3: RLS 有効化 + 4 policy 確認
--   select relname, relrowsecurity
--   from pg_class
--   where relname = 'push_tokens';
--   → 期待: relrowsecurity = t
--
--   select policyname, cmd
--   from pg_policies
--   where schemaname = 'public' and tablename = 'push_tokens'
--   order by policyname;
--   → 期待: 4 行、cmd は SELECT / INSERT / UPDATE / DELETE が 1 件ずつ
--
-- ◆ C4: テーブル GRANT
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'push_tokens'
--     and grantee in ('anon', 'authenticated', 'public')
--   order by grantee, privilege_type;
--   → 期待: authenticated に SELECT / INSERT / UPDATE / DELETE の 4 行のみ。
--           anon / public は出ない
--
-- ◆ C5: index
--   select indexname, indexdef
--   from pg_indexes
--   where schemaname = 'public' and tablename = 'push_tokens'
--   order by indexname;
--   → 期待: push_tokens_pkey / push_tokens_user_id_idx /
--           push_tokens_user_token_unique (unique index)
--
-- ◆ C6: updated_at trigger
--   select tgname, tgenabled, pg_get_triggerdef(oid)
--   from pg_trigger
--   where tgrelid = 'public.push_tokens'::regclass
--     and not tgisinternal
--   order by tgname;
--   → 期待: update_push_tokens_updated_at が 1 行、tgenabled='O' (Origin、有効)、
--           BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
--
--   ※ 動作確認 (任意): 自分の token 1 件で
--     update public.push_tokens set platform = platform where user_id = auth.uid();
--     を実行し、updated_at が現在時刻に更新されることを確認。
--
-- ====================================================================
-- ロールバック (緊急時、token は完全消失)
-- ====================================================================
-- ※ Push 送信中の場合は事前に送信機構を停止すること。
-- ※ public.update_updated_at_column() は他テーブル (wanted_cards / reports 等) が
--   依存する共通関数のため、本 rollback では削除しない。
--
-- begin;
-- drop trigger if exists update_push_tokens_updated_at on public.push_tokens;
-- drop policy if exists "User can read own push tokens"   on public.push_tokens;
-- drop policy if exists "User can insert own push tokens" on public.push_tokens;
-- drop policy if exists "User can update own push tokens" on public.push_tokens;
-- drop policy if exists "User can delete own push tokens" on public.push_tokens;
-- drop table if exists public.push_tokens;
-- commit;
