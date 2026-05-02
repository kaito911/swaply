// app/(tabs)/search.tsx
import { searchCards } from '@/lib/supabase'
import { Card } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SearchScreen() {
  const { user } = useAuthContext()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text)

    if (debounceTimer.current != null) {
      clearTimeout(debounceTimer.current)
    }

    if (text.trim() === '') {
      setResults([])
      setSearched(false)
      return
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true)
      const cards = await searchCards(text)
      setResults(cards)
      setSearched(true)
      setLoading(false)
    }, 400)
  }, [])

  const handleCardPress = (card: Card) => {
    router.push({
      pathname: '/listing/[id]',
      params: { id: card.id },
    } as never)
  }

  const renderItem = ({ item }: { item: Card }) => {
    const isOwn = user != null && item.owner_user_id === user.id
    const ownerHandle = item.owner?.handle ?? item.owner?.display_name ?? 'ユーザー'

    return (
      <Pressable
        style={({ pressed }) => [styles.cardItem, pressed && styles.cardItemPressed]}
        onPress={() => handleCardPress(item)}
      >
        {item.image_url != null ? (
          <Image source={{ uri: item.image_url }} style={styles.cardThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.cardThumb, styles.cardThumbPlaceholder]} />
        )}

        <View style={styles.cardMeta}>
          {(item.series != null || item.member_name != null) && (
            <Text style={styles.cardSub} numberOfLines={1}>
              {[item.series, item.member_name].filter(Boolean).join(' · ')}
            </Text>
          )}
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          {item.want_description != null && (
            <Text style={styles.cardWant} numberOfLines={1}>求: {item.want_description}</Text>
          )}
          <Text style={styles.cardOwner} numberOfLines={1}>
            {isOwn ? '自分の出品' : `@${ownerHandle}`}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 検索バー */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="カード名、グループ、メンバーで検索"
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={handleSearch}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* 結果 */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : searched && results.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>見つかりませんでした</Text>
          <Text style={styles.emptySub}>別のキーワードで試してみてください</Text>
        </View>
      ) : !searched ? (
        <View style={styles.centerBox}>
          <Ionicons name="search-outline" size={40} color={colors.border} />
          <Text style={styles.emptySub}>カード名・グループ・メンバーで検索</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBarWrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    padding: 0,
    margin: 0,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  emptySub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    paddingBottom: 120,
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardItemPressed: {
    opacity: 0.7,
  },
  cardThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    flexShrink: 0,
    backgroundColor: colors.backgroundMuted,
  },
  cardThumbPlaceholder: {
    backgroundColor: colors.backgroundMuted,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardSub: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  cardName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardWant: {
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  cardOwner: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
})
