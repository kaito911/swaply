import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type CardItem } from "../../data/cards";
import { getCardById } from "../../lib/cards";

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [card, setCard] = useState<CardItem | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const loadCard = async () => {
      setLoading(true);
      const nextCard = await getCardById(id);

      if (!isActive) return;
      setCard(nextCard);
      setLoading(false);
    };

    loadCard();

    return () => {
      isActive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.notFoundContainer} edges={["top"]}>
        <ActivityIndicator />
        <Text style={styles.notFoundText}>カードを読み込み中...</Text>
      </SafeAreaView>
    );
  }

  if (!card) {
    return (
      <SafeAreaView style={styles.notFoundContainer} edges={["top"]}>
        <Text style={styles.notFoundText}>カードが見つかりませんでした</Text>
      </SafeAreaView>
    );
  }

  const trust = card.trust;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Image source={{ uri: card.image }} style={styles.image} />

        <View style={styles.headerBlock}>
          <Text style={styles.status}>{card.status}</Text>
          <Text style={styles.name}>{card.name}</Text>
          <Text style={styles.seller}>出品者: {card.sellerName ?? "unknown_user"}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.sectionTitle}>カード情報</Text>
          <Text style={styles.infoText}>シリーズ: {card.series ?? "未設定"}</Text>
          <Text style={styles.infoText}>メンバー: {card.member ?? "未設定"}</Text>
          <Text style={styles.infoText}>希望条件: {card.want ?? "未設定"}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.sectionTitle}>状態・発送</Text>
          <Text style={styles.infoText}>説明: {card.description ?? "未設定"}</Text>
          <Text style={styles.infoText}>交換方法: {card.tradeMethod ?? "未設定"}</Text>
          <Text style={styles.infoText}>発送補足: {card.shippingNote ?? "未設定"}</Text>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.sectionTitle}>Trust</Text>
          <Text style={styles.infoText}>バッジ: {trust?.badge ?? "なし"}</Text>
          <Text style={styles.infoText}>成立件数: {trust?.successCount ?? 0}件</Text>
          <Text style={styles.infoText}>発送率: {trust?.shipRate ?? 0}%</Text>
          <Text style={styles.infoText}>平均返信: {trust?.replyHours ?? 0}時間</Text>
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname: "/trades",
              params: { id: card.id },
            })
          }
        >
          <Text style={styles.primaryButtonText}>このカードに交換提案する</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>戻る</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  notFoundContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  notFoundText: {
    fontSize: 16,
    color: "#111111",
  },
  image: {
    width: "100%",
    height: 420,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  headerBlock: {
    marginTop: 16,
  },
  status: {
    alignSelf: "flex-start",
    fontSize: 12,
    color: "#4338ca",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: "700",
  },
  name: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: "700",
    color: "#111111",
    lineHeight: 32,
  },
  seller: {
    marginTop: 8,
    fontSize: 13,
    color: "#4b5563",
  },
  infoBox: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#ffffff",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 10,
  },
  infoText: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 6,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: "#111111",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "600",
  },
});