-- ====================================================================
-- migration_rpc_accept_venue_hold_with_proposer_image.sql
-- 作成日: 2026-06-14
-- 目的  : accept_venue_hold RPC を CREATE OR REPLACE で更新し、
--         Hold 申請時の申請者画像 (venue_holds.proposer_image_url) を
--         offered_snapshot に含める。
--
--         本 PR (2026-06-14): offered_snapshot に v_hold.proposer_image_url を
--         追加。hold が後で削除されても trade 履歴で申請者側画像を表示できる
--         ようにする。FOR UPDATE / ガード / unique_violation catch / anon revoke
--         は完全温存。既存 wanted_snapshot 構築 (PR3 で追加された
--         v_supply.image_url 注入) も完全温存。
--
--         処理順序 (1 transaction):
--           (1)  認証チェック (AUTH_REQUIRED)
--           (2)  hold を FOR UPDATE でロック (HOLD_NOT_FOUND)
--           (3)  hold ガード:
--                  - NOT_RECEIVER
--                  - HOLD_NOT_PENDING:<status>
--                  - HOLD_EXPIRED
--           (4)  supply_post_id null チェック (SUPPLY_POST_NOT_FOUND)
--           (5)  supply_post を FOR UPDATE でロック (早期直列化)
--           (6)  supply_post 存在チェック (SUPPLY_POST_NOT_FOUND)
--                 - SET NULL FK で消滅したケースも捕捉
--           (7)  supply_post.status チェック:
--                  - 'held'    → SUPPLY_POST_ALREADY_TAKEN
--                  - その他非 active → SUPPLY_POST_NOT_ACTIVE:<status>
--           (8)  兄弟 held/converted hold チェック (SUPPLY_POST_ALREADY_TAKEN)
--                 - partial unique index と論理整合
--           (9)  hold を 'held' に
--           (10) supply_post を 'held' に
--           (11) 兄弟 pending hold を 'declined' に一括 UPDATE
--           (12) snapshot (offered_snapshot / wanted_snapshot) 構築
--                 - 本 PR 差分: offered_snapshot に proposer_image_url を追加
--                   (jsonb_strip_nulls で NULL なら省略、後方互換)
--           (13) venue_trade INSERT (status='pending')
--           (14) 生成された trade 行を返却
--
--         例外: unique_violation を catch → SUPPLY_POST_ALREADY_TAKEN に統一
--           - venue_trades_hold_id_unique_idx (同 hold から 2 つ目の trade)
--           - venue_holds_supply_post_single_active_idx (同 supply_post の重複)
--
--         権限: revoke all from public / revoke all from anon
--               / grant execute to authenticated
--           - SECURITY DEFINER で動作するため RLS をバイパスするが、関数内で
--             auth.uid() = receiver_id を明示チェック (NOT_RECEIVER ガード)
--           - 本番 Supabase 環境では `public` REVOKE だけでは `anon` ロールに
--             残ることがあるため、`anon` を明示的に REVOKE する。
--
-- 関連:
--   - 前提 migration: docs/migration_venue_holds_add_proposer_image_url.sql
--     (本 RPC が v_hold.proposer_image_url を参照するため、列追加が先)
--   - 旧版定義: docs/migration_rpc_accept_venue_hold.sql
--     (本ファイル適用後は本ファイルが source-of-truth、旧ファイルは履歴として残置)
--   - docs/migration_venue_trades_add_snapshot_columns.sql (snapshot 列の元)
--   - docs/migration_venue_trade_accept_unique_constraints.sql (unique index 2 件)
--   - docs/venue_mode_requirements.md §5 / §7 (PR4b 範囲)
-- ====================================================================
--
-- 適用前提:
--   1. venue_holds に proposer_image_url 列が存在
--      (docs/migration_venue_holds_add_proposer_image_url.sql を先に適用)
--   2. PR4b / PR4a の既存 RPC / migration が本番に適用済
--   3. 既存 unique index 2 件が本番に適用済
--
-- ====================================================================

create or replace function public.accept_venue_hold(p_hold_id uuid)
returns public.venue_trades
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_hold public.venue_holds;
  v_supply public.venue_supply_posts;
  v_trade public.venue_trades;
  v_offered jsonb;
  v_wanted jsonb;
begin
  -- (1) 認証
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- (2) hold を FOR UPDATE でロック (並行 accept を直列化)
  select * into v_hold
  from public.venue_holds
  where id = p_hold_id
  for update;

  if not found then
    raise exception 'HOLD_NOT_FOUND';
  end if;

  -- (3) hold ガード
  if v_hold.receiver_id <> v_user_id then
    raise exception 'NOT_RECEIVER';
  end if;

  if v_hold.status <> 'pending' then
    raise exception 'HOLD_NOT_PENDING:%', v_hold.status;
  end if;

  if v_hold.expires_at < now() then
    raise exception 'HOLD_EXPIRED';
  end if;

  -- (4) supply_post_id null チェック (β1 では shelf 直接 Hold は未サポート)
  if v_hold.supply_post_id is null then
    raise exception 'SUPPLY_POST_NOT_FOUND';
  end if;

  -- (5) supply_post を FOR UPDATE でロック (二重 accept の早期直列化)
  select * into v_supply
  from public.venue_supply_posts
  where id = v_hold.supply_post_id
  for update;

  -- (6) supply_post 存在チェック (SET NULL FK で消滅していたケース)
  if not found then
    raise exception 'SUPPLY_POST_NOT_FOUND';
  end if;

  -- (7) supply_post ステータスチェック
  if v_supply.status <> 'active' then
    if v_supply.status = 'held' then
      raise exception 'SUPPLY_POST_ALREADY_TAKEN';
    else
      raise exception 'SUPPLY_POST_NOT_ACTIVE:%', v_supply.status;
    end if;
  end if;

  -- (8) 兄弟 held/converted hold チェック (partial unique index と論理整合)
  perform 1 from public.venue_holds
  where supply_post_id = v_hold.supply_post_id
    and status in ('held', 'converted')
    and id <> v_hold.id;
  if found then
    raise exception 'SUPPLY_POST_ALREADY_TAKEN';
  end if;

  -- (9) hold を 'held' に
  update public.venue_holds
    set status = 'held', updated_at = now()
    where id = p_hold_id;

  -- (10) supply_post を 'held' に
  update public.venue_supply_posts
    set status = 'held'
    where id = v_hold.supply_post_id;

  -- (11) 兄弟 pending hold を 'declined' に一括 UPDATE
  update public.venue_holds
    set status = 'declined', updated_at = now()
    where supply_post_id = v_hold.supply_post_id
      and id <> p_hold_id
      and status = 'pending';

  -- (12) snapshot 構築
  v_offered := jsonb_build_object(
    'card_name', v_hold.proposer_card,
    'source', 'venue_hold'
  );
  -- jsonb_strip_nulls で image_url が NULL のキーは省略
  -- 本 PR (2026-06-14): venue_holds.proposer_image_url を snapshot に追加。
  -- hold が後で削除されても trade 履歴で申請者側画像を表示できるようにする。
  -- 後方互換: 既存 hold (proposer_image_url IS NULL) は image_url キーなしで通過。
  v_offered := v_offered ||
    jsonb_strip_nulls(jsonb_build_object(
      'image_url', v_hold.proposer_image_url
    ));

  v_wanted := jsonb_build_object(
    'card_name', v_hold.receiver_card,
    'supply_post_id', v_hold.supply_post_id,
    'source', 'venue_hold + venue_supply_post'
  );
  -- jsonb_strip_nulls で group_name / want_card / image_url が NULL のキーは省略
  -- PR3 (2026-06-13): venue_supply_posts.image_url を snapshot に追加。
  -- supply_post が後で削除されても trade 履歴で画像を表示できるようにする。
  v_wanted := v_wanted ||
    jsonb_strip_nulls(jsonb_build_object(
      'group_name', v_supply.group_name,
      'want_card_text', v_supply.want_card,
      'image_url', v_supply.image_url
    ));

  -- (13) venue_trade を INSERT (status='pending' で開始)
  insert into public.venue_trades (
    venue_id, hold_id, proposer_id, receiver_id,
    proposer_card, receiver_card,
    offered_snapshot, wanted_snapshot
  ) values (
    v_hold.venue_id, v_hold.id, v_hold.proposer_id, v_hold.receiver_id,
    v_hold.proposer_card, v_hold.receiver_card,
    v_offered, v_wanted
  )
  returning * into v_trade;

  -- (14) return
  return v_trade;

exception
  -- B2 で追加した 2 つの unique index 違反を統一エラーに寄せる
  --   - venue_trades_hold_id_unique_idx (同 hold から 2 つ目の trade)
  --   - venue_holds_supply_post_single_active_idx (同 supply_post に 2 つ目の成立 hold)
  -- race condition / 同時 accept による衝突を SUPPLY_POST_ALREADY_TAKEN で表現
  when unique_violation then
    raise exception 'SUPPLY_POST_ALREADY_TAKEN';
end;
$$;

-- 権限: SECURITY DEFINER の関数を anon / public に晒さない。
-- 注意: Supabase 環境では `public` REVOKE だけでは `anon` ロールに残ることがあるため、
--       `anon` を明示的に REVOKE する (本番適用時に anon に EXECUTE が残っていたため
--       2026-06-13 に明示追加、本 PR でも継続)。
revoke all on function public.accept_venue_hold(uuid) from anon;
revoke all on function public.accept_venue_hold(uuid) from public;
grant execute on function public.accept_venue_hold(uuid) to authenticated;

-- ====================================================================
-- 適用後確認 (Block C 相当、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ C1: 関数メタ確認 (prosecdef / proconfig は維持)
--   select proname, prosecdef, proconfig
--   from pg_proc where proname = 'accept_venue_hold';
--   → 期待: 1 行、prosecdef=true、proconfig に 'search_path=public'
--
-- ◆ C2: 関数本体キーワード確認 (新差分 + 既存差分の両方が含まれる)
--   select
--     prosrc ilike '%for update%'                       as has_for_update,
--     prosrc ilike '%declined%'                         as has_declined_branch,
--     prosrc ilike '%SUPPLY_POST_NOT_FOUND%'            as has_not_found,
--     prosrc ilike '%SUPPLY_POST_NOT_ACTIVE%'           as has_not_active,
--     prosrc ilike '%SUPPLY_POST_ALREADY_TAKEN%'        as has_already_taken,
--     prosrc ilike '%unique_violation%'                 as has_unique_violation_handler,
--     prosrc ilike '%v_hold.proposer_image_url%'        as has_proposer_image_url,    -- 本 PR 差分
--     prosrc ilike '%v_supply.image_url%'               as has_wanted_image_url       -- 既存 (PR3)
--   from pg_proc where proname = 'accept_venue_hold';
--   → 期待: 全列 t
--
-- ◆ C3: 権限確認
--   select grantee, privilege_type
--   from information_schema.role_routine_grants
--   where routine_schema = 'public' and routine_name = 'accept_venue_hold';
--   → 期待: authenticated / postgres / service_role が EXECUTE を持つ。
--           anon / public は EXECUTE を持たない
--
-- ◆ C4: 既存 hold (proposer_image_url IS NULL) で承認したときに
--        offered_snapshot に image_url キーが含まれないことを確認
--        (本番データで再現困難な場合は省略可、code 側の表示分岐でも担保)
--
-- ====================================================================
-- ロールバック (緊急時、旧版に戻す)
-- ====================================================================
-- ※ ロールバック後は accept 時の offered_snapshot に image_url が乗らなくなる
--   (新規 trade のみ。過去 trade の offered_snapshot は不変)。
--   コード側 (snapshot 表示) は jsonb_strip_nulls により画像なしでも壊れない設計。
--
-- ※ proposer_image_url 列を DROP する場合は、先に本 RPC を旧版 (本ファイル適用前) に
--   戻してから列を DROP する。逆順 (列 DROP 先行) は次回承認時にエラーになる。
--
-- 旧版 RPC への戻し方:
--   docs/migration_rpc_accept_venue_hold.sql の全文を Supabase SQL Editor で
--   再実行する (本ファイルの差分のみ巻き戻る、他の挙動は完全同一)。
-- ====================================================================
