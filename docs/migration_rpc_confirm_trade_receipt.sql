-- migration_rpc_confirm_trade_receipt.sql
-- Source-of-truth mirror: Supabase Dashboard 上の関数定義をリポジトリで管理可能にするための雛形。
--
-- ⚠️ 本ファイルは「Dashboard からコピペで埋める」用の空雛形。
-- ⚠️ 現状の本体は空 — このまま SQL Editor で実行しても何もしない。
-- ⚠️ Dashboard 側の既存関数を再作成 / 置き換える意図はない。
--
-- 背景:
--   docs/migration_*.sql に confirm_trade_receipt の定義が含まれていない。
--   両者受取確認で trade.status = 'completed' に遷移する際の atomic 性 +
--   複数枚提案で全 card が 'reserved' → 'traded' に一括遷移するかを確認する。
--
-- アプリ側 caller:
--   lib/supabase.ts:711-719 (confirmTradeReceipt)
--   await supabase.rpc('confirm_trade_receipt', {
--     p_trade_id: tradeId,   -- uuid
--   })
--   戻り値: 未確認 (void or jsonb)
--   actor 判定: auth.uid() 経由 (p_user_id 引数なし)
--
-- Dashboard からの取得手順:
--   1. Supabase Dashboard → Database → Functions
--   2. confirm_trade_receipt を選択
--   3. Definition タブの "CREATE OR REPLACE FUNCTION ..." 全文をコピー
--   4. 下の === PASTE HERE === と === END PASTE === の間に貼り付け
--   5. ヘッダー末尾の「取得日 / 取得者」を埋める
--
-- レビュー観点:
--   [受取確認の段階遷移]
--   - [ ] 片方 confirmed → shipments.status = 'received' (自分の側のみ)
--   - [ ] 片方 confirmed → trades.status = 'partially_received'
--   - [ ] 両方 confirmed → trades.status = 'completed' + completed_at = now()
--   - [ ] get_trade_detail_by_offer の戻り値 UIState 7 種
--         (waiting_my_receipt / waiting_their_receipt / completed) と整合
--
--   [複数枚提案での card 状態遷移]
--   - [ ] 両者 received で取引に紐づく cards を **全件一括**
--         'reserved' → 'traded' に update しているか
--   - [ ] 一部 card だけ traded になる中途半端な状態を防げているか
--   - [ ] profiles.trade_count 等の Trust 指標を increment しているか
--         (片方ずつ confirm の段階? 両方 confirm の段階?)
--
--   [権限 / 冪等性]
--   - [ ] auth.uid() == proposer_user_id || receiver_user_id を check
--   - [ ] SECURITY DEFINER 設定
--   - [ ] 既に received の shipment を再 confirm したら冪等 (no-op) か error か
--   - [ ] 自分の shipment が pending (相手未発送) の段階で confirm 可能か
--         (発送前確認は本来不可能なはずだが SQL レベルで block しているか)
--   - [ ] 既に completed / cancelled / disputed の trade に対する挙動
--
--   [Trust / 副次データ]
--   - [ ] profiles.trade_count ++ のタイミング
--   - [ ] profiles.ship_rate / trouble_count への影響
--   - [ ] profiles.last_active_at の更新
--   - [ ] 通知レコード生成 (Phase M 投入時)
--
-- 取得日: YYYY-MM-DD (未取得)
-- 取得者: (未取得)

CREATE OR REPLACE FUNCTION public.confirm_trade_receipt(p_trade_id uuid)
 RETURNS trades
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_trade public.trades%rowtype;
  v_my_shipment public.shipments%rowtype;
  v_counterpart_shipment public.shipments%rowtype;
  v_both_received boolean := false;
begin
  -- 1. 認証チェック
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- 2. trade ロック取得
  select *
  into v_trade
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  -- 3. 参加者チェック
  if v_actor_id <> v_trade.proposer_user_id
     and v_actor_id <> v_trade.receiver_user_id then
    raise exception 'NOT_TRADE_PARTICIPANT';
  end if;

  -- 4. ステータスチェック
  if v_trade.status not in ('in_transit', 'partially_received') then
    raise exception 'TRADE_NOT_RECEIVABLE';
  end if;

  -- 5. 自分 shipment ロック取得
  select *
  into v_my_shipment
  from public.shipments
  where trade_id = p_trade_id
    and user_id = v_actor_id
  for update;

  if not found then
    raise exception 'MY_SHIPMENT_NOT_FOUND';
  end if;

  -- 6. 相手 shipment ロック取得
  select *
  into v_counterpart_shipment
  from public.shipments
  where trade_id = p_trade_id
    and user_id <> v_actor_id
  for update;

  if not found then
    raise exception 'COUNTERPART_SHIPMENT_NOT_FOUND';
  end if;

  -- 7. 相手が発送していない場合はNG
  if v_counterpart_shipment.status not in ('shipped', 'received') then
    raise exception 'COUNTERPART_NOT_SHIPPED_YET';
  end if;

  -- 8. 既に受取済みならそのまま返す（冪等性）
  if v_counterpart_shipment.status = 'received' then
    return v_trade;
  end if;

  -- 9. 相手 shipment を received に更新
  update public.shipments
  set
    status = 'received',
    received_at = now(),
    updated_at = now()
  where id = v_counterpart_shipment.id
  returning * into v_counterpart_shipment;

  -- 10. 最新状態を再取得
  select *
  into v_my_shipment
  from public.shipments
  where trade_id = p_trade_id
    and user_id = v_actor_id;

  select *
  into v_counterpart_shipment
  from public.shipments
  where trade_id = p_trade_id
    and user_id <> v_actor_id;

  -- 11. 両方 received か判定
  v_both_received :=
    v_my_shipment.status = 'received'
    and v_counterpart_shipment.status = 'received';

  if v_both_received then
    -- 12-A trade 完了
    update public.trades
    set
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    where id = p_trade_id
    returning * into v_trade;

    -- 12-B offer も完了
    update public.offers
    set
      status = 'completed',
      updated_at = now()
    where id = v_trade.offer_id
      and status <> 'completed';

    -- 12-C カードを traded に
    update public.cards
    set
      status = 'traded',
      updated_at = now()
    where id in (
      select oi.card_id
      from public.offer_items oi
      where oi.offer_id = v_trade.offer_id
    )
      and status = 'reserved';

    -- 12-D イベント記録
    insert into public.trade_events (
      trade_id,
      actor_user_id,
      event_type,
      payload_json
    )
    values
      (
        p_trade_id,
        v_actor_id,
        'receipt_confirmed',
        jsonb_build_object(
          'received_shipment_user_id', v_counterpart_shipment.user_id,
          'received_at', v_counterpart_shipment.received_at
        )
      ),
      (
        p_trade_id,
        v_actor_id,
        'trade_completed',
        jsonb_build_object(
          'completed_at', now()
        )
      );

  else
    -- 13-A 片側のみ受取
    update public.trades
    set
      status = 'partially_received',
      updated_at = now()
    where id = p_trade_id
    returning * into v_trade;

    -- 13-B イベント
    insert into public.trade_events (
      trade_id,
      actor_user_id,
      event_type,
      payload_json
    )
    values (
      p_trade_id,
      v_actor_id,
      'receipt_confirmed',
      jsonb_build_object(
        'received_shipment_user_id', v_counterpart_shipment.user_id,
        'received_at', v_counterpart_shipment.received_at
      )
    );
  end if;

  return v_trade;
end;
$function$


-- === レビュー結果記録 ===
-- 判定: TBD (safe / needs-change / unsafe-for-multi-card)
-- 複数枚提案 GO/NO-GO: TBD
-- =========================
