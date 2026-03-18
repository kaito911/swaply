export type CardItem = {
  id: string;
  name: string;
  image: string;
  status: string;
  series?: string;
  member?: string;
  want?: string;
  description?: string;
  tradeMethod?: string;
  shippingNote?: string;
  sellerName?: string;
  trust?: {
    badge: string;
    successCount: number;
    shipRate: number;
    replyHours: number;
  };
};

export const cards: CardItem[] = [
  {
    id: "1",
    name: "TREASURE ジュンギュ トレカ",
    image: "https://picsum.photos/300/420?random=1",
    status: "交換可能",
    series: "REBOOT",
    member: "ジュンギュ",
    want: "ヒョンソク同種優先 / 異種も検討",
    description: "目立つ傷なし。スリーブ保管しています。",
    tradeMethod: "郵送",
    shippingNote: "追跡ありで発送",
    sellerName: "haru_trade",
    trust: {
      badge: "Bronze",
      successCount: 12,
      shipRate: 98,
      replyHours: 3,
    },
  },
  {
    id: "2",
    name: "SEVENTEEN ミンハオ トレカ",
    image: "https://picsum.photos/300/420?random=2",
    status: "交換可能",
    series: "FOLLOW",
    member: "ミンハオ",
    want: "ジョンハン優先",
    description: "開封後すぐにスリーブへ入れています。",
    tradeMethod: "郵送 / 手渡し",
    shippingNote: "厚紙補強で発送",
    sellerName: "mii_swap",
    trust: {
      badge: "Silver",
      successCount: 26,
      shipRate: 99,
      replyHours: 2,
    },
  },
  {
    id: "3",
    name: "NCT DREAM ジェミン トレカ",
    image: "https://picsum.photos/300/420?random=3",
    status: "交換可能",
    series: "ISTJ",
    member: "ジェミン",
    want: "マーク優先 / 同種希望",
    description: "初期傷は見当たりません。",
    tradeMethod: "郵送",
    shippingNote: "防水＋硬質ケース",
    sellerName: "rio_collect",
    trust: {
      badge: "Bronze",
      successCount: 8,
      shipRate: 100,
      replyHours: 5,
    },
  },
  {
    id: "4",
    name: "IVE レイ トレカ",
    image: "https://picsum.photos/300/420?random=4",
    status: "交換可能",
    series: "I'VE MINE",
    member: "レイ",
    want: "ウォニョン / ガウル検討可",
    description: "大きな傷なし。丁寧に保管しています。",
    tradeMethod: "手渡し / 郵送",
    shippingNote: "普通郵便 + 補強",
    sellerName: "rei_fan",
    trust: {
      badge: "Gold",
      successCount: 41,
      shipRate: 100,
      replyHours: 1,
    },
  },
];