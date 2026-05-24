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
import { isWantMatchV2 } from '@/lib/matcher'
import {
  addWantedCard,
  archiveWantedCard,
  fetchEasyCards,
  fetchMyWantedCards,
  fetchNewCards,
  fetchRecommendedCards,
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
  const [myWants, setMyWants] = useState<WantedCard[]>([])

  // ★ 3.5a fix: LikeButton optimistic 状態管理 (Map<cardId, wantId> + Set<cardId>)。
  //
  // 背景: WantedCard は card_id 列を持たず card_name 等でテキスト紐付け。鬼滅・コナン・
  // サンリオなど構造化 card (member_name/group_name 等が null) では isWantMatchV2 の
  // fuzzy match が hit しない → tap 直後の再判定で isLiked が false に戻る現象 (user
  // 実機 FB「いいねできる商品とできないものがある」の原因)。
  //
  // 3.5a 暫定: pendingAdds (cardId → wantId) で add 直後の状態を保持、archive 時にも
  // 利用。pendingArchives (Set<cardId>) は archive 直後の optimistic ♡ outline 用。
  // 根本解決は 3.5b で WantedCard.card_id 列追加 (matcher v3 の Card vs Card 化と同時)。
  const [pendingAdds, setPendingAdds] = useState<Map<string, string>>(new Map())
  const [pendingArchives, setPendingArchives] = useState<Set<string>>(new Set())

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

        // TODO: 推薦RPC実装後に差し替え (Lane 2: 現行は自分以外のアクティブカードによる近似)
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

  // ★ 3.5a 機能 H + LikeButton bug fix: optimistic update を加えた isLiked / toggle 判定
  // 判定優先順位: pendingArchives (即時 false) > pendingAdds (即時 true) > exact name match > fuzzy match
  //
  // exact name match (card.name === w.card_name) を最優先:
  //   wanted_cards_unique_per_user (user_id, card_name, ...) と整合、Pioneer #001 直接交換と同じ思想
  //   fuzzy match だけだと「UI 上 ♡ outline だが DB に既存行あり」で 23505 (duplicate key) を踏むため
  //   2026-05-23 のホーム ♡ tap バグ修正で導入
  const matchesCard = (card: Card, w: WantedCard): boolean =>
    w.card_name === card.name || isWantMatchV2(card, w)

  const isCardLiked = useCallback(
    (card: Card) => {
      if (pendingArchives.has(card.id)) return false
      if (pendingAdds.has(card.id)) return true
      return myWants.some((w) => matchesCard(card, w))
    },
    [myWants, pendingAdds, pendingArchives],
  )

  const handleToggleLike = useCallback(
    async (card: Card) => {
      if (user == null) return
      const liked = isCardLiked(card)
      if (liked) {
        // archive: pending 由来 or myWants 由来の wantId を解決
        const pendingWantId = pendingAdds.get(card.id)
        const matched = myWants.find((w) => matchesCard(card, w))
        const wantIdToArchive = pendingWantId ?? matched?.id
        // 先に optimistic 状態更新 (UI ♡ outline を即時反映)
        setPendingArchives((prev) => new Set(prev).add(card.id))
        setPendingAdds((prev) => {
          const next = new Map(prev)
          next.delete(card.id)
          return next
        })
        if (wantIdToArchive != null) {
          try {
            await archiveWantedCard(wantIdToArchive)
          } catch (e) {
            console.error('[home][handleToggleLike][archive]', e)
          }
        }
      } else {
        // add: optimistic 表示は新規 wantId 取得後に更新 (失敗時に false 維持)
        setPendingArchives((prev) => {
          if (!prev.has(card.id)) return prev
          const next = new Set(prev)
          next.delete(card.id)
          return next
        })
        try {
          const newWant = await addWantedCard({
            userId: user.id,
            cardName: card.name,
            groupName: card.group_name,
            memberName: card.member_name,
            series: card.series,
          })
          setPendingAdds((prev) => new Map(prev).set(card.id, newWant.id))
        } catch (e) {
          console.error('[home][handleToggleLike][add]', e)
        }
      }
      // 最終整合: server 側 wants を再 fetch
      const next = await fetchMyWantedCards(user.id)
      setMyWants(next)
    },
    [user, myWants, pendingAdds, isCardLiked],
  )

  // ★ 3.5a commit 3: Lane 1「いいねした交換」用の暫定データ計算
  // 現 3 レーン (rec / easy / new) の取得結果から isCardLiked() で抽出 + id 重複排除。
  // 3.5b で wanted_cards.card_id 列追加 + fetchLikedCards (専用 fetch) に置換予定。
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
