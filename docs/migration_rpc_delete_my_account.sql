-- migration_rpc_delete_my_account.sql
-- アカウント削除 RPC (Phase 0 PR-D)
--
-- Supabase SQL Editor で kaito が手動実行してください。
-- Dashboard 未適用、docs 保存のみ。
--
-- 適用順序:
--   1. PR-B の migration_reports.sql (reports テーブル作成)
--   2. PR-C の migration_user_blocks.sql (user_blocks テーブル作成)
--   3. PR-D の migration_reports_reporter_nullable.sql (reporter_id nullable 化)
--   4. PR-D の migration_rpc_delete_my_account.sql ← 本 file
--   5. Edge Function `delete-account` のデプロイ
--
-- 設計方針 (Phase 0 PR-D 確定方針):
--   - 個人情報削除 + プロフィール匿名化 + 履歴保持
--   - profiles は物理削除しない (UPDATE で匿名化、id は維持)
--     → cards/offers/trades 等の FK 参照を保ち、相手側履歴整合性を確保
--   - active trade があれば削除拒否 (kaito 指示):
--     trades.status IN ('pending', 'in_transit', 'partially_received')
--     ※ trade_status enum に 'accepted' は存在しない (offers.status 側の値、
--        accept_offer_atomic_v3 で trades 生成時に trades.status='pending' から開始)
--   - SECURITY DEFINER + search_path public 固定
--   - 全 step 冪等 (再 invoke 安全)
--   - auth.users 削除は本 RPC では行わず、Edge Function 側で実施
--   - Pioneer 関連列 (is_pioneer / pioneer_number 等) は維持 (Q-B 案 X)
--
-- 呼び出し元:
--   supabase/functions/delete-account/index.ts (Edge Function)

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_count integer;
  v_short_id text;
begin
  -- ─────────────────────────────────────────
  -- Step 1: 認証チェック + active trade 判定
  -- ─────────────────────────────────────────
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select count(*) into v_active_count
  from public.trades
  where (proposer_user_id = v_user_id or receiver_user_id = v_user_id)
    and status in ('pending', 'in_transit', 'partially_received');

  if v_active_count > 0 then
    -- カウントをエラーメッセージに含めて Edge Function 側でパース可能に
    raise exception 'ACTIVE_TRADE_EXISTS:%', v_active_count;
  end if;

  -- ─────────────────────────────────────────
  -- Step 2: 物理削除 (Tier A、本人専用データ)
  --   いずれも DELETE は 0 行でも成功扱い → 冪等
  -- ─────────────────────────────────────────
  delete from public.wanted_cards         where user_id = v_user_id;
  delete from public.shelf_items          where user_id = v_user_id;
  delete from public.user_oshi            where user_id = v_user_id;
  delete from public.user_keyword_history where user_id = v_user_id;
  delete from public.user_blocks          where blocker_id = v_user_id;
  delete from public.venue_checkins       where user_id = v_user_id;
  delete from public.venue_supply_posts   where user_id = v_user_id;

  -- ─────────────────────────────────────────
  -- Step 3: pending offers cancel + offer_items 削除
  --   accept_offer_atomic_v3 と同パターン (competing offers cancel と同型)
  --   pending 以外の offers (accepted/declined/completed/cancelled) は履歴保持
  -- ─────────────────────────────────────────
  delete from public.offer_items
    where offer_id in (
      select id from public.offers
      where proposer_user_id = v_user_id and status = 'pending'
    );

  update public.offers
    set status = 'cancelled', updated_at = now()
    where proposer_user_id = v_user_id and status = 'pending';

  -- ─────────────────────────────────────────
  -- Step 4: cards 二分処理
  --   active / inactive → 物理削除 (相手側参照なし、active trade ガード済)
  --   traded            → 匿名化 (相手の取引履歴で参照されるため残す、画像・自由記述のみ NULL)
  -- ─────────────────────────────────────────
  delete from public.cards
    where owner_user_id = v_user_id
      and status in ('active', 'inactive');

  update public.cards
    set image_url            = null,
        image_back_url       = null,
        image_url_cropped    = null,
        description          = null,
        want_description     = null,
        want_image_url       = null,
        want_image_back_url  = null,
        updated_at           = now()
    where owner_user_id = v_user_id
      and status = 'traded';

  -- ─────────────────────────────────────────
  -- Step 5: profiles 匿名化 (物理削除は禁止、UPDATE 限定)
  --   cards.owner_user_id / offers.proposer_user_id 等が CASCADE で参照中のため、
  --   profiles を DELETE すると履歴側が全滅する。匿名化 UPDATE で対応。
  --
  --   維持する列 (相手側履歴の整合性と Trust 指標のため):
  --     - trade_count / ship_rate / reply_median_hours / trouble_count
  --     - adjustment_avg / adjustment_bias
  --     - is_pioneer / pioneer_number / pioneer_joined_at /
  --       pioneer_status / pioneer_forfeited_reason (Pioneer 列、Q-B 案 X)
  -- ─────────────────────────────────────────
  v_short_id := substring(v_user_id::text from 1 for 8);

  update public.profiles
    set handle         = 'deleted_user_' || v_short_id,
        display_name   = '削除済みユーザー',
        avatar_url     = null,
        shipping_name  = null,
        postal_code    = null,
        address_line1  = null,
        address_line2  = null,
        mode           = null,
        last_active_at = null,
        updated_at     = now()
    where id = v_user_id;

  -- ─────────────────────────────────────────
  -- Step 6: reports (自分が reporter のもの) を匿名化
  --   reports.reporter_id を NULL に。通報内容自体は運営対応のため保持。
  --   reports (target_id = 自分) は触らない (運営対応証跡として残存)。
  --
  --   前提: migration_reports_reporter_nullable.sql 適用済 (reporter_id nullable)
  -- ─────────────────────────────────────────
  update public.reports
    set reporter_id = null
    where reporter_id = v_user_id;

  -- ここで関数末尾 → 暗黙 COMMIT
  -- auth.users 削除は本 RPC では行わない (Edge Function 側で auth.admin.deleteUser)
end;
$$;

-- 認証済ユーザーに実行権限付与
grant execute on function public.delete_my_account() to authenticated;

-- 確認クエリ:
-- select proname, prosecdef, proconfig
-- from pg_proc
-- where proname = 'delete_my_account';
-- 期待: prosecdef = true (SECURITY DEFINER)、proconfig に "search_path=public"
