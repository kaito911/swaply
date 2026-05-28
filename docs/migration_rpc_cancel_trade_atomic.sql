-- migration_rpc_cancel_trade_atomic.sql
-- Source-of-truth mirror: Supabase Dashboard 上の関数定義をリポジトリで管理可能にするための雛形。
--
-- ⚠️ 本ファイルは「Dashboard からコピペで埋める」用の空雛形。
-- ⚠️ 現状の本体は空 — このまま SQL Editor で実行しても何もしない。
-- ⚠️ Dashboard 側の既存関数を再作成 / 置き換える意図はない。
--
-- 背景:
--   docs/migration_*.sql に cancel_trade_atomic の定義が含まれていない。
--   複数枚提案で取引キャンセル時に全 card が atomic に 'active' に戻るかを
--   実装前に確認する。
--
-- アプリ側 caller:
--   lib/supabase.ts:721-733 (cancelTrade)
--   await supabase.rpc('cancel_trade_atomic', {
--     p_trade_id: tradeId,   -- uuid
--     p_user_id:  userId,    -- uuid (申請者、proposer or receiver)
--   })
--   戻り値: 未確認 (void or jsonb)
--
-- Dashboard からの取得手順:
--   1. Supabase Dashboard → Database → Functions
--   2. cancel_trade_atomic を選択
--   3. Definition タブの "CREATE OR REPLACE FUNCTION ..." 全文をコピー
--   4. 下の === PASTE HERE === と === END PASTE === の間に貼り付け
--   5. ヘッダー末尾の「取得日 / 取得者」を埋める
--
-- レビュー観点:
--   [複数枚提案の安全性]
--   - [ ] 取引に紐づく cards (offer_items 経由) を **全件一括** で
--         'reserved' → 'active' に戻しているか (N=2 でも N=10 でも安全か)
--   - [ ] cards.status の戻し漏れがないか (一部だけ active に戻ると永久 reserved 化)
--
--   [取引状態遷移]
--   - [ ] trades.status を 'cancelled' に update しているか
--   - [ ] trades.cancelled_at = now() を記録しているか
--   - [ ] shipments.status の扱い (cancelled / 据え置き / 削除のいずれか)
--   - [ ] 一定段階以上進んだ取引 (shipped 後 / received 後) の cancel 禁止 check
--         (途中段階のキャンセルポリシーがどうなっているか)
--
--   [権限 / 認証]
--   - [ ] p_user_id == proposer_user_id || p_user_id == receiver_user_id を check
--   - [ ] auth.uid() と p_user_id の一致 check (なりすまし防止)
--   - [ ] SECURITY DEFINER 設定
--   - [ ] 既に cancelled / completed / disputed の取引を再 cancel した時の挙動
--
--   [副次データ]
--   - [ ] offers.status の更新があるか (元 offer を accepted → cancelled / archived 等に)
--   - [ ] 通知レコード生成があるか (3.5d で notifications テーブル投入予定)
--   - [ ] dispute との関係 (open_trade_dispute と相互排他か)
--
-- 取得日: YYYY-MM-DD (未取得)
-- 取得者: (未取得)

CREATE OR REPLACE FUNCTION public.cancel_trade_atomic(p_trade_id uuid, p_user_id uuid)
 RETURNS trades
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_trade public.trades%rowtype;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_user_id <> v_actor_id then
    raise exception 'AUTH_MISMATCH';
  end if;

  select *
  into v_trade
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  if v_actor_id not in (v_trade.proposer_user_id, v_trade.receiver_user_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_trade.status in ('completed', 'cancelled') then
    raise exception 'TRADE_NOT_CANCELLABLE';
  end if;

  if v_trade.status = 'disputed' then
    raise exception 'DISPUTED_TRADE_CANNOT_BE_CANCELLED_DIRECTLY';
  end if;

  perform 1
  from public.shipments s
  where s.trade_id = p_trade_id
  for update;

  if exists (
    select 1
    from public.shipments s
    where s.trade_id = p_trade_id
      and s.status in ('shipped', 'received')
  ) then
    raise exception 'TRADE_ALREADY_IN_SHIPPING_FLOW';
  end if;

  update public.trades
  set
    status = 'cancelled',
    updated_at = now()
  where id = p_trade_id
  returning *
  into v_trade;

  update public.offers
  set
    status = 'cancelled',
    updated_at = now()
  where id = v_trade.offer_id
    and status in ('pending', 'accepted');

  update public.cards
  set
    status = 'active',
    updated_at = now()
  where id in (
    select ti.card_id
    from public.trade_items ti
    where ti.trade_id = p_trade_id
  )
    and status = 'reserved';

  insert into public.trade_events (
    trade_id,
    actor_user_id,
    event_type,
    payload_json
  )
  values (
    p_trade_id,
    v_actor_id,
    'trade_cancelled',
    jsonb_build_object(
      'cancelled_at', now(),
      'reason', 'user_cancel_before_shipping'
    )
  );

  return v_trade;
end;
$function$



-- === レビュー結果記録 ===
-- 判定: TBD (safe / needs-change / unsafe-for-multi-card)
-- 複数枚提案 GO/NO-GO: TBD
-- =========================
