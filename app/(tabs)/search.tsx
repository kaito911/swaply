// app/(tabs)/search.tsx
//
// 検索画面 (M-search)。2 タブ構成:
//   1. 「キャラ・アイテムを探す」(default): フリーテキスト、master_characters/item_types + 配列 + legacy fallback
//   2. 「グループ・メンバーで探す」: 3 段検索 (K-POP 専用、メンバー → グループ → シリーズ)
//
// タブ切替時は各タブの状態を保持する (i 案、UX 良)。
// 鬼滅・コナンなどのキャラは「キャラ・アイテムを探す」タブを使う前提。

import { HeaderActions } from '@/components/HeaderActions'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SearchAutocomplete } from '@/components/SearchAutocomplete'
import { MemberMaster } from '@/constants/members'
import { isMasterCacheReady } from '@/lib/master'
import { scoreSearchMatch, type SearchMatchScore } from '@/lib/matcher'
import {
  getGroupsForMember,
  getMemberSuggestions,
  getSeriesOptions,
  searchCards,
  searchCardsByMember,
} from '@/lib/supabase'
import { Card, MasterCharacter, MasterItemType } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

type SearchTab = 'member' | 'text'

export default function SearchScreen() {
  const { user } = useAuthContext()

  const [tab, setTab] = useState<SearchTab>('text')

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="検索" showBackButton={false} rightActions={<HeaderActions />} />
      {/* タブバー */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setTab('text')}
          style={[styles.tab, tab === 'text' && styles.tabActive]}
        >
          <Text style={[styles.tabLabel, tab === 'text' && styles.tabLabelActive]}>
            キャラ・アイテムを探す
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('member')}
          style={[styles.tab, tab === 'member' && styles.tabActive]}
        >
          <Text style={[styles.tabLabel, tab === 'member' && styles.tabLabelActive]}>
            グループ・メンバーで探す
          </Text>
        </Pressable>
      </View>

      {/* タブ別の中身。両方マウントしておくと state 保持が確実 */}
      <View style={[styles.tabPane, tab !== 'member' && styles.tabPaneHidden]}>
        <MemberSearchPane currentUserId={user?.id ?? null} />
      </View>
      <View style={[styles.tabPane, tab !== 'text' && styles.tabPaneHidden]}>
        <TextSearchPane currentUserId={user?.id ?? null} />
      </View>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// メンバー検索ペイン (3 段検索)
// ─────────────────────────────────────────

function MemberSearchPane({ currentUserId }: { currentUserId: string | null }) {
  // 第 1 段: メンバー
  const [memberInput, setMemberInput] = useState('')
  const [suggestions, setSuggestions] = useState<readonly MemberMaster[]>([])
  const [selected, setSelected] = useState<MemberMaster | null>(null)

  // 第 2 段: グループ (任意)
  const [groupOptions, setGroupOptions] = useState<string[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  // 第 3 段: シリーズ (任意、デフォルト折り畳み)
  const [seriesExpanded, setSeriesExpanded] = useState(false)
  const [seriesOptions, setSeriesOptions] = useState<string[]>([])
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null)
  const [seriesCustom, setSeriesCustom] = useState('')

  // 結果
  const [results, setResults] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // 入力 → autocomplete (in-memory なので debounce 不要、即時反映)
  const handleMemberInputChange = useCallback((text: string) => {
    setMemberInput(text)
    if (selected != null) return // 選択済みのときは再計算しない
    setSuggestions(getMemberSuggestions(text))
  }, [selected])

  // メンバー選択 → グループ取得 → 自動絞り込み判定
  const handleSelectMember = useCallback(async (m: MemberMaster) => {
    setSelected(m)
    setMemberInput(m.canonical)
    setSuggestions([])
    // グループ取得
    const groups = await getGroupsForMember(m.canonical)
    setGroupOptions(groups)
    if (groups.length === 1) {
      // 1 件のみ → 自動絞り込み (UI 上はプルダウン非表示)
      setSelectedGroup(groups[0])
    } else {
      setSelectedGroup(null)
    }
    // シリーズはまだ取得しない (折り畳みが展開された時点で取得)
    setSeriesOptions([])
    setSelectedSeries(null)
    setSeriesCustom('')
    setSeriesExpanded(false)
  }, [])

  // メンバー選択クリア
  const handleClearMember = useCallback(() => {
    setSelected(null)
    setMemberInput('')
    setSuggestions([])
    setGroupOptions([])
    setSelectedGroup(null)
    setSeriesOptions([])
    setSelectedSeries(null)
    setSeriesCustom('')
    setSeriesExpanded(false)
    setResults([])
    setSearched(false)
  }, [])

  // シリーズ折り畳み展開 → series 候補取得
  const handleExpandSeries = useCallback(async () => {
    setSeriesExpanded(true)
    if (selected == null) return
    const opts = await getSeriesOptions(
      selected.canonical,
      selectedGroup ?? undefined
    )
    setSeriesOptions(opts)
  }, [selected, selectedGroup])

  // メンバー選択 / グループ / シリーズ変更時に検索 (debounce で連続更新を抑制)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (selected == null) {
      setResults([])
      setSearched(false)
      return
    }
    // selectedGroup が null かつ groupOptions が複数 → グループ未選択、検索保留
    if (groupOptions.length > 1 && selectedGroup == null) {
      setResults([])
      setSearched(false)
      return
    }

    if (searchTimer.current != null) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setLoading(true)
      const seriesArg =
        selectedSeries ?? (seriesCustom.trim() !== '' ? seriesCustom.trim() : undefined)
      const cards = await searchCardsByMember(
        selected.canonical,
        selectedGroup ?? undefined,
        seriesArg
      )
      setResults(cards)
      setSearched(true)
      setLoading(false)
    }, 300)

    return () => {
      if (searchTimer.current != null) clearTimeout(searchTimer.current)
    }
  }, [selected, groupOptions.length, selectedGroup, selectedSeries, seriesCustom])

  // ── render helpers ─────────────────────────

  const showGroupSelector = selected != null && groupOptions.length > 1
  const showSeriesSection = selected != null && (groupOptions.length <= 1 || selectedGroup != null)

  return (
    <View style={styles.pane}>
      {/* メンバー入力 / 選択チップ */}
      {selected == null ? (
        <View style={styles.inputWrap}>
          <View style={styles.inputBar}>
            <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.input}
              placeholder="メンバー名 (例: ハルト, JIHOON)"
              placeholderTextColor={colors.textTertiary}
              value={memberInput}
              onChangeText={handleMemberInputChange}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
          {/* autocomplete suggestions */}
          {memberInput.trim() !== '' && (
            <View style={styles.suggestList}>
              {suggestions.length === 0 ? (
                <Text style={styles.suggestEmpty}>該当メンバーなし</Text>
              ) : (
                suggestions.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => handleSelectMember(m)}
                    style={({ pressed }) => [
                      styles.suggestItem,
                      pressed && styles.suggestItemPressed,
                    ]}
                  >
                    <Text style={styles.suggestMain}>{m.canonical}</Text>
                    <Text style={styles.suggestSub}>
                      {m.official_en} · {m.group}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.inputWrap}>
          <View style={styles.selectedChip}>
            <Text style={styles.selectedChipLabel}>{selected.canonical}</Text>
            <Pressable onPress={handleClearMember} hitSlop={8} style={styles.selectedChipClear}>
              <Ionicons name="close" size={14} color={colors.textInverse} />
            </Pressable>
          </View>
        </View>
      )}

      {/* グループ選択 (複数候補のときのみ表示) */}
      {showGroupSelector && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>グループ</Text>
          <View style={styles.optionRow}>
            {groupOptions.map((g) => {
              const active = g === selectedGroup
              return (
                <Pressable
                  key={g}
                  onPress={() => setSelectedGroup(g)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{g}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      )}

      {/* シリーズ折り畳み */}
      {showSeriesSection && (
        <View style={styles.section}>
          {!seriesExpanded ? (
            <Pressable onPress={handleExpandSeries} style={styles.seriesToggle}>
              <Text style={styles.seriesToggleLabel}>シリーズで絞り込む (任意)</Text>
              <Ionicons name="chevron-down" size={14} color={colors.primary} />
            </Pressable>
          ) : (
            <>
              <Text style={styles.sectionLabel}>シリーズ</Text>
              {seriesOptions.length > 0 && (
                <View style={styles.optionRow}>
                  {seriesOptions.map((s) => {
                    const active = s === selectedSeries
                    return (
                      <Pressable
                        key={s}
                        onPress={() => {
                          setSelectedSeries(active ? null : s)
                          setSeriesCustom('')
                        }}
                        style={[styles.option, active && styles.optionActive]}
                      >
                        <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                          {s}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}
              <View style={styles.seriesCustomWrap}>
                <TextInput
                  style={styles.seriesCustomInput}
                  placeholder={seriesOptions.length === 0 ? 'シリーズを直接入力' : 'または直接入力'}
                  placeholderTextColor={colors.textTertiary}
                  value={seriesCustom}
                  onChangeText={(t) => {
                    setSeriesCustom(t)
                    if (t.trim() !== '') setSelectedSeries(null)
                  }}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
            </>
          )}
        </View>
      )}

      {/* 結果 */}
      <ResultArea
        loading={loading}
        searched={searched}
        results={results}
        currentUserId={currentUserId}
        emptyHint={
          selected == null
            ? 'メンバー名を入力して検索'
            : groupOptions.length > 1 && selectedGroup == null
            ? 'グループを選択してください'
            : '該当する出品が見つかりませんでした'
        }
      />
    </View>
  )
}

// ─────────────────────────────────────────
// キャラ・アイテム検索ペイン (Phase 0.5b: SearchAutocomplete + チップ絞り込み)
//
// 動作 (確定事項 A/B/G/H):
//   - チップあり: searchCards({characterIds, itemTypeIds}) を即時呼出、sortByScore で並べ替え
//   - チップ 0 + 入力あり: 400ms debounce で searchCards({query}) を呼ぶ text fallback
//   - チップ 0 + 入力空: 結果 reset、empty hint「キャラを選んで検索」
//   - master 未 ready: 候補非表示 (SearchAutocomplete 内部処理)、empty hint「キーワードを入力してください」
// ─────────────────────────────────────────

/**
 * 検索結果を scoreSearchMatch (matcher v2 思想) で並べ替える。
 * 同スコア内は created_at DESC (DB query が既に降順なので元順序維持)。
 * 絞り込みなし時は何もしない (created_at DESC のまま)。
 */
function sortByScore(
  cards: Card[],
  selectedCharIds: string[],
  selectedItemTypeIds: string[],
): Card[] {
  if (selectedCharIds.length === 0 && selectedItemTypeIds.length === 0) return cards

  const scoreOrder: Record<SearchMatchScore, number> = {
    strong: 3, medium: 2, weak: 1, none: 0,
  }
  return [...cards].sort((a, b) => {
    const sa = scoreOrder[scoreSearchMatch(a, selectedCharIds, selectedItemTypeIds)]
    const sb = scoreOrder[scoreSearchMatch(b, selectedCharIds, selectedItemTypeIds)]
    return sb - sa
  })
}

/**
 * emptyHint 4 パターン (R15):
 *   - master 未 ready → 「キーワードを入力してください」
 *   - 入力空 + チップ 0 → 「キャラを選んで検索」
 *   - チップあり + 結果ゼロ → 「条件を変えてみてください」
 *   - 入力あり + チップ 0 + 結果ゼロ → 「見つかりませんでした」
 */
function getEmptyHint(args: {
  masterReady: boolean
  inputTrimmed: string
  hasChips: boolean
}): string {
  if (!args.masterReady) return 'キーワードを入力してください'
  if (!args.hasChips && args.inputTrimmed === '') return 'キャラを選んで検索'
  if (args.hasChips) return '条件を変えてみてください'
  return '見つかりませんでした'
}

function TextSearchPane({ currentUserId }: { currentUserId: string | null }) {
  const [input, setInput] = useState('')
  const [selectedChars, setSelectedChars] = useState<MasterCharacter[]>([])
  const [selectedItems, setSelectedItems] = useState<MasterItemType[]>([])
  const [results, setResults] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // master ready の reactive 取得 (emptyHint 出し分け用、SearchAutocomplete 内部とは独立)
  const [masterReady, setMasterReady] = useState(() => isMasterCacheReady())
  useEffect(() => {
    if (masterReady) return
    const intervalId = setInterval(() => {
      if (isMasterCacheReady()) {
        setMasterReady(true)
        clearInterval(intervalId)
      }
    }, 100)
    const timeoutId = setTimeout(() => clearInterval(intervalId), 5000)
    return () => {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
    }
  }, [masterReady])

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasChips = selectedChars.length > 0 || selectedItems.length > 0
  const trimmedInput = input.trim()

  // チップ変化 effect (即時、debounce なし)
  // selectedChars / selectedItems が変わったら searchCards を呼んで sort
  const selectedCharIds = useMemo(
    () => selectedChars.map((c) => c.id),
    [selectedChars],
  )
  const selectedItemTypeIds = useMemo(
    () => selectedItems.map((t) => t.id),
    [selectedItems],
  )

  useEffect(() => {
    if (!hasChips) {
      // チップ 0 → text fallback effect が担当、ここでは何もしない
      return
    }
    let cancelled = false
    const run = async () => {
      setLoading(true)
      const cards = await searchCards({
        characterIds: selectedCharIds,
        itemTypeIds: selectedItemTypeIds,
      })
      if (cancelled) return
      setResults(sortByScore(cards, selectedCharIds, selectedItemTypeIds))
      setSearched(true)
      setLoading(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [hasChips, selectedCharIds, selectedItemTypeIds])

  // 入力テキスト変化 effect (debounce 400ms、チップ 0 時のみ走る)
  useEffect(() => {
    if (hasChips) return // チップありはチップ effect が担当
    if (debounceTimer.current != null) clearTimeout(debounceTimer.current)

    if (trimmedInput === '') {
      setResults([])
      setSearched(false)
      return
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true)
      const cards = await searchCards({ query: trimmedInput })
      setResults(cards) // text fallback は created_at DESC のまま
      setSearched(true)
      setLoading(false)
    }, 400)

    return () => {
      if (debounceTimer.current != null) clearTimeout(debounceTimer.current)
    }
  }, [trimmedInput, hasChips])

  // フリーテキスト確定シグナル (R9/R20)。
  // 入力ベースの effect で既にライブ検索が走っているので追加処理なし、将来 user_keyword_history 記録等の拡張点。
  const handleSubmitFreeText = useCallback((_text: string) => {
    // no-op: search.tsx 側では既に input effect で fallback 走行中
  }, [])

  return (
    <View style={styles.pane}>
      <SearchAutocomplete
        selectedCharacters={selectedChars}
        onChangeCharacters={setSelectedChars}
        selectedItemTypes={selectedItems}
        onChangeItemTypes={setSelectedItems}
        inputText={input}
        onChangeInputText={setInput}
        onSubmitFreeText={handleSubmitFreeText}
        placeholder="キャラ・アイテム名で検索 (例: 炭治郎)"
      />

      <ResultArea
        loading={loading}
        searched={searched}
        results={results}
        currentUserId={currentUserId}
        emptyHint={getEmptyHint({
          masterReady,
          inputTrimmed: trimmedInput,
          hasChips,
        })}
      />
    </View>
  )
}

// ─────────────────────────────────────────
// 結果表示 (両ペイン共通)
// ─────────────────────────────────────────

function ResultArea({
  loading,
  searched,
  results,
  currentUserId,
  emptyHint,
}: {
  loading: boolean
  searched: boolean
  results: Card[]
  currentUserId: string | null
  emptyHint: string
}) {
  const handleCardPress = (card: Card) => {
    router.push({
      pathname: '/listing/[id]',
      params: { id: card.id },
    } as never)
  }

  const renderItem = ({ item }: { item: Card }) => {
    const isOwn = currentUserId !== null && item.owner_user_id === currentUserId
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

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }
  if (searched && results.length === 0) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.emptyTitle}>{emptyHint}</Text>
        <Text style={styles.emptySub}>条件を変えて試してみてください</Text>
      </View>
    )
  }
  if (!searched) {
    return (
      <View style={styles.centerBox}>
        <Ionicons name="search-outline" size={40} color={colors.border} />
        <Text style={styles.emptySub}>{emptyHint}</Text>
      </View>
    )
  }
  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // タブバー
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    color: colors.primary,
  },

  // ペイン
  tabPane: {
    flex: 1,
  },
  tabPaneHidden: {
    display: 'none',
  },
  pane: {
    flex: 1,
  },

  // 入力
  inputWrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inputBar: {
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
  input: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    padding: 0,
    margin: 0,
  },

  // autocomplete suggestions
  suggestList: {
    marginTop: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  suggestItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggestItemPressed: {
    backgroundColor: colors.backgroundMuted,
  },
  suggestMain: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  suggestSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  suggestEmpty: {
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // selected member chip
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm - 2,
    gap: spacing.sm,
  },
  selectedChipLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
  },
  selectedChipClear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // section (group / series 共通)
  section: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.backgroundMuted,
  },
  optionLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  optionLabelActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },

  // series toggle / custom
  seriesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  seriesToggleLabel: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  seriesCustomWrap: {
    marginTop: spacing.sm,
  },
  seriesCustomInput: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },

  // 結果
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
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
