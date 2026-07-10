// app/list/[section].tsx
//
// 「すべて見る」共通グリッド一覧 (Mercari 風 2 列、写真主役)。
// ホーム 4 レーン (recommended/new/easy/liked) + マイページ「出品中」(my-listings) の
// 「すべて見る」がここに集約される共通受け皿。section param で取得元を切替。
//
// β1: 各 section 最大 100 件を一括取得 + FlatList 仮想化で表示。真のページネーション
//     (.range オフセット) は件数が 100 を超えるようになったら follow-up (DB クエリに range 追加)。
// DB スキーマ変更なし (SELECT のみ、liked は fetchLikedCards 新設)。マッチロジック不変。
import { FeedGridCard } from '@/components/FeedGridCard'
import { ScreenHeader } from '@/components/ScreenHeader'
import {
  addLike,
  fetchEasyCards,
  fetchLikedCards,
  fetchMyBlockedUserIds,
  fetchMyLikedCardIds,
  fetchMyWantedCards,
  fetchNewCards,
  fetchRecommendedCards,
  fetchUserCards,
  removeLike,
} from '@/lib/supabase'
import { Card } from '@/lib/types'
import { colors, fontSize, spacing } from '@/constants/theme'
import { useAuthContext } from '@/providers/AuthProvider'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Section = 'recommended' | 'new' | 'easy' | 'liked' | 'my-listings'

const SECTION_TITLES: Record<Section, string> = {
  recommended: 'あなたへのおすすめ',
  new: '新着の交換',
  easy: '成立しやすい交換',
  liked: 'いいねした交換',
  'my-listings': '出品中',
}

const LIMIT = 100

function isSection(v: string | undefined): v is Section {
  return (
    v === 'recommended' ||
    v === 'new' ||
    v === 'easy' ||
    v === 'liked' ||
    v === 'my-listings'
  )
}

export default function ListSectionScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null
  const params = useLocalSearchParams<{ section?: string }>()
  const section = isSection(params.section) ? params.section : null

  const [cards, setCards] = useState<Card[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (section == null) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      let result: Card[] = []
      if (section === 'my-listings') {
        if (userId != null) result = await fetchUserCards(userId, 'active')
      } else if (section === 'liked') {
        if (userId != null) result = await fetchLikedCards(userId)
      } else {
        const blocked = userId != null ? await fetchMyBlockedUserIds() : []
        if (section === 'recommended' && userId != null) {
          result = await fetchRecommendedCards(userId, LIMIT, blocked)
        } else if (section === 'new') {
          result = await fetchNewCards(LIMIT, blocked)
        } else if (section === 'easy') {
          const wants = userId != null ? await fetchMyWantedCards(userId) : []
          result = await fetchEasyCards(userId ?? undefined, wants, blocked, LIMIT)
        }
      }
      setCards(result)
      // いいね overlay の初期状態 (自分の出品一覧では不要だが取得しても害なし)。
      if (userId != null && section !== 'my-listings') {
        setLikedIds(await fetchMyLikedCardIds(userId))
      }
    } finally {
      setLoading(false)
    }
  }, [section, userId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const toggleLike = useCallback(
    (cardId: string) => {
      if (userId == null) return
      const wasLiked = likedIds.has(cardId)
      // 楽観更新
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (wasLiked) next.delete(cardId)
        else next.add(cardId)
        return next
      })
      const op = wasLiked ? removeLike(userId, cardId) : addLike(userId, cardId)
      void op.catch((err) => {
        console.error('[ListSection][toggleLike]', err)
        // 失敗時ロールバック
        setLikedIds((prev) => {
          const next = new Set(prev)
          if (wasLiked) next.add(cardId)
          else next.delete(cardId)
          return next
        })
      })
    },
    [userId, likedIds],
  )

  const title = section != null ? SECTION_TITLES[section] : '一覧'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={title} />
      {section == null ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>一覧が見つかりませんでした</Text>
          <Text style={styles.backLink} onPress={() => router.back()}>
            戻る
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>まだ表示できる交換がありません</Text>
        </View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(c) => c.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isOwn = userId != null && item.owner_user_id === userId
            return (
              <FeedGridCard
                card={item}
                isOwn={isOwn}
                isLiked={likedIds.has(item.id)}
                onToggleLike={isOwn ? undefined : () => toggleLike(item.id)}
              />
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary },
  backLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    padding: spacing.base,
    gap: spacing.sm,
    paddingBottom: 120,
  },
  column: {
    gap: spacing.sm,
  },
})
