-- get_trade_detail_by_offer RPC に配送情報を追加
-- Supabase SQL Editor で手動実行してください
-- 既存の RPC を差し替えます

CREATE OR REPLACE FUNCTION public.get_trade_detail_by_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_actor_id uuid := auth.uid();
  v_trade public.trades%rowtype;
  v_counterpart_user_id uuid;
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_trade
  from public.trades
  where offer_id = p_offer_id;

  if not found then
    raise exception 'TRADE_NOT_FOUND';
  end if;

  if v_actor_id <> v_trade.proposer_user_id
     and v_actor_id <> v_trade.receiver_user_id then
    raise exception 'NOT_TRADE_PARTICIPANT';
  end if;

  if v_actor_id = v_trade.proposer_user_id then
    v_counterpart_user_id := v_trade.receiver_user_id;
  else
    v_counterpart_user_id := v_trade.proposer_user_id;
  end if;

  with offer_cards as (
    select
      oi.id as offer_item_id,
      oi.offer_id,
      oi.card_id,
      c.owner_user_id,
      jsonb_build_object(
        'id', c.id,
        'owner_user_id', c.owner_user_id,
        'name', c.name,
        'series', c.series,
        'member_name', c.member_name,
        'image_url', c.image_url,
        'description', c.description,
        'status', c.status,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'group_name', c.group_name,
        'condition', c.condition,
        'want_description', c.want_description,
        'allows_adjustment', c.allows_adjustment,
        'adjustment_max', c.adjustment_max,
        'allows_mail', c.allows_mail,
        'allows_handoff', c.allows_handoff
      ) as card_json
    from public.offer_items oi
    join public.cards c
      on c.id = oi.card_id
    where oi.offer_id = p_offer_id
  ),
  my_cards as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'offerItemId', offer_item_id,
          'offerId', offer_id,
          'cardId', card_id,
          'card', card_json
        )
        order by offer_item_id
      ),
      '[]'::jsonb
    ) as items
    from offer_cards
    where owner_user_id = v_actor_id
  ),
  counterpart_cards as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'offerItemId', offer_item_id,
          'offerId', offer_id,
          'cardId', card_id,
          'card', card_json
        )
        order by offer_item_id
      ),
      '[]'::jsonb
    ) as items
    from offer_cards
    where owner_user_id <> v_actor_id
  ),
  my_shipment as (
    select jsonb_build_object(
      'id', s.id,
      'trade_id', s.trade_id,
      'user_id', s.user_id,
      'status', s.status,
      'shipping_method', s.shipping_method,
      'tracking_number', s.tracking_number,
      'carrier', s.carrier,
      'shipped_at', s.shipped_at,
      'received_at', s.received_at,
      'created_at', s.created_at,
      'updated_at', s.updated_at
    ) as row_json
    from public.shipments s
    where s.trade_id = v_trade.id
      and s.user_id = v_actor_id
  ),
  counterpart_shipment as (
    select jsonb_build_object(
      'id', s.id,
      'trade_id', s.trade_id,
      'user_id', s.user_id,
      'status', s.status,
      'shipping_method', s.shipping_method,
      'tracking_number', s.tracking_number,
      'carrier', s.carrier,
      'shipped_at', s.shipped_at,
      'received_at', s.received_at,
      'created_at', s.created_at,
      'updated_at', s.updated_at
    ) as row_json
    from public.shipments s
    where s.trade_id = v_trade.id
      and s.user_id = v_counterpart_user_id
  ),
  counterpart_profile as (
    select jsonb_build_object(
      'id', p.id,
      'handle', p.handle,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'trade_count', p.trade_count,
      'ship_rate', p.ship_rate,
      'reply_median_hours', p.reply_median_hours,
      'trouble_count', p.trouble_count,
      'adjustment_avg', p.adjustment_avg,
      'adjustment_bias', p.adjustment_bias,
      'mode', p.mode,
      'last_active_at', p.last_active_at,
      'shipping_name', p.shipping_name,
      'postal_code', p.postal_code,
      'address_line1', p.address_line1,
      'address_line2', p.address_line2
    ) as row_json
    from public.profiles p
    where p.id = v_counterpart_user_id
  ),
  counterpart_trust as (
    select jsonb_build_object(
      'user_id', uts.user_id,
      'completed_trade_count', uts.completed_trade_count,
      'shipped_count', uts.shipped_count,
      'shipped_on_time_count', uts.shipped_on_time_count,
      'shipping_compliance_rate', uts.shipping_compliance_rate,
      'receive_confirm_count', uts.receive_confirm_count,
      'receive_confirm_median_hours', uts.receive_confirm_median_hours,
      'trouble_count', uts.trouble_count,
      'adjustment_paid_total', uts.adjustment_paid_total,
      'adjustment_received_total', uts.adjustment_received_total,
      'adjustment_paid_avg', uts.adjustment_paid_avg,
      'adjustment_received_avg', uts.adjustment_received_avg,
      'badge', uts.badge,
      'updated_at', uts.updated_at
    ) as row_json
    from public.user_trust_stats uts
    where uts.user_id = v_counterpart_user_id
  )
  select jsonb_build_object(
    'trade',
    jsonb_build_object(
      'id', v_trade.id,
      'offer_id', v_trade.offer_id,
      'proposer_user_id', v_trade.proposer_user_id,
      'receiver_user_id', v_trade.receiver_user_id,
      'trade_mode', v_trade.trade_mode,
      'status', v_trade.status,
      'ship_deadline_at', v_trade.ship_deadline_at,
      'completed_at', v_trade.completed_at,
      'created_at', v_trade.created_at,
      'updated_at', v_trade.updated_at
    ),
    'myCards', (select items from my_cards),
    'counterpartCards', (select items from counterpart_cards),
    'myShipment', coalesce((select row_json from my_shipment), '{}'::jsonb),
    'counterpartShipment', coalesce((select row_json from counterpart_shipment), '{}'::jsonb),
    'counterpartProfile', coalesce((select row_json from counterpart_profile), '{}'::jsonb),
    'counterpartTrust', coalesce((select row_json from counterpart_trust), '{}'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;
