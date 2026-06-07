// app/(tabs)/home.tsx
//
// 3.5a commit 3 (機能 H v2 確定): ホーム 4 レーン構成に再構築。
//   Lane 1: いいねした交換 (新規、最上部、LargeCard)
//   Lane 2: あなたへのおすすめ (既存、LargeCard)
//   Lane 3: 新着の交換 (既存、LargeCard、ラベル「新着」→「新着の交換」)
//   Lane 4: 成立しやすい交換 (移動 + Small→Large 化)
//
// 機能 H v2: Trust ホーム削除のみが本質 (求強調撤回済、商品名 → 求の自然順)。
// LikeButton 構造的問題は 3.5b で wanted_cards.card_id 列追加で根本解決予定。
//
// 「いいねした交換」データソースの暫定対応:
//   wanted_cards に card_id 列がないため、現状は 3 レーン分の fetch 結果から
//   isCardLiked() でフィルタしてユニーク化する近似で表示。
//   3.5b で wanted_cards.card_id + 専用 fetch (fetchLikedCards) に置換予定。

import { BestTradeCandidateData } from '@/components/BestTradeCandidateCard'
import { EmptyHomeState } from '@/components/EmptyHomeState'
import { HeaderActions } from '@/components/HeaderActions'
import { HomeLargeCard } from '@/components/HomeLargeCard'
import { LaneSectionLabel } from '@/components/LaneSectionLabel'
import { SearchBar } from '@/components/SearchBar'
import { colors, fontSize, fontWeight, spacing } from '@/constants/theme'
import { Card, WantedCard } from '@/lib/types'
import {
  addBookmark,
  fetchEasyCards,
  fetchMyBlockedUserIds,
  fetchMyBookmarkedCardIds,
  fetchMyWantedCards,
  fetchNewCards,
  fetchRecommendedCards,
  removeBookmark,
  supabase,
} from '@/lib/supabase'
import { useAuthContext } from '@/providers/AuthProvider'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function HomeScreen() {
  const { user } = useAuthContext()

  const [recommendedCards, setRecommendedCards] = useState<Card[]>([])
  const [easyCards, setEasyCards] = useState<Card[]>([])
  const [newCards, setNewCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  // matcher / easyScore 経路の保持 (fetchEasyCards に local wants で渡す + Phase B 以降の
  // 参照余地として state ホールド)。getter は現状 JSX 非使用、eslint-disable で意図保持を明示。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [myWants, setMyWants] = useState<WantedCard[]>([])

  // ★ Phase A: bookmarks への ♡ button 移行 (commit ed3840a 前提の 3.5a pendingAdds/Archives
  // ハック解消)。bookmarks は card_id ベースなので fuzzy match 不要、Set<cardId> で完結。
  const [myBookmarkedCardIds, setMyBookmarkedCardIds] = useState<Set<string>>(
    new Set(),
  )

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

        // wants + blocked user ids + bookmarked card ids を並列取得。
        //   - wants: matcher / easyScore 入力 (fetchEasyCards に渡す)
        //   - blocked: home 表示から除外する Phase 0 PR-C
        //   - bookmarkedIds: ♡ button の初期状態 (card_id Set)
        const [wants, blockedUserIds, bookmarkedIds] = await Promise.all([
          user != null ? fetchMyWantedCards(user.id) : Promise.resolve([]),
          user != null ? fetchMyBlockedUserIds() : Promise.resolve([]),
          user != null ? fetchMyBookmarkedCardIds(user.id) : Promise.resolve(new Set<string>()),
        ])
        if (isActive) {
          setMyWants(wants)
          setMyBookmarkedCardIds(bookmarkedIds)
        }

        // TODO: 推薦RPC実装後に差し替え (Lane 2: 現行は自分以外のアクティブカードによる近似)
        const [rec, easy, newest] = await Promise.all([
          user != null
            ? fetchRecommendedCards(user.id, 20, blockedUserIds)
            : fetchNewCards(20, blockedUserIds),
          fetchEasyCards(user?.id, wants, blockedUserIds),
          fetchNewCards(20, blockedUserIds),
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

  // ★ Phase A: bookmarks 化により card_id ベースの exact match に簡素化。
  // pendingAdds / pendingArchives / matchesCard / isWantMatchV2 fuzzy はすべて不要に。
  const isCardBookmarked = useCallback(
    (card: Card): boolean => myBookmarkedCardIds.has(card.id),
    [myBookmarkedCardIds],
  )

  const handleToggleLike = useCallback(
    async (card: Card) => {
      if (user == null) return
      const wasBookmarked = myBookmarkedCardIds.has(card.id)

      // Optimistic UI update (card_id 直接比較なので fuzzy ハック不要)
      setMyBookmarkedCardIds((prev) => {
        const next = new Set(prev)
        if (wasBookmarked) next.delete(card.id)
        else next.add(card.id)
        return next
      })

      try {
        if (wasBookmarked) {
          await removeBookmark(user.id, card.id)
        } else {
          await addBookmark(user.id, card.id)
        }
      } catch (e) {
        console.error('[home][handleToggleLike]', e)
        // 失敗時は元の状態に revert
        setMyBookmarkedCardIds((prev) => {
          const next = new Set(prev)
          if (wasBookmarked) next.add(card.id)
          else next.delete(card.id)
          return next
        })
      }
    },
    [user, myBookmarkedCardIds],
  )

  // Lane 1「いいねした交換」用の暫定データ計算
  // bookmarks (card_id ベース) で filter する。Phase B 以降に fetchBookmarkedCards 専用
  // fetch に置換予定 (現在は home の rec/easy/new 取得結果から抽出する近似)。
  const likedCards = useMemo<Card[]>(() => {
    const all = [...recommendedCards, ...easyCards, ...newCards]
    const seen = new Set<string>()
    const result: Card[] = []
    for (const c of all) {
      if (seen.has(c.id)) continue
      if (!isCardBookmarked(c)) continue
      seen.add(c.id)
      result.push(c)
    }
    return result
  }, [recommendedCards, easyCards, newCards, isCardBookmarked])

  const renderLargeCard = (card: Card) => (
    <HomeLargeCard
      key={card.id}
      card={card}
      isOwn={user != null && card.owner_user_id === user.id}
      isLiked={isCardBookmarked(card)}
      onToggleLike={user != null ? () => handleToggleLike(card) : undefined}
    />
  )

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
            <HeaderActions />
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
            {/* Lane 1: いいねした交換 — LargeCard (3.5a commit 3 新規追加、最上部) */}
            {likedCards.length > 0 && (
              <>
                <LaneSectionLabel
                  title="いいねした交換"
                  sub="すべて見る"
                  onSubPress={() => router.push('/wants')}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.laneContent}
                >
                  {likedCards.map(renderLargeCard)}
                </ScrollView>
              </>
            )}

            {/* Lane 2: あなたへのおすすめ — LargeCard */}
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
              {recommendedCards.map(renderLargeCard)}
            </ScrollView>

            {/* Lane 3: 新着の交換 — LargeCard (ラベル「新着」→「新着の交換」) */}
            <LaneSectionLabel
              title="新着の交換"
              sub="更新順"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.laneContent}
            >
              {newCards.map(renderLargeCard)}
            </ScrollView>

            {/* Lane 4: 成立しやすい交換 — LargeCard (3.5a commit 3 で Small→Large 化) */}
            <LaneSectionLabel
              title="成立しやすい交換"
              sub="初心者でも"
            />
            {/* レーン全体の意味を伝える補足文 */}
            <Text style={styles.laneSubNote} numberOfLines={1}>
              あなたの求やキャラ一致をもとに表示
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.laneContent}
            >
              {easyCards.map(renderLargeCard)}
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
  // Lane 4 (成立しやすい) 見出し直下の補足文
  laneSubNote: {
    paddingHorizontal: spacing.base,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    color: colors.textSecondary,
  },
})
