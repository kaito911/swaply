-- ====================================================================
-- migration_venue_trade_accept_unique_constraints.sql
-- 作成日: 2026-06-13
-- 目的  : Hold 承認の二重成立を DB レベルで防ぐ 2 つの unique index を追加。
--         加えて、旧 acceptVenueHold JS 実装由来の supply_post status 不整合を
--         migration 内で 1 度だけ補正する。
--
--         (0) 旧 JS accept 実装由来の不整合補正 (Block A 追加確認で発見)
--             held / converted hold が存在する supply_post の status を
--             active → held に寄せる。
--             例: hold_id=aef3a4df-7d34-46e4-9411-3bfd8f58a0be (status='held')、
--                 supply_post_id=471c4b24-0cae-43db-8d9a-003c91768cfc
--                 (status='active' のまま残置されていた、2026-06-13 検出)。
--             この補正なしに (2) の partial unique index を作成すると、整合性
--             の取れていないデータが「成立済」扱いになり、後続の RPC 動作が
--             意味的にズレるため、index 作成より前に走らせる。
--
--         (1) venue_trades.hold_id に普通の unique index
--             venue_trades_hold_id_unique_idx
--             → 同じ hold から複数 venue_trade が生成される事故を防止
--
--         (2) venue_holds(supply_post_id) WHERE status IN ('held','converted')
--             の partial unique index
--             venue_holds_supply_post_single_active_idx
--             → 同じ supply_post に複数の成立 hold (held/converted) がない
--                ことを保証
--
--         RPC 内 FOR UPDATE で通常は防げるが、DB 制約として持つことで race
--         condition の最終防衛線とする。RPC 側で unique_violation を catch
--         して SUPPLY_POST_ALREADY_TAKEN に rebrand する設計と連動。
--
-- 関連:
--   - docs/venue_mode_requirements.md §5 (PR4b 範囲)
--   - 連動 RPC: docs/migration_rpc_accept_venue_hold.sql
-- ====================================================================
--
-- 適用前提:
--   - venue_trades 内に同一 hold_id が複数件存在しないこと (Block A7 で確認)
--   - venue_holds 内に同一 supply_post_id で held/converted hold が複数件
--     存在しないこと (Block A3 で確認)
--   - 旧 JS accept 由来の不整合 (held hold + active supply_post) が存在する
--     場合、本 migration (0) で補正される。Block A の補強クエリで件数事前確認可。
--
-- ====================================================================

begin;

-- (0) 旧 acceptVenueHold JS 実装由来の不整合補正
--     held / converted hold がある supply_post は、既に成立済み扱いなので
--     supply_post.status も 'held' に寄せる。
--     migration ファイル内に残し、本番 1 回適用で恒久解消する。
update public.venue_supply_posts sp
set status = 'held'
where sp.status = 'active'
  and exists (
    select 1
    from public.venue_holds h
    where h.supply_post_id = sp.id
      and h.status in ('held', 'converted')
  );

-- (1) venue_trades(hold_id) を unique に
--     hold_id は NOT NULL なので NULL 除外不要、シンプルな unique index。
create unique index if not exists venue_trades_hold_id_unique_idx
  on public.venue_trades (hold_id);

-- (2) venue_holds(supply_post_id) WHERE status IN ('held','converted') を partial unique に
--     供給 1 件あたり成立中 hold は最大 1 件。
--     supply_post_id IS NULL の hold (FK SET NULL で消滅したケース) は除外。
create unique index if not exists venue_holds_supply_post_single_active_idx
  on public.venue_holds (supply_post_id)
  where status in ('held', 'converted') and supply_post_id is not null;

commit;

-- ====================================================================
-- 適用後確認 (Block C の C3 / C4 / C-不整合解消 と同等、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ venue_trades(hold_id) unique index 確認
--   select indexname, indexdef
--   from pg_indexes
--   where schemaname = 'public' and tablename = 'venue_trades'
--     and indexname = 'venue_trades_hold_id_unique_idx';
--   → 期待: 1 行、 "CREATE UNIQUE INDEX ... ON public.venue_trades USING btree (hold_id)"
--
-- ◆ venue_holds partial unique index 確認
--   select indexname, indexdef
--   from pg_indexes
--   where schemaname = 'public' and tablename = 'venue_holds'
--     and indexname = 'venue_holds_supply_post_single_active_idx';
--   → 期待: 1 行、indexdef に "WHERE" + "status = ANY (ARRAY['held', 'converted'])" 等を含む
--
-- ◆ 旧 JS accept 由来の不整合解消確認 (held/converted hold と active supply_post の組合せが残っていないこと)
--   select
--     h.id as hold_id,
--     h.status as hold_status,
--     h.supply_post_id,
--     sp.status as supply_post_status
--   from public.venue_holds h
--   join public.venue_supply_posts sp
--     on sp.id = h.supply_post_id
--   where h.status in ('held', 'converted')
--     and sp.status <> 'held';
--   → 期待: 0 行
--
-- ====================================================================
-- ロールバック (緊急時、index 削除のみ。補正 UPDATE は戻さない)
-- ====================================================================
-- ※ index rollback 後は二重成立リスクが復活する (RPC FOR UPDATE のみで担保)。
-- ※ 補正 UPDATE (active → held) は戻さない。戻すと旧不整合に再度戻ってしまう。
--
-- drop index if exists public.venue_holds_supply_post_single_active_idx;
-- drop index if exists public.venue_trades_hold_id_unique_idx;
