-- migration_rpc_open_trade_dispute.sql
-- Source-of-truth mirror: Supabase Dashboard 上の関数定義をリポジトリで管理可能にするための雛形。
--
-- ⚠️ 本ファイルは「Dashboard からコピペで埋める」用の空雛形。
-- ⚠️ 現状の本体は空 — このまま SQL Editor で実行しても何もしない。
-- ⚠️ Dashboard 側の既存関数を再作成 / 置き換える意図はない。
--
-- 背景:
--   docs/migration_*.sql に open_trade_dispute の定義が含まれていない。
--   通報 / 紛争オープン時の状態遷移と、Phase S (詐欺対策 + 仲裁) 設計との
--   整合性を実装前に確認する。dispute_logs / reports テーブル (Phase S C-S1
--   で新設予定) との関係も読む。
--
-- アプリ側 caller:
--   lib/supabase.ts:735-751 (openTradeDispute)
--   await supabase.rpc('open_trade_dispute', {
--     p_trade_id:        tradeId,         -- uuid
--     p_user_id:         userId,          -- uuid (申請者)
--     p_dispute_reason:  disputeReason,   -- text (理由カテゴリ)
--     p_detail_text:     detailText,      -- text | null (自由記述)
--   })
--   戻り値: 未確認 (void or jsonb)
--
-- Dashboard からの取得手順:
--   1. Supabase Dashboard → Database → Functions
--   2. open_trade_dispute を選択
--   3. Definition タブの "CREATE OR REPLACE FUNCTION ..." 全文をコピー
--   4. 下の === PASTE HERE === と === END PASTE === の間に貼り付け
--   5. ヘッダー末尾の「取得日 / 取得者」を埋める
--
-- レビュー観点:
--   [取引状態遷移]
--   - [ ] trades.status を 'disputed' に update しているか
--   - [ ] 元 status (pending / in_transit 等) を別列に退避しているか
--         (仲裁後 resume するなら必要、しないなら不要)
--   - [ ] 関連 cards.status の扱い (reserved 維持? frozen 等の新状態?)
--   - [ ] shipments の状態凍結があるか
--
--   [dispute レコード生成]
--   - [ ] dispute_logs テーブル (Phase S C-S1 で新設予定) への INSERT があるか
--         現状は trades 列内 (dispute_reason / dispute_detail) に保存している可能性
--   - [ ] dispute_reason の許容値 check (enum or 任意 text)
--     想定値: 'not_shipped' / 'wrong_card' / 'damaged' / 'no_response' / 'other'
--   - [ ] p_detail_text の長さ制限
--
--   [権限 / 認証]
--   - [ ] p_user_id == proposer_user_id || receiver_user_id の check
--   - [ ] auth.uid() と p_user_id の一致 check (なりすまし防止)
--   - [ ] SECURITY DEFINER 設定
--   - [ ] 既に disputed の trade を再 open した時の挙動
--         (上書き? 追加 dispute_log? 拒否?)
--   - [ ] cancelled / completed の trade に対する dispute 開示の可否
--
--   [副次作用 — Phase S で詳細化予定]
--   - [ ] Trust ペナルティの即時適用 vs 仲裁後適用
--   - [ ] 相手側への通知レコード生成 (Phase M 投入時)
--   - [ ] 運営仲裁ダッシュボード (Phase S C-S5) からの可視性
--   - [ ] 補償基金 (Phase S C-S6) との関係
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
-- Phase S 詐欺対策との互換性: TBD
-- =========================
