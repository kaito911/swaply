// app/list/[section].tsx
//
// 「すべて見る」共通グリッド一覧 (Mercari 風 3 列、写真主役)。
// ホーム 4 レーン (recommended/new/easy/liked) + マイページ「出品中」(my-listings) の
// 「すべて見る」がここに集約される共通受け皿。section param で取得元を切替。
//
// 上部ツールバー:
//   - 検索ボックス: タップで既存検索タブ /(tabs)/search へ (広く探す動線・プレフィルなし)。
//   - 絞込検索: シートで メンバー+種類 を選び、ロード済みカードをクライアント側フィルタ
//     (DB 追加クエリなし、MultiSelectAutocomplete 流用)。一覧を主役に保つためインライン
//     常時展開ではなくシートで一時表示。
//
// β1: 各 section 最大 100 件を一括取得 + FlatList 仮想化。真のページネーション (.range) は
//     件数が 100 を超えるようになったら follow-up。DB スキーマ変更なし。マッチロジック不変。
import { FeedGridCard } from '@/components/FeedGridCard'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
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
import {
  getCharacterSuggestionsAcrossWorks,
  getItemTypeSuggestions,
} from '@/lib/master'
import { Card, MasterCharacter, MasterItemType } from '@/lib/types'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuthContext } from '@/providers/AuthProvider'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
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

  // 絞込 (クライアント側): メンバー + 種類 の 2 軸。空なら全件。
  const [filterChars, setFilterChars] = useState<MasterCharacter[]>([])
  const [filterItems, setFilterItems] = useState<MasterItemType[]>([])
  const [showFilter, setShowFilter] = useState(false)

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
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (wasLiked) next.delete(cardId)
        else next.add(cardId)
        return next
      })
      const op = wasLiked ? removeLike(userId, cardId) : addLike(userId, cardId)
      void op.catch((err) => {
        console.error('[ListSection][toggleLike]', err)
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

  // クライアント側フィルタ (card.characters[] / item_types[] と選択 master ID の overlap)。
  const displayCards = useMemo(() => {
    const charIds = new Set(filterChars.map((c) => c.id))
    const itemIds = new Set(filterItems.map((t) => t.id))
    if (charIds.size === 0 && itemIds.size === 0) return cards
    return cards.filter((c) => {
      const okChar =
        charIds.size === 0 || (c.characters ?? []).some((id) => charIds.has(id))
      const okItem =
        itemIds.size === 0 || (c.item_types ?? []).some((id) => itemIds.has(id))
      return okChar && okItem
    })
  }, [cards, filterChars, filterItems])

  const filterCount = filterChars.length + filterItems.length
  const title = section != null ? SECTION_TITLES[section] : '一覧'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={title} />

      {section != null && (
        <View style={styles.toolbar}>
          {/* 検索ボックス (タップで検索タブへ) */}
          <Pressable
            style={styles.searchBox}
            onPress={() => router.push('/(tabs)/search' as never)}
          >
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <Text style={styles.searchPlaceholder}>検索</Text>
          </Pressable>
          {/* 絞込検索 (右下) */}
          <View style={styles.filterRow}>
            <Pressable style={styles.filterButton} onPress={() => setShowFilter(true)}>
              <Ionicons name="options-outline" size={15} color={colors.primary} />
              <Text style={styles.filterButtonText}>
                絞込検索{filterCount > 0 ? ` (${filterCount})` : ''}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

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
      ) : displayCards.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>
            {cards.length === 0
              ? 'まだ表示できる交換がありません'
              : '絞り込み条件に合う交換がありません'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayCards}
          keyExtractor={(c) => c.id}
          numColumns={3}
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

      {/* 絞込シート */}
      <Modal
        visible={showFilter}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilter(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFilter(false)} />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>絞込検索</Text>

            <Text style={styles.fieldLabel}>メンバー / キャラ</Text>
            <MultiSelectAutocomplete<MasterCharacter>
              selected={filterChars}
              onChange={setFilterChars}
              fetchSuggestions={getCharacterSuggestionsAcrossWorks}
              getKey={(c) => c.id}
              renderOption={(c) => <Text style={styles.msaMain}>{c.display_name_ja}</Text>}
              renderChip={(c) => <Text style={styles.msaChip}>{c.display_name_ja}</Text>}
              placeholder="例: ハルト"
              minInputChars={2}
              softLimit={10}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>種類</Text>
            <MultiSelectAutocomplete<MasterItemType>
              selected={filterItems}
              onChange={setFilterItems}
              fetchSuggestions={getItemTypeSuggestions}
              getKey={(t) => t.id}
              renderOption={(t) => <Text style={styles.msaMain}>{t.display_name_ja}</Text>}
              renderChip={(t) => <Text style={styles.msaChip}>{t.display_name_ja}</Text>}
              placeholder="例: トレカ"
              minInputChars={2}
              softLimit={10}
            />

            <View style={styles.sheetActions}>
              <Pressable
                style={styles.clearButton}
                onPress={() => {
                  setFilterChars([])
                  setFilterItems([])
                }}
              >
                <Text style={styles.clearButtonText}>クリア</Text>
              </Pressable>
              <Pressable style={styles.applyButton} onPress={() => setShowFilter(false)}>
                <Text style={styles.applyButtonText}>
                  適用（{displayCards.length}件）
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    height: 38,
  },
  searchPlaceholder: { fontSize: fontSize.sm, color: colors.textTertiary },
  filterRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  backLink: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
  content: { padding: spacing.base, gap: spacing.sm, paddingBottom: 120 },
  column: { gap: spacing.sm },
  // filter sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.base,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  msaMain: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  msaChip: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  clearButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  applyButton: {
    flex: 2,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
})
