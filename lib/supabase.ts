// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import { Card, Offer, Profile } from './types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─────────────────────────────────────────
// Home screen
// ─────────────────────────────────────────

export async function fetchNewCards(limit = 20): Promise<Card[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('*, owner:profiles(*)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchNewCards]', error)
    return []
  }

  return (data ?? []) as Card[]
}

export async function fetchEasyCards(limit = 20): Promise<Card[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('*, owner:profiles(*)')
    .eq('status', 'active')
    .eq('allows_adjustment', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchEasyCards]', error)
    return []
  }

  return (data ?? []) as Card[]
}

export async function fetchRecommendedCards(
  userId: string,
  limit = 20
): Promise<Card[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('*, owner:profiles(*)')
    .eq('status', 'active')
    .neq('owner_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchRecommendedCards]', error)
    return []
  }

  return (data ?? []) as Card[]
}

// ─────────────────────────────────────────
// Listing detail
// ─────────────────────────────────────────

export async function fetchCard(cardId: string): Promise<Card | null> {
  const { data, error } = await supabase
    .from('cards')
    .select('*, owner:profiles(*)')
    .eq('id', cardId)
    .single()

  if (error) {
    console.error('[fetchCard]', error)
    return null
  }

  return data as Card
}

// ─────────────────────────────────────────
// Trust profile
// ─────────────────────────────────────────

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('[fetchProfile]', error)
    return null
  }

  return data as Profile
}

export async function fetchUserCards(
  userId: string,
  statusFilter: 'active' | 'all' = 'active'
): Promise<Card[]> {
  let query = supabase.from('cards').select('*').eq('owner_user_id', userId)

  if (statusFilter === 'active') {
    query = query.eq('status', 'active')
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchUserCards]', error)
    return []
  }

  return (data ?? []) as Card[]
}

// ─────────────────────────────────────────
// Card creation
// ─────────────────────────────────────────

export async function createCard(params: {
  ownerUserId: string
  name: string
  imageUrl: string | null
  series: string | null
  memberName: string | null
  wantDescription: string | null
  description: string | null
}): Promise<Card> {
  const { data, error } = await supabase
    .from('cards')
    .insert({
      owner_user_id: params.ownerUserId,
      name: params.name,
      series: params.series,
      member_name: params.memberName,
      group_name: null,
      image_url: params.imageUrl,
      description: params.description,
      status: 'active',
      condition: null,
      want_description: params.wantDescription,
      allows_adjustment: false,
      adjustment_max: null,
      allows_mail: true,
      allows_handoff: true,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as Card
}

// ─────────────────────────────────────────
// Offer creation
// ─────────────────────────────────────────

export async function createOffer(params: {
  proposerId: string
  receiverId: string
  proposerCardId: string
  receiverCardId: string
  adjustmentAmount: number | null
  message: string | null
}): Promise<Offer> {
  const { data: currentTargetCard, error: targetCardError } = await supabase
    .from('cards')
    .select('id, owner_user_id, status')
    .eq('id', params.receiverCardId)
    .single()

  if (targetCardError) {
    throw targetCardError
  }

  if (!currentTargetCard || currentTargetCard.status !== 'active') {
    throw new Error('この出品は現在提案できません')
  }

  if (currentTargetCard.owner_user_id !== params.receiverId) {
    throw new Error('相手カードの所有者情報が不正です')
  }

  const { data: currentProposerCard, error: proposerCardError } = await supabase
    .from('cards')
    .select('id, owner_user_id, status')
    .eq('id', params.proposerCardId)
    .single()

  if (proposerCardError) {
    throw proposerCardError
  }

  if (!currentProposerCard || currentProposerCard.status !== 'active') {
    throw new Error('選択したあなたのカードは現在提案に使えません')
  }

  if (currentProposerCard.owner_user_id !== params.proposerId) {
    throw new Error('自分が所有していないカードは提案に使えません')
  }

  if (params.proposerId === params.receiverId) {
    throw new Error('自分の出品には提案できません')
  }

  const { data: offer, error: offerError } = await supabase
    .from('offers')
    .insert({
      proposer_user_id: params.proposerId,
      target_card_id: params.receiverCardId,
      status: 'pending',
      message: params.message,
    })
    .select()
    .single()

  if (offerError) {
    throw offerError
  }

  const { error: itemsError } = await supabase.from('offer_items').insert([
    {
      offer_id: offer.id,
      card_id: params.proposerCardId,
    },
    {
      offer_id: offer.id,
      card_id: params.receiverCardId,
    },
  ])

  if (itemsError) {
    console.error('[createOffer][offer_items insert failed]', itemsError)

    const { error: rollbackError } = await supabase
      .from('offers')
      .delete()
      .eq('id', offer.id)

    if (rollbackError) {
      console.error('[createOffer][rollback offer delete failed]', rollbackError)
    }

    throw itemsError
  }

  return offer as Offer
}

// ─────────────────────────────────────────
// 提案一覧
// ─────────────────────────────────────────

export async function fetchMyOffers(userId: string): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select(
      `
      *,
      proposer:profiles!offers_proposer_user_id_fkey(*),
      target_card:cards!offers_target_card_id_fkey(
        *,
        owner:profiles(*)
      ),
      items:offer_items(
        *,
        card:cards(*)
      )
    `
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchMyOffers]', error)
    return []
  }

  const offers = (data ?? []) as Offer[]

  return offers.filter((offer) => {
    const proposerId = offer.proposer_user_id
    const receiverId = offer.target_card?.owner_user_id
    return proposerId === userId || receiverId === userId
  })
}

// ─────────────────────────────────────────
// Offer actions
// ─────────────────────────────────────────

export async function acceptOffer(offerId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_offer_atomic_v3', {
    target_offer_id: offerId,
  })

  if (error) {
    throw error
  }
}

export async function declineOffer(offerId: string): Promise<void> {
  const { error } = await supabase
    .from('offers')
    .update({ status: 'declined' })
    .eq('id', offerId)

  if (error) {
    throw error
  }
}

// ─────────────────────────────────────────
// Trade detail / actions
// ─────────────────────────────────────────

export async function fetchTradeDetailByOffer(offerId: string): Promise<any> {
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  const userId = authData.user?.id ?? null
  if (!userId) {
    throw new Error('ログイン情報が取得できません')
  }

  const { data, error } = await supabase.rpc('get_trade_detail_by_offer', {
    p_offer_id: offerId,
  })

  if (error) {
    throw error
  }

  return data
}

export async function submitTradeShipment(params: {
  tradeId: string
  trackingNumber: string
  carrier: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('submit_trade_shipment', {
    p_trade_id: params.tradeId,
    p_tracking_number: params.trackingNumber,
    p_carrier: params.carrier,
  })

  if (error) {
    throw error
  }
}

export async function confirmTradeReceipt(tradeId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_trade_receipt', {
    p_trade_id: tradeId,
  })

  if (error) {
    throw error
  }
}

export async function cancelTrade(
  tradeId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('cancel_trade_atomic', {
    p_trade_id: tradeId,
    p_user_id: userId,
  })

  if (error) {
    throw error
  }
}

export async function openTradeDispute(params: {
  tradeId: string
  userId: string
  disputeReason: string
  detailText?: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('open_trade_dispute', {
    p_trade_id: params.tradeId,
    p_user_id: params.userId,
    p_dispute_reason: params.disputeReason,
    p_detail_text: params.detailText ?? null,
  })

  if (error) {
    throw error
  }
}