import { offers as mockOffers, type OfferItem, type OfferStatus } from "../data/offers";
import { supabase } from "./supabase";

type OfferRow = {
  id: string;
  proposer_user_id: string;
  target_card_id: string;
  message: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  updated_at: string;
  cards?:
    | {
        id: string;
        name: string;
        owner_user_id: string;
        profiles?:
          | {
              id: string;
              handle: string | null;
              display_name: string | null;
            }
          | {
              id: string;
              handle: string | null;
              display_name: string | null;
            }[]
          | null;
      }
    | {
        id: string;
        name: string;
        owner_user_id: string;
        profiles?:
          | {
              id: string;
              handle: string | null;
              display_name: string | null;
            }
          | {
              id: string;
              handle: string | null;
              display_name: string | null;
            }[]
          | null;
      }[]
    | null;
  offer_items?:
    | {
        id: string;
        card_id: string;
        cards?:
          | {
              id: string;
              name: string;
            }
          | {
              id: string;
              name: string;
            }[]
          | null;
      }[]
    | null;
};

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

function mapOfferStatus(status: OfferRow["status"]): OfferStatus {
  return status;
}

function mapOfferRowToItem(row: OfferRow): OfferItem {
  const requestedCard = normalizeOne(row.cards);
  const requestedProfile = normalizeOne(requestedCard?.profiles);
  const firstOfferItem = row.offer_items?.[0];
  const offeredCard = normalizeOne(firstOfferItem?.cards);

  return {
    id: row.id,
    offeredCardId: firstOfferItem?.card_id ?? "",
    offeredCardName: offeredCard?.name ?? "不明なカード",
    requestedCardId: row.target_card_id,
    requestedCardName: requestedCard?.name ?? "不明なカード",
    requestedSellerName:
      requestedProfile?.handle ||
      requestedProfile?.display_name ||
      requestedCard?.owner_user_id?.slice(0, 8) ||
      "unknown_user",
    adjustAmount: undefined,
    adjustPayer: undefined,
    message: row.message ?? undefined,
    status: mapOfferStatus(row.status),
    createdAt: new Date(row.created_at).toLocaleString("ja-JP"),
  };
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    throw new Error("ログインユーザーが見つかりません。");
  }

  return user.id;
}

export async function getOffers(): Promise<OfferItem[]> {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from("offers")
      .select(
        `
        id,
        proposer_user_id,
        target_card_id,
        message,
        status,
        created_at,
        updated_at,
        cards:target_card_id (
          id,
          name,
          owner_user_id,
          profiles:owner_user_id (
            id,
            handle,
            display_name
          )
        ),
        offer_items (
          id,
          card_id,
          cards:card_id (
            id,
            name
          )
        )
      `
      )
      .eq("proposer_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.log("getOffers error:", error.message);
      return [...mockOffers];
    }

    return (data as OfferRow[]).map(mapOfferRowToItem);
  } catch (error) {
    console.log("getOffers auth error:", error);
    return [...mockOffers];
  }
}

export async function createOffer(input: OfferItem): Promise<OfferItem> {
  const userId = await getCurrentUserId();

  const { data: offerData, error: offerError } = await supabase
    .from("offers")
    .insert({
      proposer_user_id: userId,
      target_card_id: input.requestedCardId,
      message: input.message?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (offerError) {
    throw new Error(offerError.message);
  }

  const offerId = offerData.id;

  const { error: itemError } = await supabase.from("offer_items").insert({
    offer_id: offerId,
    card_id: input.offeredCardId,
  });

  if (itemError) {
    throw new Error(itemError.message);
  }

  return {
    ...input,
    id: offerId,
    status: "pending",
  };
}