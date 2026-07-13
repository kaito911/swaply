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
import { FeedGridCard } from '@/components/FeedGridCard'
import { HeaderActions } from '@/components/HeaderActions'
import { HomeLargeCard } from '@/components/HomeLargeCard'
import { LaneSectionLabel } from '@/components/LaneSectionLabel'
import { PushPermissionPrePrompt } from '@/components/PushPermissionPrePrompt'
import { SearchBar } from '@/components/SearchBar'
import { colors, fontSize, fontWeight, spacing } from '@/constants/theme'
import { Card, WantedCard } from '@/lib/types'
import {
  addLike,
  fetchEasyCards,
  fetchMyBlockedUserIds,
  fetchMyLikedCardIds,
  fetchMyWantedCards,
  fetchCardsPaged,
  fetchNewCards,
  fetchRecommendedCards,
  removeLike,
  supabase,
} from '@/lib/supabase'
import { useAuthContext } from '@/providers/AuthProvider'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const GRID_PAGE = 30

export default function HomeScreen() {
  const { user } = useAuthContext()

  const [recommendedCards, setRecommendedCards] = useState<Card[]>([])
  const [easyCards, setEasyCards] = useState<Card[]>([])
  const [newCards, setNewCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  // pull-to-refresh 専用フラグ。★loading とは厳密に分離: refresh 時は loading を触らない
  // (loading=true にするとレーンが loadingBox に潰れ scroll offset が飛ぶため)。
  const [refreshing, setRefreshing] = useState(false)
  // matcher / easyScore 経路の保持 (fetchEasyCards に local wants で渡す + Phase B 以降の
  // 参照余地として state ホールド)。getter は現状 JSX 非使用、eslint-disable で意図保持を明示。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [myWants, setMyWants] = useState<WantedCard[]>([])

  // ★ Phase A: ♡ button (UI 上「いいね」) を liked_cards テーブルに保存。
  // card_id ベースなので fuzzy match 不要、Set<cardId> で完結
  // (3.5a の pendingAdds/Archives ハック解消)。
  const [myLikedCardIds, setMyLikedCardIds] = useState<Set<string>>(new Set())

  // ホーム下部の無限グリッド (レーンの下・新着順・無限スクロール)。
  const { width: screenW } = useWindowDimensions()
  const gridCardWidth = Math.floor((screenW - spacing.base * 2 - spacing.sm * 2) / 3)
  const [gridCards, setGridCards] = useState<Card[]>([])
  const [gridEnd, setGridEnd] = useState(false)
  const [gridLoadingMore, setGridLoadingMore] = useState(false)
  // 多重ロード防止 + 最新の blocked ids を pager から参照するための ref。
  const gridLoadingRef = useRef(false)
  const blockedIdsRef = useRef<string[]>([])

  // 案b: mount + user 変更で 1 回だけ load。focus 復帰では再 fetch しない (scroll/データ保持)。
  //   mode='initial' → setLoading (全画面ローディング、初回)
  //   mode='refresh' → setRefreshing (pull-to-refresh、レーン表示のまま上部スピナー)
  //   ★refresh は loading を絶対に触らない (loading=true だとレーンが潰れ scroll offset が飛ぶ)。
  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true)
      else setLoading(true)

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

        // wants + blocked user ids + liked card ids を並列取得。
        //   - wants: matcher / easyScore 入力 (fetchEasyCards に渡す、wanted_cards = 求リスト)
        //   - blocked: home 表示から除外する Phase 0 PR-C
        //   - likedIds: ♡ button の初期状態 (liked_cards、UI 上「いいね」)
        const [wants, blockedUserIds, likedIds] = await Promise.all([
          user != null ? fetchMyWantedCards(user.id) : Promise.resolve([]),
          user != null ? fetchMyBlockedUserIds() : Promise.resolve([]),
          user != null ? fetchMyLikedCardIds(user.id) : Promise.resolve(new Set<string>()),
        ])
        setMyWants(wants)
        setMyLikedCardIds(likedIds)

        // TODO: 推薦RPC実装後に差し替え (Lane 2: 現行は自分以外のアクティブカードによる近似)
        const [rec, easy, newest] = await Promise.all([
          user != null
            ? fetchRecommendedCards(user.id, 20, blockedUserIds)
            : fetchNewCards(20, blockedUserIds),
          fetchEasyCards(user?.id, wants, blockedUserIds),
          fetchNewCards(20, blockedUserIds),
        ])

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

        // 無限グリッド page 0 (reset)。blocked は pager 用に ref 保持。
        blockedIdsRef.current = blockedUserIds
        setGridEnd(false)
        const firstPage = await fetchCardsPaged({
          offset: 0,
          limit: GRID_PAGE,
          excludeUserId: myId,
          excludeOwnerIds: blockedUserIds,
        })
        setGridCards(firstPage)
        if (firstPage.length < GRID_PAGE) setGridEnd(true)
      if (mode === 'refresh') setRefreshing(false)
      else setLoading(false)
    },
    [user?.id],
  )

  // 無限グリッドの次ページ取得 (near-bottom で発火)。重複 id は除外。
  const loadMoreGrid = useCallback(async () => {
    if (gridLoadingRef.current || gridEnd) return
    gridLoadingRef.current = true
    setGridLoadingMore(true)
    const page = await fetchCardsPaged({
      offset: gridCards.length,
      limit: GRID_PAGE,
      excludeUserId: user?.id ?? null,
      excludeOwnerIds: blockedIdsRef.current,
    })
    setGridCards((prev) => {
      const seen = new Set(prev.map((c) => c.id))
      return [...prev, ...page.filter((c) => !seen.has(c.id))]
    })
    if (page.length < GRID_PAGE) setGridEnd(true)
    setGridLoadingMore(false)
    gridLoadingRef.current = false
  }, [gridCards.length, gridEnd, user?.id])

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
      const distanceToBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height)
      if (distanceToBottom < 600) void loadMoreGrid()
    },
    [loadMoreGrid],
  )

  // 初回 mount + user 変更でのみ実行 (focus 復帰では走らない = scroll/データ保持)。
  useEffect(() => {
    void load()
  }, [load])

  const handleSearchPress = () => {
    router.push('/(tabs)/search')
  }

  // ★ Phase A: liked_cards (UI 上「いいね」) は card_id 直接比較なので
  // pendingAdds / pendingArchives / matchesCard / isWantMatchV2 fuzzy はすべて不要。
  const isCardLiked = useCallback(
    (card: Card): boolean => myLikedCardIds.has(card.id),
    [myLikedCardIds],
  )

  const handleToggleLike = useCallback(
    async (card: Card) => {
      if (user == null) return
      const wasLiked = myLikedCardIds.has(card.id)

      // Optimistic UI update (card_id 直接比較なので fuzzy ハック不要)
      setMyLikedCardIds((prev) => {
        const next = new Set(prev)
        if (wasLiked) next.delete(card.id)
        else next.add(card.id)
        return next
      })

      try {
        if (wasLiked) {
          await removeLike(user.id, card.id)
        } else {
          await addLike(user.id, card.id)
        }
      } catch (e) {
        console.error('[home][handleToggleLike]', e)
        // 失敗時は元の状態に revert
        setMyLikedCardIds((prev) => {
          const next = new Set(prev)
          if (wasLiked) next.add(card.id)
          else next.delete(card.id)
          return next
        })
      }
    },
    [user, myLikedCardIds],
  )

  // Lane 1「いいねした交換」用の暫定データ計算
  // liked_cards (card_id ベース) で filter する。Phase B 以降に fetchLikedCards 専用
  // fetch に置換予定 (現在は home の rec/easy/new 取得結果から抽出する近似)。
  const likedCards = useMemo<Card[]>(() => {
    const all = [...recommendedCards, ...easyCards, ...newCards]
    const seen = new Set<string>()
    const result: Card[] = []
    for (const c of all) {
      if (seen.has(c.id)) continue
      if (!isCardLiked(c)) continue
      seen.add(c.id)
      result.push(c)
    }
    return result
  }, [recommendedCards, easyCards, newCards, isCardLiked])

  const renderLargeCard = (card: Card) => (
    <HomeLargeCard
      key={card.id}
      card={card}
      isOwn={user != null && card.owner_user_id === user.id}
      isLiked={isCardLiked(card)}
      onToggleLike={user != null ? () => handleToggleLike(card) : undefined}
    />
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
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
                  onSubPress={() =>
                    router.push({ pathname: '/list/[section]', params: { section: 'liked' } } as never)
                  }
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
              onSubPress={() =>
                router.push({ pathname: '/list/[section]', params: { section: 'recommended' } } as never)
              }
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
              sub="すべて見る"
              onSubPress={() =>
                router.push({ pathname: '/list/[section]', params: { section: 'new' } } as never)
              }
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
              sub="すべて見る"
              onSubPress={() =>
                router.push({ pathname: '/list/[section]', params: { section: 'easy' } } as never)
              }
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

            {/* レーンの下: すべての交換 (新着 created_at 降順) の無限グリッド。
                FeedGridCard を固定幅で描画 = 余り行の全幅化崩れは構造的に起きない。 */}
            {gridCards.length > 0 && (
              <View style={styles.gridSection}>
                <Text style={styles.gridLabel}>すべての交換</Text>
                <View style={styles.grid}>
                  {gridCards.map((card) => (
                    <FeedGridCard
                      key={card.id}
                      card={card}
                      width={gridCardWidth}
                      isOwn={user != null && card.owner_user_id === user.id}
                      isLiked={isCardLiked(card)}
                      onToggleLike={
                        user != null ? () => handleToggleLike(card) : undefined
                      }
                    />
                  ))}
                </View>
                {gridLoadingMore && (
                  <ActivityIndicator
                    color={colors.primary}
                    style={styles.gridSpinner}
                  />
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Push 通知 PR2: ホーム初回到達時に通知許可 pre-prompt を表示。
          AsyncStorage で 1 回のみ。Modal は ScrollView 兄弟として配置 (描画位置は絶対). */}
      <PushPermissionPrePrompt userId={user?.id ?? null} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    // item6: タブバー (BottomTabBar position:relative=非オーバーレイ) 分の下駄 120 は過大。
    //   FAB overlay と最下要素のブリージング分のみ残して圧縮。
    paddingBottom: 40,
  },
  // レーン下の無限グリッド (すべての交換)。
  gridSection: { marginTop: spacing.lg },
  gridLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  gridSpinner: { marginVertical: spacing.base },
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
