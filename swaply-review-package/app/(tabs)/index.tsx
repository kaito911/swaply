import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { colors, fontSize, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchEasyCards,
  fetchNewCards,
  fetchRecommendedCards,
} from '@/lib/supabase'
import { Card } from '@/lib/types'

type HomeSectionProps = {
  title: string
  subtitle?: string
  data: Card[]
  emptyText: string
}

function ListingCard({ item }: { item: Card }) {
  const categoryParts = [item.group_name, item.member_name, item.series].filter(
    (v): v is string => v != null && v.length > 0
  )

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/listing/${item.id}` as never)}
    >
      {item.image_url != null ? (
        <Image source={{ uri: item.image_url }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Text style={styles.cardImagePlaceholderText}>📷</Text>
        </View>
      )}

      <View style={styles.cardBody}>
        {categoryParts.length > 0 && (
          <Text style={styles.cardMeta} numberOfLines={1}>
            {categoryParts.join(' · ')}
          </Text>
        )}

        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </Text>

        <Text style={styles.cardDescription} numberOfLines={2}>
          {item.want_description ?? '交換条件は出品詳細で確認できます'}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.cardOwner} numberOfLines={1}>
            @{item.owner?.handle ?? 'unknown'}
          </Text>

          <View style={styles.tagRow}>
            {item.allows_mail && <Text style={styles.tag}>郵送可</Text>}
            {item.allows_handoff && <Text style={styles.tag}>手渡し可</Text>}
            {item.allows_adjustment && <Text style={styles.tag}>調整金可</Text>}
          </View>
        </View>
      </View>
    </Pressable>
  )
}

function HomeSection({
  title,
  subtitle,
  data,
  emptyText,
}: HomeSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle != null && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
      </View>

      {data.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          horizontal
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ListingCard item={item} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalListContent}
        />
      )}
    </View>
  )
}

export default function HomeScreen() {
  const { userId, loading: authLoading } = useAuth()

  const [newCards, setNewCards] = useState<Card[]>([])
  const [easyCards, setEasyCards] = useState<Card[]>([])
  const [recommendedCards, setRecommendedCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadHome = useCallback(async () => {
    try {
      const [newData, easyData, recommendedData] = await Promise.all([
        fetchNewCards(12),
        fetchEasyCards(12),
        userId != null ? fetchRecommendedCards(userId, 12) : Promise.resolve([]),
      ])

      setNewCards(newData)
      setEasyCards(easyData)
      setRecommendedCards(recommendedData)
    } catch (error) {
      console.error('Home load error:', error)
      setNewCards([])
      setEasyCards([])
      setRecommendedCards([])
    }
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      if (authLoading) return

      const run = async () => {
        setLoading(true)
        await loadHome()
        setLoading(false)
      }

      void run()
    }, [authLoading, loadHome])
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadHome()
    setRefreshing(false)
  }

  if (authLoading || loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>交換できるカードを探そう</Text>
          <Text style={styles.heroSubtitle}>
            新着・成立しやすい出品・おすすめをまとめてチェック
          </Text>
        </View>

        <HomeSection
          title="おすすめ"
          subtitle="あなた向けの出品"
          data={recommendedCards}
          emptyText="おすすめの出品はまだありません"
        />

        <HomeSection
          title="新着出品"
          subtitle="最近追加されたカード"
          data={newCards}
          emptyText="新着の出品はまだありません"
        />

        <HomeSection
          title="成立しやすい交換"
          subtitle="調整金なしで提案しやすい出品"
          data={easyCards}
          emptyText="成立しやすい出品はまだありません"
        />

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  )
}

const CARD_WIDTH = 220

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: spacing.base,
    paddingBottom: spacing.xl,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  hero: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  heroTitle: {
    fontSize: fontSize['3xl'] ?? 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },
  heroSubtitle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  sectionHeaderText: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  horizontalListContent: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  cardImage: {
    width: '100%',
    height: 140,
    backgroundColor: colors.backgroundMuted,
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImagePlaceholderText: {
    fontSize: 36,
  },
  cardBody: {
    padding: spacing.base,
    gap: spacing.xs,
  },
  cardMeta: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
    minHeight: 40,
  },
  cardDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
    minHeight: 36,
  },
  cardFooter: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  cardOwner: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    fontSize: 11,
    color: colors.textSecondary,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  emptyBox: {
    marginHorizontal: spacing.base,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  bottomSpace: {
    height: 120,
  },
})