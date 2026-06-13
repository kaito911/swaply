-- ====================================================================
-- migration_rpc_accept_venue_hold.sql
-- 作成日: 2026-06-13
-- 目的  : Hold 承認を原子化する RPC accept_venue_hold(p_hold_id uuid)。
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
--           (13) venue_trade INSERT (status='pending')
--           (14) 生成された trade 行を返却
--
--         例外: unique_violation を catch → SUPPLY_POST_ALREADY_TAKEN に統一
--           - venue_trades_hold_id_unique_idx (同 hold から 2 つ目の trade)
--           - venue_holds_supply_post_single_active_idx (同 supply_post の重複)
--
--         権限: revoke all from public / grant execute to authenticated
--           - SECURITY DEFINER で動作するため RLS をバイパスするが、関数内で
--             auth.uid() = receiver_id を明示チェック (NOT_RECEIVER ガード)
--
-- 関連:
--   - docs/migration_venue_trades_add_snapshot_columns.sql (snapshot 列)
--   - docs/migration_venue_trade_accept_unique_constraints.sql (unique index 2 件)
--   - docs/venue_mode_requirements.md §5 / §7 (PR4b 範囲)
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

  v_wanted := jsonb_build_object(
    'card_name', v_hold.receiver_card,
    'supply_post_id', v_hold.supply_post_id,
    'source', 'venue_hold + venue_supply_post'
  );
  -- jsonb_strip_nulls で group_name / want_card が NULL のキーは省略
  v_wanted := v_wanted ||
    jsonb_strip_nulls(jsonb_build_object(
      'group_name', v_supply.group_name,
      'want_card_text', v_supply.want_card
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
--       2026-06-13 に明示追加)。
revoke all on function public.accept_venue_hold(uuid) from anon;
revoke all on function public.accept_venue_hold(uuid) from public;
grant execute on function public.accept_venue_hold(uuid) to authenticated;

-- ====================================================================
-- 適用後確認 (Block C の C5 / C6 / C7 と同等、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ 関数メタ確認
--   select proname, prosecdef, proconfig
--   from pg_proc where proname = 'accept_venue_hold';
--   → 期待: 1 行、prosecdef=true、proconfig に 'search_path=public'
--
-- ◆ 関数本体キーワード確認
--   select
--     prosrc ilike '%for update%'                 as has_for_update,
--     prosrc ilike '%declined%'                   as has_declined_branch,
--     prosrc ilike '%SUPPLY_POST_NOT_FOUND%'      as has_not_found,
--     prosrc ilike '%SUPPLY_POST_NOT_ACTIVE%'     as has_not_active,
--     prosrc ilike '%SUPPLY_POST_ALREADY_TAKEN%'  as has_already_taken,
--     prosrc ilike '%unique_violation%'           as has_unique_violation_handler
--   from pg_proc where proname = 'accept_venue_hold';
--   → 期待: 全列 t
--
-- ◆ 権限確認
--   select grantee, privilege_type
--   from information_schema.role_routine_grants
--   where routine_schema = 'public' and routine_name = 'accept_venue_hold';
--   → 期待: authenticated / postgres / service_role が EXECUTE を持つ。
--           anon / public は EXECUTE を持たない
--
-- ====================================================================
-- ロールバック (緊急時、関数削除のみで安全)
-- ====================================================================
-- ※ ロールバック後は旧 JS 版 acceptVenueHold に戻すか、accept 機能が完全停止する。
--    snapshot 列 / unique index はそのまま残しても影響なし (むしろ残置推奨)。
--
-- drop function if exists public.accept_venue_hold(uuid);
