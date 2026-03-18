import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type CardItem } from "../../data/cards";
import { getCards } from "../../lib/cards";

export default function HomeScreen() {
  const [cardList, setCardList] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadCards = async () => {
        setLoading(true);
        const nextCards = await getCards();

        if (!isActive) return;
        setCardList(nextCards);
        setLoading(false);
      };

      loadCards();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const renderItem = ({ item }: { item: CardItem }) => {
    const successCount = item.trust?.successCount ?? 0;
    const shipRate = item.trust?.shipRate ?? 0;
    const replyHours = item.trust?.replyHours ?? 0;
    const badge = item.trust?.badge ?? "Bronze";

    return (
      <Pressable
        style={styles.card}
        onPress={() =>
          router.push({
            pathname: "/card/[id]",
            params: { id: item.id },
          })
        }
      >
        <Image source={{ uri: item.image }} style={styles.image} />

        <View style={styles.cardBody}>
          <View style={styles.topRow}>
            <Text style={styles.status}>{item.status}</Text>
            <Text style={styles.badge}>{badge}</Text>
          </View>

          <Text style={styles.name}>{item.name}</Text>

          <Text style={styles.meta}>
            {item.series ?? "シリーズ未設定"}・{item.member ?? "メンバー未設定"}
          </Text>

          <Text style={styles.want} numberOfLines={1}>
            求: {item.want ?? "条件未設定"}
          </Text>

          <Text style={styles.seller}>
            出品者: {item.sellerName ?? "unknown_user"}
          </Text>

          <View style={styles.trustRow}>
            <Text style={styles.trustItem}>成立 {successCount}</Text>
            <Text style={styles.trustItem}>発送率 {shipRate}%</Text>
            <Text style={styles.trustItem}>返信 {replyHours}h</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>ホーム</Text>
        <Text style={styles.subTitle}>交換できるカード一覧</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>カードを読み込み中...</Text>
        </View>
      ) : (
        <FlatList
          data={cardList}
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
  },
  header: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111111",
  },
  subTitle: {
    marginTop: 6,
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
    padding: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  image: {
    width: "100%",
    height: 220,
    backgroundColor: "#f3f4f6",
  },
  cardBody: {
    padding: 14,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  badge: {
    fontSize: 12,
    color: "#92400e",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontWeight: "700",
  },
  name: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
    lineHeight: 22,
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    color: "#6b7280",
  },
  want: {
    marginTop: 8,
    fontSize: 13,
    color: "#374151",
  },
  seller: {
    marginTop: 8,
    fontSize: 12,
    color: "#4b5563",
  },
  trustRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  trustItem: {
    marginRight: 8,
    marginBottom: 8,
    fontSize: 11,
    color: "#374151",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
  },
});