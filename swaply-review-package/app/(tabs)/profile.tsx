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
import { getMyCards } from "../../lib/cards";

export default function ProfileScreen() {
  const [myCards, setMyCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadMyCards = async () => {
        setLoading(true);
        const nextCards = await getMyCards();

        if (!isActive) return;
        setMyCards(nextCards);
        setLoading(false);
      };

      loadMyCards();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const renderItem = ({ item }: { item: CardItem }) => {
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
          <Text style={styles.status}>{item.status}</Text>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.series ?? "シリーズ未設定"}・{item.member ?? "メンバー未設定"}
          </Text>
          <Text style={styles.want} numberOfLines={1}>
            求: {item.want ?? "条件未設定"}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>マイページ</Text>
      <Text style={styles.subTitle}>自分が出品したカードを確認できます</Text>

      <View style={styles.accountCard}>
        <Text style={styles.accountLabel}>出品者</Text>
        <Text style={styles.accountName}>ログイン中ユーザー</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>出品カードを読み込み中...</Text>
        </View>
      ) : myCards.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>まだ出品したカードはありません</Text>
          <Text style={styles.emptyText}>
            出品タブからカードを登録すると、ここに表示されます。
          </Text>
        </View>
      ) : (
        <FlatList
          data={myCards}
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
    marginBottom: 16,
    fontSize: 13,
    color: "#6b7280",
  },
  accountCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fafafa",
    marginBottom: 16,
  },
  accountLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 6,
  },
  accountName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
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
    paddingBottom: 32,
  },
  card: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  image: {
    width: "100%",
    height: 180,
    backgroundColor: "#f3f4f6",
  },
  cardBody: {
    padding: 14,
  },
  status: {
    alignSelf: "flex-start",
    fontSize: 12,
    color: "#4338ca",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontWeight: "700",
  },
  name: {
    marginTop: 10,
    fontSize: 15,
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