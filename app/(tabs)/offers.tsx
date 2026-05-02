// ⚠️ DEPRECATED: このファイルは旧実装です。現役の実装は propose.tsx を参照してください。
// このファイルは href: null で非表示になっており、実際には使われていません。
// 将来的に削除予定です。
// app/(tabs)/offers.tsx
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type OfferItem } from "../../data/offers";
import { getOffers } from "../../lib/offers";
import { supabase } from "../../lib/supabase";

type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "completed"
  | string;

function getStatusLabel(status: OfferStatus) {
  switch (status) {
    case "pending":
      return "提案中";
    case "accepted":
      return "成立";
    case "declined":
      return "見送り";
    case "cancelled":
      return "キャンセル";
    case "completed":
      return "完了";
    default:
      return status;
  }
}

function canOpenTrade(status: OfferStatus) {
  return status === "accepted" || status === "completed";
}

export default function OffersScreen() {
  const [offerList, setOfferList] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingOfferId, setOpeningOfferId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadOffers = async () => {
        try {
          setLoading(true);
          const nextOffers = await getOffers();

          if (!isActive) return;
          setOfferList(nextOffers);
        } catch (error) {
          if (!isActive) return;
          Alert.alert("読み込みエラー", "オファー一覧の取得に失敗しました。");
        } finally {
          if (!isActive) return;
          setLoading(false);
        }
      };

      loadOffers();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const handleOpenTrade = useCallback(async (offerId: string, status: OfferStatus) => {
    if (!canOpenTrade(status)) {
      Alert.alert("まだ開けません", "このオファーはまだ取引画面を開ける状態ではありません。");
      return;
    }

    try {
      setOpeningOfferId(offerId);

      if (status === "accepted") {
        const { error } = await supabase.rpc("create_trade_from_offer", {
          p_offer_id: offerId,
        });

        if (error) {
          throw error;
        }
      }

      router.push({
        pathname: "/trade/[offerId]",
        params: { offerId },
      });
    } catch (error: any) {
      Alert.alert(
        "取引画面を開けませんでした",
        error?.message || "取引情報の作成または取得に失敗しました。"
      );
    } finally {
      setOpeningOfferId(null);
    }
  }, []);

  const renderItem = ({ item }: { item: OfferItem }) => {
    const status = item.status as OfferStatus;
    const openable = canOpenTrade(status);
    const isOpening = openingOfferId === item.id;

    return (
      <View style={styles.offerCard}>
        <View style={styles.row}>
          <Text style={styles.status}>{getStatusLabel(status)}</Text>
          <Text style={styles.date}>{item.createdAt}</Text>
        </View>

        <Text style={styles.sectionLabel}>あなたが出すもの</Text>
        <Text style={styles.cardName}>{item.offeredCardName}</Text>

        <Text style={styles.sectionLabel}>相手に求めるもの</Text>
        <Text style={styles.cardName}>{item.requestedCardName}</Text>

        <Text style={styles.meta}>
          出品者: {item.requestedSellerName ?? "unknown_user"}
        </Text>

        <Text style={styles.meta}>
          調整金:{" "}
          {item.adjustAmount !== undefined
            ? `${item.adjustAmount}円（${
                item.adjustPayer === "me" ? "自分が出す" : "相手が出す"
              }）`
            : "なし"}
        </Text>

        <Text style={styles.meta}>
          メッセージ: {item.message ?? "なし"}
        </Text>

        {openable ? (
          <TouchableOpacity
            style={[
              styles.tradeButton,
              isOpening ? styles.tradeButtonDisabled : undefined,
            ]}
            onPress={() => handleOpenTrade(item.id, status)}
            disabled={isOpening}
            activeOpacity={0.85}
          >
            <Text style={styles.tradeButtonText}>
              {isOpening
                ? "取引画面を開いています..."
                : status === "completed"
                ? "取引詳細を見る"
                : "取引画面へ進む"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>
              {status === "pending"
                ? "相手の承認待ちです"
                : status === "declined"
                ? "この提案は見送りになりました"
                : status === "cancelled"
                ? "この提案はキャンセルされています"
                : "このオファーはまだ取引画面を開けません"}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>オファー</Text>
      <Text style={styles.subTitle}>送信した交換提案を確認</Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>オファーを読み込み中...</Text>
        </View>
      ) : offerList.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>まだオファーはありません</Text>
          <Text style={styles.emptyText}>
            ホームからカードを選び、交換提案を送るとここに表示されます。
          </Text>
        </View>
      ) : (
        <FlatList
          data={offerList}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111111",
  },
  subTitle: {
    marginTop: 6,
    marginBottom: 20,
    fontSize: 13,
    color: "#6b7280",
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: "#6b7280",
  },
  listContent: {
    paddingBottom: 120,
  },
  offerCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#ffffff",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  status: {
    fontSize: 12,
    color: "#4338ca",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontWeight: "700",
  },
  date: {
    fontSize: 11,
    color: "#6b7280",
  },
  sectionLabel: {
    marginTop: 6,
    fontSize: 11,
    color: "#6b7280",
  },
  cardName: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
    lineHeight: 22,
  },
  meta: {
    marginTop: 8,
    fontSize: 13,
    color: "#4b5563",
    lineHeight: 20,
  },
  tradeButton: {
    marginTop: 14,
    backgroundColor: "#6D46F6",
    borderRadius: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  tradeButtonDisabled: {
    opacity: 0.6,
  },
  tradeButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  hintBox: {
    marginTop: 14,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  hintText: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 18,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#ffffff",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#4b5563",
  },
});