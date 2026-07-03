-- ====================================================================
-- migration_rpc_create_trade_report.sql
-- 作成日: 2026-07-04
-- 目的  : trade_reports 生成 RPC (Trust 質 PR)。
--
--         クライアントは reported_id / trade FK / trade_type を直接入力せず、
--         サーバが auth.uid() + trade_id から自動導出する。
--         申告条件 (status / 7 日期限 / venue_noshow の cancelled 例外) を
--         DB 側で二重防御し、フォーム UI 側のみに依存しない。
--
--         SECURITY DEFINER: reported_id を確実にサーバ導出するため。
--                            クライアントが reported_id を偽装しても、
--                            サーバは trade_id 由来の値で上書きする。
--
-- 引数:
--   p_normal_trade_id uuid  (nullable、venue の場合は NULL)
--   p_venue_trade_id  uuid  (nullable、通常の場合は NULL)
--   p_category text
--   p_note      text (nullable、最大 2000 文字は trade_reports の CHECK で強制)
--   p_photo_path text (nullable、実ファイルは trade-report-photos private bucket)
--
-- 戻り値: 挿入した trade_reports 行 1 件
--
-- エラー:
--   AUTH_REQUIRED           - 未認証
--   TRADE_REF_INVALID       - normal と venue が両方 NULL / 両方 NOT NULL
--   INVALID_CATEGORY        - カテゴリ値不正 (CHECK も担保するが早期エラー)
--   VENUE_NOSHOW_INVALID    - venue_noshow を normal_trade_id と組み合わせた
--   TRADE_NOT_FOUND         - 対象 trade が存在しない
--   NOT_TRADE_PARTICIPANT   - 呼出者が当該 trade の参加者でない
--   TRADE_NOT_ELIGIBLE      - status / 期限が申告条件を満たさない
--   SELF_REPORT_NOT_ALLOWED - 自己申告 (通常起き得ないが防御)
--   ALREADY_REPORTED        - 同一 trade に対する重複申告
--
-- 前提:
--   - migration_trade_reports.sql が先に適用済であること
-- ====================================================================

create or replace function public.create_trade_report(
  p_normal_trade_id uuid,
  p_venue_trade_id  uuid,
  p_category        text,
  p_note            text default null,
  p_photo_path      text default null
)
returns public.trade_reports
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor_id     uuid := auth.uid();
  v_reported_id  uuid;
  v_report       public.trade_reports;
  v_normal_trade public.trades%rowtype;
  v_venue_trade  public.venue_trades%rowtype;
  v_eligible     boolean := false;
begin
  -- 1. 認証
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- 2. XOR チェック (どちらか一方のみ)
  if (p_normal_trade_id is null) = (p_venue_trade_id is null) then
    raise exception 'TRADE_REF_INVALID';
  end if;

  -- 3. カテゴリ検証 (早期エラー、CHECK も担保)
  if p_category not in (
    'state_mismatch','wrong_item','poor_packaging','late_shipping',
    'no_contact','not_received','venue_noshow','other'
  ) then
    raise exception 'INVALID_CATEGORY';
  end if;

  -- 4. venue_noshow は venue_trade でのみ有効
  if p_category = 'venue_noshow' and p_venue_trade_id is null then
    raise exception 'VENUE_NOSHOW_INVALID';
  end if;

  -- 5. trade fetch + participant + 期限判定 (分岐)
  if p_normal_trade_id is not null then
    -- 通常 trade 経路
    select * into v_normal_trade
    from public.trades
    where id = p_normal_trade_id;

    if not found then
      raise exception 'TRADE_NOT_FOUND';
    end if;

    if v_actor_id <> v_normal_trade.proposer_user_id
       and v_actor_id <> v_normal_trade.receiver_user_id then
      raise exception 'NOT_TRADE_PARTICIPANT';
    end if;

    -- 通常 trade: completed かつ completed_at + 7 days > now() のみ申告可
    -- (venue_noshow は上の 4. で弾き済のためここでは考慮不要)
    if v_normal_trade.status = 'completed'
       and v_normal_trade.completed_at is not null
       and v_normal_trade.completed_at + interval '7 days' > now() then
      v_eligible := true;
    end if;

    if not v_eligible then
      raise exception 'TRADE_NOT_ELIGIBLE';
    end if;

    -- 相手側 = participant のうち reporter でない方
    if v_actor_id = v_normal_trade.proposer_user_id then
      v_reported_id := v_normal_trade.receiver_user_id;
    else
      v_reported_id := v_normal_trade.proposer_user_id;
    end if;

  else
    -- venue_trade 経路
    select * into v_venue_trade
    from public.venue_trades
    where id = p_venue_trade_id;

    if not found then
      raise exception 'TRADE_NOT_FOUND';
    end if;

    if v_actor_id <> v_venue_trade.proposer_id
       and v_actor_id <> v_venue_trade.receiver_id then
      raise exception 'NOT_TRADE_PARTICIPANT';
    end if;

    if p_category = 'venue_noshow' then
      -- venue_noshow: cancelled + cancel_requested_at NOT NULL + completed_at NULL
      -- かつ cancel_requested_at + 7 days > now()
      if v_venue_trade.status = 'cancelled'
         and v_venue_trade.cancel_requested_at is not null
         and v_venue_trade.completed_at is null
         and v_venue_trade.cancel_requested_at + interval '7 days' > now() then
        v_eligible := true;
      end if;
    else
      -- venue_noshow 以外: completed + 7 日以内
      if v_venue_trade.status = 'completed'
         and v_venue_trade.completed_at is not null
         and v_venue_trade.completed_at + interval '7 days' > now() then
        v_eligible := true;
      end if;
    end if;

    if not v_eligible then
      raise exception 'TRADE_NOT_ELIGIBLE';
    end if;

    if v_actor_id = v_venue_trade.proposer_id then
      v_reported_id := v_venue_trade.receiver_id;
    else
      v_reported_id := v_venue_trade.proposer_id;
    end if;
  end if;

  -- 6. 自己申告防御 (通常起き得ないが二重防御)
  if v_reported_id = v_actor_id then
    raise exception 'SELF_REPORT_NOT_ALLOWED';
  end if;

  -- 7. INSERT (unique_violation を ALREADY_REPORTED に統一)
  begin
    insert into public.trade_reports (
      reporter_id, reported_id,
      normal_trade_id, venue_trade_id,
      category, note, photo_path
    )
    values (
      v_actor_id, v_reported_id,
      p_normal_trade_id, p_venue_trade_id,
      p_category, p_note, p_photo_path
    )
    returning * into v_report;

  exception when unique_violation then
    raise exception 'ALREADY_REPORTED';
  end;

  return v_report;
end;
$function$;

-- 権限: 認証ユーザーのみ実行可 (anon / public は revoke)
revoke all on function public.create_trade_report(uuid, uuid, text, text, text) from anon, public;
grant execute on function public.create_trade_report(uuid, uuid, text, text, text) to authenticated;

-- ====================================================================
-- 適用後確認クエリ
-- ====================================================================
--
-- ◆ 関数存在
--   select proname, pg_get_function_identity_arguments(oid) as args, prosecdef
--   from pg_proc
--   where proname = 'create_trade_report' and pronamespace = 'public'::regnamespace;
--   → 期待: 1 行、args = "p_normal_trade_id uuid, p_venue_trade_id uuid, p_category text,
--             p_note text, p_photo_path text"、prosecdef = true (SECURITY DEFINER)
--
-- ◆ 権限
--   select grantee, privilege_type from information_schema.routine_privileges
--   where specific_schema = 'public' and routine_name = 'create_trade_report'
--   order by grantee;
--   → 期待: authenticated=EXECUTE のみ。anon / public は無し。
--
-- ◆ エラー動作の手動確認 (実機 or SQL で)
--   - 未認証 (匿名 key) で呼ぶ → AUTH_REQUIRED
--   - normal と venue 両方指定 → TRADE_REF_INVALID
--   - 存在しない trade_id → TRADE_NOT_FOUND
--   - 他人の trade に対して呼ぶ → NOT_TRADE_PARTICIPANT
--   - status=cancelled の通常 trade → TRADE_NOT_ELIGIBLE
--   - 通常 trade に venue_noshow 指定 → VENUE_NOSHOW_INVALID
--   - 同じ trade に 2 回申告 → ALREADY_REPORTED
