-- ====================================================================
-- migration_fk_user_refs_to_profiles.sql
-- 作成日: 2026-06-06
-- 目的  : アカウント削除 (delete_my_account → auth.admin.deleteUser) が
--         FK 制約で失敗するブロッカーを解消する。
--         6 FK を auth.users → profiles(id) ON DELETE CASCADE に張り替え、
--         既存パターン (cards.owner_user_id / offers.proposer_user_id) と統一する。
--
-- 対象 FK (全て標準命名 <table>_<column>_fkey):
--   1. trades.proposer_user_id              (現: auth.users RESTRICT)
--   2. trades.receiver_user_id              (現: auth.users RESTRICT)
--   3. shipments.user_id                    (現: auth.users RESTRICT)
--   4. trade_disputes.opened_by_user_id     (現: auth.users NO ACTION)
--   5. trade_disputes.resolved_by_user_id   (現: auth.users NO ACTION)
--   6. trade_items.owner_user_id            (現: auth.users NO ACTION)
--
-- ※ trade_events.actor_user_id は SET NULL のためブロッカーではなく対象外。
--
-- 適用前提:
--   - 上記 6 列に profiles(id) と一致しない UUID (orphan) が無いこと確認済
--     (kaito 側で 6 件すべて 0 件確認、2026-06-06)
--   - FK 制約名は標準命名で確定 (kaito 確認済)
--
-- ====================================================================
-- ⚠️ 運用ルール (重要):
--
--   profiles 行は物理削除しない (匿名化のみ)。
--   物理削除すると本 CASCADE により相手の取引履歴が連鎖削除されるため厳禁。
--
--   - delete_my_account RPC は profiles を物理削除せず、handle / display_name /
--     個人情報のみ匿名化して行を保持する (実装済)。
--   - Supabase Dashboard 等から profiles を手動 DELETE することも禁止。
--     必要なら個人情報列のみ UPDATE で空にし、行自体は残すこと。
--   - 万一 profiles を物理削除した場合、当該ユーザーが proposer/receiver/sender/
--     owner として関わる trades / shipments / trade_items / trade_disputes が
--     全件連鎖削除され、相手側ユーザーの完了取引履歴も失われる。
-- ====================================================================

begin;

-- 1. trades.proposer_user_id
alter table public.trades
  drop constraint trades_proposer_user_id_fkey;
alter table public.trades
  add constraint trades_proposer_user_id_fkey
  foreign key (proposer_user_id)
  references public.profiles(id)
  on delete cascade;

-- 2. trades.receiver_user_id
alter table public.trades
  drop constraint trades_receiver_user_id_fkey;
alter table public.trades
  add constraint trades_receiver_user_id_fkey
  foreign key (receiver_user_id)
  references public.profiles(id)
  on delete cascade;

-- 3. shipments.user_id (発送者)
alter table public.shipments
  drop constraint shipments_user_id_fkey;
alter table public.shipments
  add constraint shipments_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;

-- 4. trade_disputes.opened_by_user_id
alter table public.trade_disputes
  drop constraint trade_disputes_opened_by_user_id_fkey;
alter table public.trade_disputes
  add constraint trade_disputes_opened_by_user_id_fkey
  foreign key (opened_by_user_id)
  references public.profiles(id)
  on delete cascade;

-- 5. trade_disputes.resolved_by_user_id
alter table public.trade_disputes
  drop constraint trade_disputes_resolved_by_user_id_fkey;
alter table public.trade_disputes
  add constraint trade_disputes_resolved_by_user_id_fkey
  foreign key (resolved_by_user_id)
  references public.profiles(id)
  on delete cascade;

-- 6. trade_items.owner_user_id
alter table public.trade_items
  drop constraint trade_items_owner_user_id_fkey;
alter table public.trade_items
  add constraint trade_items_owner_user_id_fkey
  foreign key (owner_user_id)
  references public.profiles(id)
  on delete cascade;

commit;

-- ====================================================================
-- 適用後の検証手順 (取引履歴ありアカウントで実施)
-- ====================================================================
--
-- ◆ 1. FK 張り替え成功確認
--
--   select
--     tc.table_name, kcu.column_name, ccu.table_name as ref_table, rc.delete_rule
--   from information_schema.table_constraints tc
--   join information_schema.key_column_usage kcu
--     on tc.constraint_name = kcu.constraint_name
--   join information_schema.constraint_column_usage ccu
--     on tc.constraint_name = ccu.constraint_name
--   join information_schema.referential_constraints rc
--     on tc.constraint_name = rc.constraint_name
--   where tc.constraint_type = 'FOREIGN KEY'
--     and (
--       (tc.table_name = 'trades' and kcu.column_name in ('proposer_user_id','receiver_user_id'))
--       or (tc.table_name = 'shipments' and kcu.column_name = 'user_id')
--       or (tc.table_name = 'trade_disputes' and kcu.column_name in ('opened_by_user_id','resolved_by_user_id'))
--       or (tc.table_name = 'trade_items' and kcu.column_name = 'owner_user_id')
--     );
--   → 6 行すべて ref_table='profiles' / delete_rule='CASCADE' になっていること
--
-- ◆ 2. 既存の詰まりアカウント (元の失敗ケース) で削除完了確認
--
--   - 対象: profiles 匿名化済 (handle='deleted_user_xxx') かつ auth.users に
--          残存しているアカウント (= 過去に Edge Function が FK で失敗したもの)
--   - 完了 trade / shipment / trade_items / (あれば) trade_disputes が当該 user を
--     参照している状態であること = 元のブロッカー条件を再現
--
--   手順:
--     a. 対象 user_id を取得
--        select id from public.profiles where handle like 'deleted_user_%';
--
--     b. 取引履歴の存在を事前確認 (CASCADE 対象が居ること)
--        select 'trades' as t, count(*) from public.trades
--          where proposer_user_id = '<X>' or receiver_user_id = '<X>'
--        union all
--        select 'shipments', count(*) from public.shipments where user_id = '<X>'
--        union all
--        select 'trade_items', count(*) from public.trade_items where owner_user_id = '<X>';
--        → いずれも > 0 件であること
--
--     c. Supabase Dashboard → Authentication → Users → 当該 user → "Delete user"
--        または service_role で auth.admin.deleteUser を再実行
--        → 期待: 成功 (migration 前は FK 制約で失敗していた)
--
--     d. auth.users から消えたことを確認
--        select id from auth.users where id = '<X>';
--        → 0 rows
--
-- ◆ 3. 相手側に取引履歴が残っていること (実機 + SQL)
--
--   - 取引相手 Y が居る場合、Y で login し /(tabs)/trades.tsx 取引中タブ または
--     完了履歴で当該取引が **そのまま表示される** ことを確認
--   - SQL でも明示的に確認:
--     select id, proposer_user_id, receiver_user_id, status
--     from public.trades
--     where proposer_user_id = '<X>' or receiver_user_id = '<X>';
--     → 削除前と同じ件数。proposer/receiver_user_id 値は X の UUID のまま保持
--     (profiles 行が匿名化保持されているため UI は「削除済みユーザー」として表示)
--
--   - shipments も同様:
--     select id, user_id, status from public.shipments
--     where trade_id in (
--       select id from public.trades
--       where proposer_user_id = '<X>' or receiver_user_id = '<X>'
--     );
--     → 完了 trade の shipment 2 件 (両者発送) が残ること
--
-- ====================================================================
-- ロールバック (緊急時)
-- ====================================================================
-- ※ FK 張り替え自体は単純な ALTER で元に戻せるが、すでに profiles 物理削除を
--    伴うオペレーションを行った場合は CASCADE 連鎖が起きているため復元不可。
--    本 migration は適用前に必ずバックアップ取得。
--
-- begin;
-- alter table public.trades drop constraint trades_proposer_user_id_fkey;
-- alter table public.trades add constraint trades_proposer_user_id_fkey
--   foreign key (proposer_user_id) references auth.users(id);
-- -- (他 5 FK も同様に auth.users に戻す)
-- commit;
