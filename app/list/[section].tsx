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
  searchCards,
  searchDirectMatch,
} from '@/lib/supabase'
import {
  getCharacterSuggestionsAcrossWorks,
  getItemTypeSuggestions,
  getWorkSuggestions,
} from '@/lib/master'
import { Card, MasterCharacter, MasterItemType, MasterWork } from '@/lib/types'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuthContext } from '@/providers/AuthProvider'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Section =
  | 'recommended'
  | 'new'
  | 'easy'
  | 'liked'
  | 'my-listings'
  | 'search-offer'
  | 'search-want'
  | 'search-match'

const SECTION_TITLES: Record<Section, string> = {
  recommended: 'あなたへのおすすめ',
  new: '新着の交換',
  easy: '成立しやすい交換',
  liked: 'いいねした交換',
  'my-listings': '出品中',
  'search-offer': '譲を探す結果',
  'search-want': '求を探す結果',
  'search-match': 'マッチ結果',
}

const LIMIT = 100

// 検索系 section の条件 params (master ID slug のカンマ結合) を配列へ復元。
const toIds = (s: string | undefined): string[] =>
  (s ?? '').split(',').filter((x) => x !== '')

function isSection(v: string | undefined): v is Section {
  return (
    v === 'recommended' ||
    v === 'new' ||
    v === 'easy' ||
    v === 'liked' ||
    v === 'my-listings' ||
    v === 'search-offer' ||
    v === 'search-want' ||
    v === 'search-match'
  )
}

export default function ListSectionScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null
  const params = useLocalSearchParams<{
    section?: string
    w?: string
    c?: string
    i?: string
    q?: string
    mw_w?: string
    mw_c?: string
    mw_i?: string
    mo_w?: string
    mo_c?: string
    mo_i?: string
  }>()
  const section = isSection(params.section) ? params.section : null

  // 3 列グリッドの固定カード幅: content padding(base*2) + 列間 gap(sm*2) を差し引いて 3 等分。
  // FeedGridCard を固定幅にし、最終行 1 枚でも全幅化させない (numColumns の伸び対策)。
  const { width: screenW } = useWindowDimensions()
  const gridCardWidth = Math.floor(
    (screenW - spacing.base * 2 - spacing.sm * 2) / 3,
  )

  const [cards, setCards] = useState<Card[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  // A1: 読み込み失敗フラグ。catch で立て、再試行UIを出す (false-empty 是正・home/wants と同手法)。
  const [loadFailed, setLoadFailed] = useState(false)

  // 絞込 (クライアント側): グループ + メンバー + 種類 の 3 軸。空なら全件。
  const [filterWorks, setFilterWorks] = useState<MasterWork[]>([])
  const [filterChars, setFilterChars] = useState<MasterCharacter[]>([])
  const [filterItems, setFilterItems] = useState<MasterItemType[]>([])
  const [showFilter, setShowFilter] = useState(false)

  const load = useCallback(async () => {
    if (section == null) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadFailed(false)
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
        } else if (section === 'search-offer') {
          // 譲を探す結果: チップ (w/c/i) または text fallback (q) で searchCards。
          const q = params.q ?? ''
          result =
            q !== ''
              ? await searchCards({ query: q, excludeOwnerIds: blocked, limit: LIMIT })
              : await searchCards({
                  workIds: toIds(params.w),
                  characterIds: toIds(params.c),
                  itemTypeIds: toIds(params.i),
                  excludeOwnerIds: blocked,
                  limit: LIMIT,
                })
        } else if (section === 'search-want') {
          // 求を探す結果 (向きB): 入力チップ → myOffers → 相手 want_* 照合。dedupByOwner:false。
          const data = await searchDirectMatch({
            myOffers: {
              works: toIds(params.w),
              characters: toIds(params.c),
              itemTypes: toIds(params.i),
            },
            myWants: { works: [], characters: [], itemTypes: [] },
            dedupByOwner: false,
            excludeOwnerIds: blocked,
            limit: LIMIT,
          })
          result = data.map((r) => r.offering_card)
        } else if (section === 'search-match') {
          // マッチ結果 (双方向): ★スワップ整合 mw_*=myWants / mo_*=myOffers。dedupByOwner:false。
          const data = await searchDirectMatch({
            myWants: {
              works: toIds(params.mw_w),
              characters: toIds(params.mw_c),
              itemTypes: toIds(params.mw_i),
            },
            myOffers: {
              works: toIds(params.mo_w),
              characters: toIds(params.mo_c),
              itemTypes: toIds(params.mo_i),
            },
            dedupByOwner: false,
            excludeOwnerIds: blocked,
            limit: LIMIT,
          })
          result = data.map((r) => r.offering_card)
        }
      }
      setCards(result)
      if (userId != null && section !== 'my-listings') {
        setLikedIds(await fetchMyLikedCardIds(userId))
      }
    } catch (e) {
      // ★取得失敗を「0件」と偽らない。既存表示を消し error 表示に切替 (再試行導線)。
      console.error('[ListSection][load]', e)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [
    section,
    userId,
    params.w,
    params.c,
    params.i,
    params.q,
    params.mw_w,
    params.mw_c,
    params.mw_i,
    params.mo_w,
    params.mo_c,
    params.mo_i,
  ])

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

  // クライアント側フィルタ (card.work_id / characters[] / item_types[] と選択 master ID の overlap)。
  // グループは card.work_id (単一) を直照合。DB 追加クエリなし、master cache 常駐前提。
  const displayCards = useMemo(() => {
    const workIds = new Set(filterWorks.map((w) => w.id))
    const charIds = new Set(filterChars.map((c) => c.id))
    const itemIds = new Set(filterItems.map((t) => t.id))
    if (workIds.size === 0 && charIds.size === 0 && itemIds.size === 0) return cards
    return cards.filter((c) => {
      const okWork =
        workIds.size === 0 || (c.work_id != null && workIds.has(c.work_id))
      const okChar =
        charIds.size === 0 || (c.characters ?? []).some((id) => charIds.has(id))
      const okItem =
        itemIds.size === 0 || (c.item_types ?? []).some((id) => itemIds.has(id))
      return okWork && okChar && okItem
    })
  }, [cards, filterWorks, filterChars, filterItems])

  const filterCount = filterWorks.length + filterChars.length + filterItems.length
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
          {/* 絞込検索 (右下)。search 系は検索で既に絞済のため非表示 (二重絞り回避) */}
          {!section.startsWith('search-') && (
            <View style={styles.filterRow}>
              <Pressable style={styles.filterButton} onPress={() => setShowFilter(true)}>
                <Ionicons name="options-outline" size={15} color={colors.primary} />
                <Text style={styles.filterButtonText}>
                  絞込検索{filterCount > 0 ? ` (${filterCount})` : ''}
                </Text>
              </Pressable>
            </View>
          )}
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
      ) : loadFailed ? (
        // ★取得失敗: 「まだ〜ありません」を出さず、固まらせず再試行 (home/wants と同手法)。
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>読み込みに失敗しました</Text>
          <Pressable style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryButtonText}>再試行</Text>
          </Pressable>
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
                width={gridCardWidth}
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
          {/* item4: キーボード表示中も入力欄・適用ボタンが隠れないよう持ち上げる。 */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetKav}
          >
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>絞込検索</Text>

            {/* item2: グループ (作品/シリーズ) を最上段に。card.work_id を直照合。 */}
            <Text style={styles.fieldLabel}>グループ</Text>
            <MultiSelectAutocomplete<MasterWork>
              selected={filterWorks}
              onChange={setFilterWorks}
              fetchSuggestions={(input) => getWorkSuggestions(input)}
              getKey={(w) => w.id}
              renderOption={(w) => <Text style={styles.msaMain}>{w.display_name_ja}</Text>}
              renderChip={(w) => <Text style={styles.msaChip}>{w.display_name_ja}</Text>}
              placeholder="例: TREASURE"
              minInputChars={2}
              softLimit={10}
            />

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
              メンバー / キャラ
            </Text>
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
                  setFilterWorks([])
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
          </KeyboardAvoidingView>
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
  // A1: 読み込み失敗時の再試行UI (home/wants と同一トークン)。
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  retryButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary },
  content: { padding: spacing.base, gap: spacing.sm, paddingBottom: 120 },
  column: { gap: spacing.sm },
  // filter sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetKav: { width: '100%' },
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
    // item3: チップ背景は colors.primary (coral) 固定なので、ラベルは白でないと
    //   coral-on-coral で不可視になる (MultiSelectAutocomplete.tsx:299)。
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
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
