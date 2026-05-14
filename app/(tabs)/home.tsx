// app/(tabs)/home.tsx
import { BestTradeCandidateData } from '@/components/BestTradeCandidateCard'
import { EmptyHomeState } from '@/components/EmptyHomeState'
import { HomeLargeCard } from '@/components/HomeLargeCard'
import { HomeSmallCard } from '@/components/HomeSmallCard'
import { LaneSectionLabel } from '@/components/LaneSectionLabel'
import { SearchBar } from '@/components/SearchBar'
import { colors, fontSize, fontWeight, spacing } from '@/constants/theme'
import { Card, WantedCard, WantMatchScore } from '@/lib/types'
import { scoreWantMatchV2 } from '@/lib/matcher' // ★ Step 3 commit 3: v1 → v2 切替
import {
  fetchEasyCards,
  fetchMyWantedCards,
  fetchNewCards,
  fetchRecommendedCards,
  supabase,
} from '@/lib/supabase'
import { useAuthContext } from '@/providers/AuthProvider'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// ★ updated: easyCardsWithMatch の要素型
type EasyCardWithMatch = {
  card: Card
  bestMatch: WantMatchScore
  matchReasonLabel: string | null
}

export default function HomeScreen() {
  const { user } = useAuthContext()

  const [recommendedCards, setRecommendedCards] = useState<Card[]>([])
  const [easyCards, setEasyCards] = useState<Card[]>([])
  const [newCards, setNewCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [myWants, setMyWants] = useState<WantedCard[]>([])

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      const load = async () => {
        setLoading(true)

        // ①レーン: get_best_trade_candidate RPC（ログイン時のみ）
        let candidateData: BestTradeCandidateData | null = null

        if (user != null) {
          const { data: rawCandidate, error: candidateError } = await supabase.rpc(
            'get_best_trade_candidate',
            { p_user_id: user.id }
          )
          if (candidateError) {
            console.error('[home] get_best_trade_candidate', candidateError)
          }
          if (rawCandidate != null) {
            candidateData = rawCandidate as BestTradeCandidateData
          }
        }

        // wants を先に取得してから fetchEasyCards に渡す（状態管理と取得責務の分離）
        const wants = user != null ? await fetchMyWantedCards(user.id) : []
        if (isActive) setMyWants(wants)

        // TODO: 推薦RPC実装後に差し替え (Lane 1: 現行は自分以外のアクティブカードによる近似)
        const [rec, easy, newest] = await Promise.all([
          user != null ? fetchRecommendedCards(user.id) : fetchNewCards(),
          fetchEasyCards(user?.id, wants),
          fetchNewCards(),
        ])

        if (!isActive) return
        const myId = user?.id ?? null

        setRecommendedCards(rec.filter((c) => c.owner_user_id !== myId))

        // bestCandidate を easyCards の先頭に Card として挿入する
        if (candidateData != null) {
          const cd = candidateData
          const bestCard: Card = {
            id: cd.target_card.id,
            name: cd.target_card.name,
            image_url: cd.target_card.image_url,
            image_back_url: null,
            group_name: null,
            series: null,
            member_name: null,
            description: null,
            condition: null,
            want_description: null,
            allows_adjustment: false,
            adjustment_max: null,
            allows_mail: false,
            allows_handoff: false,
            status: 'active',
            owner_user_id: cd.target_user.id,
            category: null,
            work_id: null,
            characters: [],
            item_types: [],
            created_at: '',
            updated_at: '',
            owner: undefined,
          }
          setEasyCards([bestCard, ...easy.filter((c) => c.id !== cd.target_card.id && c.owner_user_id !== myId)])
        } else {
          setEasyCards(easy.filter((c) => c.owner_user_id !== myId))
        }

        setNewCards(newest.filter((c) => c.owner_user_id !== myId))
        setLoading(false)
      }

      load()

      return () => {
        isActive = false
      }
    }, [user?.id])
  )

  const handleSearchPress = () => {
    router.push('/(tabs)/search')
  }

  const getMatchReasonLabel = (score: WantMatchScore): string | null => {
    if (score === 'strong') return 'あなたの求と一致'
    if (score === 'medium') return '同メンバーで交換しやすい'
    if (score === 'weak') return 'あなたの求に近い'
    return null
  }

  // ★ Step 3 commit 3: scoreWantMatchV2 (any-overlap + overlap 数重み付け)
  const easyCardsWithMatch: EasyCardWithMatch[] = easyCards.map((card) => {
    const bestMatch = myWants.reduce<WantMatchScore>((best, want) => {
      const s = scoreWantMatchV2(card, want)
      if (s === 'strong') return 'strong'
      if (s === 'medium' && best !== 'strong') return 'medium'
      if (s === 'weak' && best === 'none') return 'weak'
      return best
    }, 'none')
    return { card, bestMatch, matchReasonLabel: getMatchReasonLabel(bestMatch) }
  })

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.headerWrap}>
          <View style={styles.headerTop}>
            <Text style={styles.logoText}>Swaply</Text>
          </View>
          <View style={styles.headerRow}>
            <View style={styles.searchWrap}>
              <SearchBar onPress={handleSearchPress} />
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>カードを読み込み中...</Text>
          </View>
        ) : recommendedCards.length === 0 && easyCards.length === 0 && newCards.length === 0 ? (
          <EmptyHomeState />
        ) : (
          <>
            {/* bestCandidate は easyCards 先頭に統合済み */}

            {/* Lane 1: あなたへのおすすめ — LargeCard */}
            <LaneSectionLabel
              title="あなたへのおすすめ"
              sub="すべて見る"
              onSubPress={() => router.push('/(tabs)/search')}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.laneContent}
            >
              {recommendedCards.map((card) => (
                <HomeLargeCard
                  key={card.id}
                  card={card}
                  isOwn={user != null && card.owner_user_id === user.id}
                />
              ))}
            </ScrollView>

            {/* Lane 2: 成立しやすい交換 — SmallCard */}
            <LaneSectionLabel
              title="成立しやすい交換"
              sub="初心者でも"
            />
            {/* ★ added: レーン全体の意味を伝える補足文 */}
            <Text style={styles.laneSubNote} numberOfLines={1}>
              あなたの求やメンバー一致をもとに表示
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.laneContent}
            >
              {/* ★ updated: 描画前に計算済みの easyCardsWithMatch を使う */}
              {easyCardsWithMatch.map(({ card, bestMatch, matchReasonLabel }) => (
                <HomeSmallCard
                  key={card.id}
                  card={card}
                  isOwn={user != null && card.owner_user_id === user.id}
                  isWantMatched={bestMatch !== 'none'}
                  matchReasonLabel={matchReasonLabel}
                />
              ))}
            </ScrollView>

            {/* Lane 3: 新着 — LargeCard */}
            <LaneSectionLabel
              title="新着"
              sub="更新順"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.laneContent}
            >
              {newCards.map((card) => (
                <HomeLargeCard
                  key={card.id}
                  card={card}
                  isOwn={user != null && card.owner_user_id === user.id}
                />
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  headerWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  logoText: {
    fontSize: 24,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
    letterSpacing: -0.5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchWrap: {
    flex: 1,
  },
  loadingBox: {
    marginTop: spacing['4xl'],
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  laneContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  // ★ added: Lane 2 見出し直下の補足文
  laneSubNote: {
    paddingHorizontal: spacing.base,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    color: colors.textSecondary,
  },
})
