import { type CardItem, cards as mockCards } from "../data/cards";
import { supabase } from "./supabase";

export type CreateCardInput = {
  name: string;
  image?: string;
  series?: string;
  member?: string;
  want?: string;
  description?: string;
};

type CardRow = {
  id: string;
  owner_user_id: string;
  name: string;
  series: string | null;
  member_name: string | null;
  image_url: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
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
};

const FALLBACK_IMAGE_URL = "https://picsum.photos/300/420?swaply=default";

function normalizeProfile(
  profiles: CardRow["profiles"]
): { handle?: string | null; display_name?: string | null } | null {
  if (!profiles) return null;
  if (Array.isArray(profiles)) {
    return profiles[0] ?? null;
  }
  return profiles;
}

function mapRowToCardItem(row: CardRow): CardItem {
  const profile = normalizeProfile(row.profiles);

  return {
    id: row.id,
    name: row.name,
    image: row.image_url || FALLBACK_IMAGE_URL,
    status: row.status === "active" ? "交換可能" : row.status,
    series: row.series ?? undefined,
    member: row.member_name ?? undefined,
    want: undefined,
    description: row.description ?? undefined,
    tradeMethod: "未設定",
    shippingNote: "未設定",
    sellerName:
      profile?.handle ||
      profile?.display_name ||
      row.owner_user_id.slice(0, 8),
    trust: {
      badge: "Bronze",
      successCount: 0,
      shipRate: 0,
      replyHours: 0,
    },
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

export async function getCards(): Promise<CardItem[]> {
  const { data, error } = await supabase
    .from("cards")
    .select(
      `
      id,
      owner_user_id,
      name,
      series,
      member_name,
      image_url,
      description,
      status,
      created_at,
      updated_at,
      profiles:owner_user_id (
        id,
        handle,
        display_name
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.log("getCards error:", error.message);
    return [...mockCards];
  }

  return (data as CardRow[]).map(mapRowToCardItem);
}

export async function getCardById(id?: string): Promise<CardItem | undefined> {
  if (!id) return undefined;

  const { data, error } = await supabase
    .from("cards")
    .select(
      `
      id,
      owner_user_id,
      name,
      series,
      member_name,
      image_url,
      description,
      status,
      created_at,
      updated_at,
      profiles:owner_user_id (
        id,
        handle,
        display_name
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.log("getCardById error:", error.message);
    return mockCards.find((item) => item.id === id);
  }

  if (!data) {
    return undefined;
  }

  return mapRowToCardItem(data as CardRow);
}

export async function getMyCards(): Promise<CardItem[]> {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from("cards")
      .select(
        `
        id,
        owner_user_id,
        name,
        series,
        member_name,
        image_url,
        description,
        status,
        created_at,
        updated_at,
        profiles:owner_user_id (
          id,
          handle,
          display_name
        )
      `
      )
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.log("getMyCards error:", error.message);
      return [];
    }

    return (data as CardRow[]).map(mapRowToCardItem);
  } catch (error) {
    console.log("getMyCards auth error:", error);
    return [];
  }
}

export async function createCard(input: CreateCardInput): Promise<CardItem> {
  const userId = await getCurrentUserId();

  const safeImage =
    input.image && input.image.startsWith("http")
      ? input.image
      : "https://picsum.photos/300/420?swaply=" + Date.now().toString();

  const insertPayload = {
    owner_user_id: userId,
    name: input.name.trim(),
    series: input.series?.trim() || null,
    member_name: input.member?.trim() || null,
    image_url: safeImage,
    description: input.description?.trim() || null,
    status: "active",
  };

  const { data, error } = await supabase
    .from("cards")
    .insert(insertPayload)
    .select(
      `
      id,
      owner_user_id,
      name,
      series,
      member_name,
      image_url,
      description,
      status,
      created_at,
      updated_at,
      profiles:owner_user_id (
        id,
        handle,
        display_name
      )
    `
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRowToCardItem(data as CardRow);
}