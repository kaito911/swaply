-- migration_rpc_submit_trade_shipment.sql
-- Source-of-truth mirror: Supabase Dashboard 上の関数定義をリポジトリで管理可能にするための雛形。
--
-- ⚠️ 本ファイルは「Dashboard からコピペで埋める」用の空雛形。
-- ⚠️ 現状の本体は空 — このまま SQL Editor で実行しても何もしない。
-- ⚠️ Dashboard 側の既存関数を再作成 / 置き換える意図はない。
--
-- 背景:
--   docs/migration_*.sql に submit_trade_shipment の定義が含まれていない。
--   配送ステータス遷移 (pending → shipped) の安全性と、追跡番号 / 配送業者の
--   検証ロジックを実装前に確認する。Phase S (v1.6 Claude Vision API による
--   追跡番号 OCR) の前段として、現状の手動入力フローを read 可能化する。
--
-- アプリ側 caller:
--   lib/supabase.ts:695-709 (submitTradeShipment)
--   await supabase.rpc('submit_trade_shipment', {
--     p_trade_id:         tradeId,           -- uuid
--     p_tracking_number:  trackingNumber,    -- text
--     p_carrier:          carrier,           -- text | null
--   })
--   戻り値: 未確認 (void or jsonb)
--
-- Dashboard からの取得手順:
--   1. Supabase Dashboard → Database → Functions
--   2. submit_trade_shipment を選択
--   3. Definition タブの "CREATE OR REPLACE FUNCTION ..." 全文をコピー
--   4. 下の === PASTE HERE === と === END PASTE === の間に貼り付け
--   5. ヘッダー末尾の「取得日 / 取得者」を埋める
--
-- レビュー観点:
--   [shipment 更新]
--   - [ ] 自分側 (auth.uid() == shipments.user_id) の shipment のみ update しているか
--   - [ ] shipments.status = 'shipped' に update しているか
--   - [ ] shipments.tracking_number / carrier を保存しているか
--   - [ ] shipments.shipped_at = now() を記録しているか
--   - [ ] 相手側の shipment を誤って書き換えていないか
--
--   [trade 段階遷移]
--   - [ ] 片方 shipped → trades.status をどう更新するか
--         (waiting_my_ship / waiting_their_ship UIState と整合)
--   - [ ] 両方 shipped → trades.status = 'in_transit' (?) への遷移有無
--
--   [権限 / 認証]
--   - [ ] auth.uid() == proposer_user_id || receiver_user_id の check
--   - [ ] SECURITY DEFINER 設定
--   - [ ] 既に shipped の shipment を再 submit したら冪等 (no-op) か
--         tracking_number を上書きするか error か
--   - [ ] 既に cancelled / disputed の trade に対する挙動
--
--   [入力検証]
--   - [ ] p_tracking_number の NULL / 空文字 check
--   - [ ] p_carrier の許容値 check (Yamato / SagawaExpress / JP Post 等の enum か任意 text か)
--   - [ ] 配送業者 prefix / 桁数の SQL レベル validation (Phase S v1.6 では Vision API)
--   - [ ] 重複 tracking_number の可否 (同じ番号を別取引で使う不正検出)
--
--   [Trust / Phase S 連動]
--   - [ ] ship_deadline_at 超過時の Trust ペナルティ計算
--   - [ ] profiles.ship_rate 更新の有無 (このタイミング? confirm 時?)
--   - [ ] expire_unshipped_trades RPC との関係 (まだ未確認、後続)
--
-- 取得日: YYYY-MM-DD (未取得)
-- 取得者: (未取得)

CREATE OR REPLACE FUNCTION public.submit_trade_shipment(p_trade_id uuid, p_tracking_number text, p_carrier text DEFAULT NULL::text)
 RETURNS trades
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_trade public.trades%rowtype;
  v_my_shipment public.shipments%rowtype;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_tracking_number is null or btrim(p_tracking_number) = '' then
    raise exception 'TRACKING_NUMBER_REQUIRED';
  end if;

  select *
  into v_trade
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  if v_actor_id <> v_trade.proposer_user_id and v_actor_id <> v_trade.receiver_user_id then
    raise exception 'NOT_TRADE_PARTICIPANT';
  end if;

  if v_trade.status not in ('pending', 'in_transit') then
    raise exception 'TRADE_NOT_SHIPPABLE';
  end if;

  if now() > v_trade.ship_deadline_at then
    raise exception 'SHIP_DEADLINE_EXPIRED';
  end if;

  select *
  into v_my_shipment
  from public.shipments
  where trade_id = p_trade_id
    and user_id = v_actor_id
  for update;

  if not found then
    raise exception 'SHIPMENT_ROW_NOT_FOUND';
  end if;

  if v_my_shipment.status in ('shipped', 'received') then
    raise exception 'ALREADY_SHIPPED';
  end if;

  update public.shipments
  set
    status = 'shipped',
    tracking_number = btrim(p_tracking_number),
    carrier = nullif(btrim(coalesce(p_carrier, '')), ''),
    shipped_at = now()
  where id = v_my_shipment.id
  returning * into v_my_shipment;

  update public.trades
  set
    status = 'in_transit',
    updated_at = now()
  where id = p_trade_id
  returning * into v_trade;

  insert into public.trade_events (
    trade_id,
    actor_user_id,
    event_type,
    payload_json
  )
  values (
    p_trade_id,
    v_actor_id,
    'shipment_registered',
    jsonb_build_object(
      'tracking_number', v_my_shipment.tracking_number,
      'carrier', v_my_shipment.carrier,
      'shipped_at', v_my_shipment.shipped_at
    )
  );

  return v_trade;
end;
$function$

-- === レビュー結果記録 ===
-- 判定: TBD
-- Phase S 拡張 (Vision API OCR) との互換性: TBD
-- =========================
