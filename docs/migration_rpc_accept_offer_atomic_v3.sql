-- migration_rpc_accept_offer_atomic_v3.sql
-- Source-of-truth mirror: Supabase Dashboard 上の関数定義をリポジトリで管理可能にするための雛形。
--
-- ⚠️ 本ファイルは「Dashboard からコピペで埋める」用の空雛形。
-- ⚠️ 現状の本体は空 — このまま SQL Editor で実行しても何もしない。
-- ⚠️ Dashboard 側の既存関数を再作成 / 置き換える意図はない。
--    レビュー用に関数本体を repo に置き、複数枚提案 / 配送ステータス変更の
--    安全性を git diff 上で確認可能にする。
--
-- 背景:
--   docs/migration_*.sql に accept_offer_atomic_v3 の定義が含まれていない
--   (基本テーブルと同じく Supabase Dashboard で直接作成された)。
--   複数枚提案の実装可否を確認するために本体を read 可能化する。
--
-- アプリ側 caller:
--   lib/supabase.ts:647-655 (acceptOffer)
--   await supabase.rpc('accept_offer_atomic_v3', {
--     target_offer_id: offerId,    -- uuid
--   })
--   戻り値: 未確認 (void or jsonb)
--
-- Dashboard からの取得手順:
--   1. Supabase Dashboard → Database → Functions
--   2. accept_offer_atomic_v3 を選択
--   3. Definition タブの "CREATE OR REPLACE FUNCTION ..." 全文をコピー
--   4. 下の === PASTE HERE === と === END PASTE === の間に貼り付け
--   5. ヘッダー末尾の「取得日 / 取得者」を埋める
--   6. レビュー観点チェックリストを CC でレビュー
--
-- レビュー観点 (kaito が貼り付けた後、CC が確認するポイント):
--   [複数枚提案の安全性 — 最優先]
--   - [ ] target_offer_id を受け取り、offer_items を **全件一括処理** しているか
--         (single card 前提の SQL なら複数枚提案で破綻)
--   - [ ] cards.status を 'active' → 'reserved' に **一括 update** しているか
--   - [ ] 1 card が既に reserved の場合に **transaction 全体を rollback** するか
--         (部分的に reserved して残りが取れない競合状態を防げるか)
--   - [ ] 同じ target_card_id に来ている他の pending offers を
--         **cancelled に一括 update** しているか (competing offers cancel)
--   - [ ] Phase 1.5 で複数枚提案が来る場合に N=1 と N>1 の分岐がないか
--         (分岐があると複数枚 path のテストが薄くなる)
--
--   [取引生成の整合性]
--   - [ ] trades レコードを 1 件 INSERT しているか
--         (proposer_user_id, receiver_user_id, status='pending', ship_deadline_at)
--   - [ ] shipments を 2 件 INSERT (proposer 用、receiver 用) しているか
--         get_trade_detail_by_offer の戻り値 (myShipment + counterpartShipment) と整合
--   - [ ] offers.adjustment_amount → trades.adjustment_amount のコピー有無
--   - [ ] ship_deadline_at の計算式 (now() + interval '?? days')
--
--   [認証 / 権限]
--   - [ ] SECURITY DEFINER で定義されているか
--   - [ ] auth.uid() で receiver (= target card owner) であることを検証しているか
--   - [ ] proposer 自身による self-accept を防ぐ check があるか
--
--   [冪等性 / エラーハンドリング]
--   - [ ] 既に accepted の offer を再 accept した場合の挙動
--   - [ ] target_card が既に traded / inactive 状態の時の挙動
--   - [ ] 関連 offer_items が 0 件の時の挙動
--   - [ ] raise exception のメッセージ規約 (AUTH_REQUIRED / NOT_FOUND 等の英語コード)
--
-- 取得日: YYYY-MM-DD (未取得)
-- 取得者: (未取得)
-- Dashboard 上のバージョン: v3 (= 関数名末尾、v1/v2 は別途存在の可能性、要確認)


CREATE OR REPLACE FUNCTION public.accept_offer_atomic_v3(target_offer_id uuid)
 RETURNS trades
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();

  v_offer public.offers%rowtype;
  v_target_card public.cards%rowtype;
  v_existing_trade public.trades%rowtype;
  v_trade public.trades%rowtype;

  v_offer_card_ids uuid[];
  v_proposer_card_ids uuid[];
  v_declined_offer_ids uuid[] := '{}'::uuid[];

  v_invalid_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- 1. 対象 offer をロックして取得
  select *
  into v_offer
  from public.offers
  where id = target_offer_id
  for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  -- 2. 既存 trade があれば冪等に返す
  select *
  into v_existing_trade
  from public.trades
  where offer_id = target_offer_id;

  if found then
    return v_existing_trade;
  end if;

  -- 3. pending のみ承認可能
  if v_offer.status <> 'pending' then
    raise exception 'OFFER_NOT_PENDING';
  end if;

  -- 4. target card をロックして取得
  select *
  into v_target_card
  from public.cards
  where id = v_offer.target_card_id
  for update;

  if not found then
    raise exception 'TARGET_CARD_NOT_FOUND';
  end if;

  -- 5. 承認できるのは target card の owner のみ
  if v_target_card.owner_user_id <> v_actor_id then
    raise exception 'ONLY_TARGET_OWNER_CAN_ACCEPT';
  end if;

  -- 6. target card は active である必要がある
  if v_target_card.status <> 'active' then
    raise exception 'TARGET_CARD_NOT_ACTIVE';
  end if;

  -- 7. offer_items の対象行を先にロック
  perform 1
  from public.offer_items oi
  where oi.offer_id = target_offer_id
  for update;

  if not found then
    raise exception 'OFFER_ITEMS_NOT_FOUND';
  end if;

  -- 8. ロック後に offer_items を集約取得
  select array_agg(oi.card_id order by oi.created_at, oi.id)
  into v_offer_card_ids
  from public.offer_items oi
  where oi.offer_id = target_offer_id;

  if v_offer_card_ids is null or coalesce(array_length(v_offer_card_ids, 1), 0) = 0 then
    raise exception 'OFFER_ITEMS_NOT_FOUND';
  end if;

  -- 9. target_card が offer_items に含まれていることを確認
  if not (v_offer.target_card_id = any(v_offer_card_ids)) then
    raise exception 'TARGET_CARD_NOT_INCLUDED_IN_OFFER_ITEMS';
  end if;

  -- 10. proposer 側カード一覧を抽出
  select coalesce(array_agg(x.card_id), '{}'::uuid[])
  into v_proposer_card_ids
  from unnest(v_offer_card_ids) as x(card_id)
  where x.card_id <> v_offer.target_card_id;

  if coalesce(array_length(v_proposer_card_ids, 1), 0) = 0 then
    raise exception 'PROPOSER_CARDS_NOT_FOUND';
  end if;

  -- 11. proposer 側カードをロック
  perform 1
  from public.cards c
  where c.id = any(v_proposer_card_ids)
  for update;

  -- 12. proposer 側カードは全て proposer 所有である必要がある
  select count(*)
  into v_invalid_count
  from public.cards c
  where c.id = any(v_proposer_card_ids)
    and c.owner_user_id <> v_offer.proposer_user_id;

  if v_invalid_count > 0 then
    raise exception 'PROPOSER_CARD_OWNER_MISMATCH';
  end if;

  -- 13. proposer 側カードは全て active である必要がある
  select count(*)
  into v_invalid_count
  from public.cards c
  where c.id = any(v_proposer_card_ids)
    and c.status <> 'active';

  if v_invalid_count > 0 then
    raise exception 'PROPOSER_CARD_NOT_ACTIVE';
  end if;

  -- 14. 同一ユーザー同士の取引は禁止
  if v_offer.proposer_user_id = v_target_card.owner_user_id then
    raise exception 'INVALID_TRADE_PARTICIPANTS';
  end if;

  -- 15. 対象 offer を accepted に更新
  update public.offers
  set
    status = 'accepted',
    updated_at = now()
  where id = target_offer_id;

  -- 16. involved cards を使う他の pending offer を declined にする
  with involved_cards as (
    select unnest(v_offer_card_ids) as card_id
  ),
  competing_offer_ids as (
    select distinct o.id
    from public.offers o
    left join public.offer_items oi
      on oi.offer_id = o.id
    where o.status = 'pending'
      and o.id <> target_offer_id
      and (
        o.target_card_id in (select card_id from involved_cards)
        or oi.card_id in (select card_id from involved_cards)
      )
  ),
  declined_rows as (
    update public.offers o
    set
      status = 'declined',
      updated_at = now()
    where o.id in (select id from competing_offer_ids)
    returning o.id
  )
  select coalesce(array_agg(id), '{}'::uuid[])
  into v_declined_offer_ids
  from declined_rows;

  -- 17. involved cards を reserved に更新
  update public.cards
  set
    status = 'reserved',
    updated_at = now()
  where id = any(v_offer_card_ids)
    and status = 'active';

  -- 18. trade を作成（adjustment_amount を offers から引き継ぐ）
  insert into public.trades (
    offer_id,
    proposer_user_id,
    receiver_user_id,
    trade_mode,
    status,
    ship_deadline_at,
    adjustment_amount
  )
  values (
    v_offer.id,
    v_offer.proposer_user_id,
    v_target_card.owner_user_id,
    'mail',
    'pending',
    now() + interval '72 hours',
    coalesce(v_offer.adjustment_amount, 0)
  )
  returning *
  into v_trade;

  -- 19. trade_items を作成
  insert into public.trade_items (
    trade_id,
    card_id,
    owner_user_id
  )
  select
    v_trade.id,
    c.id,
    c.owner_user_id
  from public.cards c
  where c.id = any(v_offer_card_ids);

  -- 20. shipments を2件作成
  insert into public.shipments (
    trade_id,
    user_id,
    status
  )
  values
    (v_trade.id, v_trade.proposer_user_id, 'pending'),
    (v_trade.id, v_trade.receiver_user_id, 'pending');

  -- 21. trade_events を記録
  insert into public.trade_events (
    trade_id,
    actor_user_id,
    event_type,
    payload_json
  )
  values (
    v_trade.id,
    v_actor_id,
    'trade_created',
    jsonb_build_object(
      'offer_id', v_offer.id,
      'accepted_at', now(),
      'declined_competing_offer_ids', to_jsonb(v_declined_offer_ids),
      'reserved_card_ids', to_jsonb(v_offer_card_ids),
      'trade_mode', 'mail',
      'ship_deadline_at', v_trade.ship_deadline_at
    )
  );

  return v_trade;
end;
$function$

-- === レビュー結果記録 ===
-- (CC レビュー後、上のチェックリストの結果と判定をここに記録)
--
-- 判定: TBD (safe / needs-change / unsafe-for-multi-card)
-- 複数枚提案 GO/NO-GO: TBD
-- 必要な修正があれば accept_offer_atomic_v4 として別 SQL に書く想定。
-- =========================
