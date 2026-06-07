// app/bookmarks.tsx
// 「保存した出品」一覧画面。
//
// 用途:
//   - 他人の出品を ♡ ボタン (home.tsx / listing/[id].tsx) で保存したもの一覧
//   - bookmarks テーブル (Phase A 新設) を fetchMyBookmarks で読む
//   - listing card preview (画像 + 名前 + 所有者) で表示、tap で listing 詳細へ
//   - 削除 button で removeBookmark
//
// 非用途:
//   - 求リスト (wanted_cards) ではない。matcher / easyScore には使わない
//   - app/wants.tsx (Phase A 後に「求リスト」rebrand 予定) とは別画面・別テーブル
//
// アクセス動線:
//   - HeaderActions の ♡ アイコン → /bookmarks (Phase A commit 4 で /wants から切替)

import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { fetchMyBookmarks, removeBookmark } from '@/lib/supabase'
import { BookmarkWithCard } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function BookmarksScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [bookmarks, setBookmarks] = useState<BookmarkWithCard[]>([])
  const [loading, setLoading] = useState(true)
  const [removingCardId, setRemovingCardId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (userId == null) {
      setBookmarks([])
      setLoading(false)
      return
    }
    setLoading(true)
    const data = await fetchMyBookmarks(userId)
    setBookmarks(data)
    setLoading(false)
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const handleCardPress = (cardId: string) => {
    router.push({ pathname: '/listing/[id]', params: { id: cardId } } as never)
  }

  const handleRemove = (bookmark: BookmarkWithCard) => {
    if (userId == null) return
    Alert.alert(
      '保存を解除しますか？',
      `「${bookmark.card.name}」を保存一覧から外します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingCardId(bookmark.card.id)
              await removeBookmark(userId, bookmark.card.id)
              setBookmarks((prev) =>
                prev.filter((b) => b.card.id !== bookmark.card.id),
              )
            } catch {
              Alert.alert('エラー', '解除に失敗しました')
            } finally {
              setRemovingCardId(null)
            }
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="保存した出品" />
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScreenHeader title="保存した出品" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.note}>
          気になる出品の♡ボタンから保存できます。
        </Text>

        {bookmarks.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="heart-outline" size={40} color={colors.border} />
            <Text style={styles.emptyTitle}>まだ保存した出品はありません</Text>
            <Text style={styles.emptySub}>
              出品詳細画面の♡ボタンから登録できます。
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {bookmarks.map((bookmark) => {
              const card = bookmark.card
              const ownerHandle =
                card.owner?.handle ?? card.owner?.display_name ?? 'ユーザー'
              const isRemoving = removingCardId === card.id

              return (
                <Pressable
                  key={bookmark.id}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => handleCardPress(card.id)}
                >
                  {card.image_url != null ? (
                    <Image
                      source={{ uri: card.image_url }}
                      style={styles.thumb}
                      contentFit="cover"
                      transition={200}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <Ionicons
                        name="image-outline"
                        size={20}
                        color={colors.border}
                      />
                    </View>
                  )}

                  <View style={styles.rowMeta}>
                    <Text style={styles.cardName} numberOfLines={2}>
                      {card.name}
                    </Text>
                    <Text style={styles.cardOwner} numberOfLines={1}>
                      @{ownerHandle}
                    </Text>
                  </View>

                  <Pressable
                    style={[
                      styles.removeButton,
                      isRemoving && styles.removeButtonDisabled,
                    ]}
                    onPress={() => handleRemove(bookmark)}
                    disabled={isRemoving}
                    hitSlop={8}
                  >
                    <Text style={styles.removeButtonText}>
                      {isRemoving ? '...' : '解除'}
                    </Text>
                  </Pressable>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.xl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  emptyBox: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardOwner: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  removeButton: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  removeButtonDisabled: {
    opacity: 0.4,
  },
  removeButtonText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
})
