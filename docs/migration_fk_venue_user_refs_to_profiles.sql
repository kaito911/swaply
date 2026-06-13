-- ====================================================================
-- migration_fk_venue_user_refs_to_profiles.sql
-- 作成日: 2026-06-13
-- 目的  : A-3 venue 系 FK 張り替え。
--         delete_my_account → auth.admin.deleteUser 後に venue_holds /
--         venue_trades が CASCADE で物理削除されるのを防ぎ、相手側 venue
--         履歴を保持できるようにする。trade 側 (migration_fk_user_refs_to_profiles.sql)
--         と同パターンで auth.users → profiles(id) ON DELETE CASCADE に統一。
--
--         加えて、venue_holds.supply_post_id を NO ACTION → ON DELETE SET NULL に
--         変更し、delete_my_account RPC が venue_supply_posts を物理削除する際、
--         別ユーザの active hold が FK 違反で詰まる経路を解消する。
--
-- 対象 FK (全て標準命名 <table>_<column>_fkey):
--   1. venue_trades.proposer_id        (現: auth.users CASCADE)
--   2. venue_trades.receiver_id        (現: auth.users CASCADE)
--   3. venue_holds.proposer_id         (現: auth.users CASCADE)
--   4. venue_holds.receiver_id         (現: auth.users CASCADE)
--   5. venue_holds.supply_post_id      (現: venue_supply_posts NO ACTION → SET NULL)
--
-- 対象外 (今回見送り、将来候補):
--   - venue_checkins.user_id           (auth.users CASCADE のまま、短命データ + RPC で先に物理削除済)
--   - venue_supply_posts.user_id       (同上)
--
-- 適用前提:
--   - 上記 4 user 列に profiles(id) と一致しない UUID (orphan) が無いこと確認済
--     (2026-06-13、4 列すべて 0 件確認)
--   - venue_holds = 0 件 / venue_trades = 0 件 (張り替え時のデータ移動なし)
--   - FK 制約名は標準命名で確定 (pg_constraint 直接参照で確認済、2026-06-13)
--
-- ====================================================================
-- ⚠️ 運用ルール (trade 側 migration_fk_user_refs_to_profiles.sql と共通):
--
--   profiles 行は物理削除しない (匿名化のみ)。
--   物理削除すると本 CASCADE により相手の venue 取引履歴が連鎖削除されるため厳禁。
--
--   - delete_my_account RPC は profiles を物理削除せず、handle / display_name /
--     個人情報のみ匿名化して行を保持する (実装済)。
--   - Supabase Dashboard 等から profiles を手動 DELETE することも禁止。
--   - 万一 profiles を物理削除した場合、当該ユーザーが proposer/receiver として
--     関わる venue_holds / venue_trades が全件連鎖削除され、相手側ユーザーの完了
--     venue 取引履歴も失われる。
-- ====================================================================

begin;

-- 1. venue_trades.proposer_id
alter table public.venue_trades
  drop constraint venue_trades_proposer_id_fkey;
alter table public.venue_trades
  add constraint venue_trades_proposer_id_fkey
  foreign key (proposer_id)
  references public.profiles(id)
  on delete cascade;

-- 2. venue_trades.receiver_id
alter table public.venue_trades
  drop constraint venue_trades_receiver_id_fkey;
alter table public.venue_trades
  add constraint venue_trades_receiver_id_fkey
  foreign key (receiver_id)
  references public.profiles(id)
  on delete cascade;

-- 3. venue_holds.proposer_id
alter table public.venue_holds
  drop constraint venue_holds_proposer_id_fkey;
alter table public.venue_holds
  add constraint venue_holds_proposer_id_fkey
  foreign key (proposer_id)
  references public.profiles(id)
  on delete cascade;

-- 4. venue_holds.receiver_id
alter table public.venue_holds
  drop constraint venue_holds_receiver_id_fkey;
alter table public.venue_holds
  add constraint venue_holds_receiver_id_fkey
  foreign key (receiver_id)
  references public.profiles(id)
  on delete cascade;

-- 5. venue_holds.supply_post_id (NO ACTION → SET NULL)
alter table public.venue_holds
  drop constraint venue_holds_supply_post_id_fkey;
alter table public.venue_holds
  add constraint venue_holds_supply_post_id_fkey
  foreign key (supply_post_id)
  references public.venue_supply_posts(id)
  on delete set null;

commit;

-- ====================================================================
-- 適用前安全確認 (本 migration 実行前に再確認推奨)
-- ====================================================================
--
-- ◆ 1. orphan 0 件確認 (張り替え対象 4 列)
--
--   select 'venue_holds.proposer_id' as ref, count(*) as orphan
--     from public.venue_holds vh
--     where not exists (select 1 from public.profiles p where p.id = vh.proposer_id)
--   union all
--   select 'venue_holds.receiver_id', count(*)
--     from public.venue_holds vh
--     where not exists (select 1 from public.profiles p where p.id = vh.receiver_id)
--   union all
--   select 'venue_trades.proposer_id', count(*)
--     from public.venue_trades vt
--     where not exists (select 1 from public.profiles p where p.id = vt.proposer_id)
--   union all
--   select 'venue_trades.receiver_id', count(*)
--     from public.venue_trades vt
--     where not exists (select 1 from public.profiles p where p.id = vt.receiver_id);
--   → 全行 orphan = 0 であること
--
-- ◆ 2. 現状 FK 確認 (DROP 前提が崩れていないか)
--
--   select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where contype = 'f'
--     and conname in (
--       'venue_trades_proposer_id_fkey',
--       'venue_trades_receiver_id_fkey',
--       'venue_holds_proposer_id_fkey',
--       'venue_holds_receiver_id_fkey',
--       'venue_holds_supply_post_id_fkey'
--     );
--   → 5 行返り、user FK 4 本が auth.users CASCADE、supply_post_id が NO ACTION
--
-- ====================================================================
-- 適用後の検証手順
-- ====================================================================
--
-- ◆ 1. FK 張り替え成功確認 (5 FK)
--
--   select
--     conrelid::regclass         as table_name,
--     conname                    as constraint_name,
--     pg_get_constraintdef(oid)  as constraint_def
--   from pg_constraint
--   where contype = 'f'
--     and conname in (
--       'venue_trades_proposer_id_fkey',
--       'venue_trades_receiver_id_fkey',
--       'venue_holds_proposer_id_fkey',
--       'venue_holds_receiver_id_fkey',
--       'venue_holds_supply_post_id_fkey'
--     )
--   order by table_name, constraint_name;
--   → 期待:
--     - 4 行が REFERENCES public.profiles(id) ON DELETE CASCADE
--     - 1 行 (venue_holds_supply_post_id_fkey) が
--       REFERENCES public.venue_supply_posts(id) ON DELETE SET NULL
--
-- ◆ 2. delete_rule の formal 確認 (information_schema 経由)
--
--   select tc.table_name, kcu.column_name,
--          ccu.table_schema || '.' || ccu.table_name as ref_table,
--          rc.delete_rule
--   from information_schema.table_constraints tc
--   join information_schema.key_column_usage kcu
--     on tc.constraint_name = kcu.constraint_name
--   join information_schema.constraint_column_usage ccu
--     on tc.constraint_name = ccu.constraint_name
--   join information_schema.referential_constraints rc
--     on tc.constraint_name = rc.constraint_name
--   where tc.constraint_type = 'FOREIGN KEY'
--     and tc.constraint_name in (
--       'venue_trades_proposer_id_fkey',
--       'venue_trades_receiver_id_fkey',
--       'venue_holds_proposer_id_fkey',
--       'venue_holds_receiver_id_fkey',
--       'venue_holds_supply_post_id_fkey'
--     );
--   → user 4 本: ref_table='public.profiles' / delete_rule='CASCADE'
--   → supply_post_id: ref_table='public.venue_supply_posts' / delete_rule='SET NULL'
--
-- ◆ 3. (任意、E2E) venue_trades 行が出来た後の履歴保持確認
--
--   - 削除済みユーザーが proposer/receiver の完了 venue_trades が残ること
--   - venue_holds (status='converted'/'cancelled' 等) も同様
--   - 「削除済みユーザー」表示で UI 上は handled
--
-- ====================================================================
-- ロールバック (緊急時)
-- ====================================================================
-- ※ FK 張り替え自体は単純な ALTER で元に戻せるが、本 migration 適用後に
--    profiles 物理削除を伴うオペレーションを行った場合は CASCADE 連鎖が
--    起きているため復元不可。本 migration は適用前に必ずバックアップ取得。
--
-- begin;
-- alter table public.venue_trades drop constraint venue_trades_proposer_id_fkey;
-- alter table public.venue_trades add constraint venue_trades_proposer_id_fkey
--   foreign key (proposer_id) references auth.users(id) on delete cascade;
-- alter table public.venue_trades drop constraint venue_trades_receiver_id_fkey;
-- alter table public.venue_trades add constraint venue_trades_receiver_id_fkey
--   foreign key (receiver_id) references auth.users(id) on delete cascade;
-- alter table public.venue_holds drop constraint venue_holds_proposer_id_fkey;
-- alter table public.venue_holds add constraint venue_holds_proposer_id_fkey
--   foreign key (proposer_id) references auth.users(id) on delete cascade;
-- alter table public.venue_holds drop constraint venue_holds_receiver_id_fkey;
-- alter table public.venue_holds add constraint venue_holds_receiver_id_fkey
--   foreign key (receiver_id) references auth.users(id) on delete cascade;
-- alter table public.venue_holds drop constraint venue_holds_supply_post_id_fkey;
-- alter table public.venue_holds add constraint venue_holds_supply_post_id_fkey
--   foreign key (supply_post_id) references public.venue_supply_posts(id);
-- commit;
