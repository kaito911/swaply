export type OfferStatus = "pending" | "accepted" | "declined" | "cancelled";

export type OfferItem = {
  id: string;
  offeredCardId: string;
  offeredCardName: string;
  requestedCardId: string;
  requestedCardName: string;
  requestedSellerName?: string;
  adjustAmount?: number;
  adjustPayer?: "me" | "them";
  message?: string;
  status: OfferStatus;
  createdAt: string;
};

export const offers: OfferItem[] = [];