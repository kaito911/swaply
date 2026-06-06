// components/SearchAutocomplete.tsx
//
// 検索画面 専用 autocomplete component。
// 統合サジェスト対応版: master_works + master_characters + master_item_types を
// 横断 fuzzy filter し、type ラベル (グループ / 作品 / メンバー / キャラ / グッズ種別)
// 付きで 1 つの候補リストに表示する。
//
// MSA (出品 form 用) との役割分離:
//   - 1 入力欄で works / characters / item_types を同時候補に出す
//   - freeTextEnabled=false 相当、代わりに「このまま検索 →」ボタンと Enter キーで
//     onSubmitFreeText を起動
//   - inputText を制御 props 化 (Enter 確定後の保持を親で制御)
//   - softLimit 概念なし
//   - master ready 検知を内部で実施
//
// 設計判断:
//   - 選択チップは primary (navy) 一色 (3 type 視覚区別はせず統一)
//   - 候補は flat list、各行に「display_name_ja + type ラベル sublabel」
//   - 重複防止: 既選択を candidates から filter
//   - master 未 ready 時: 候補非表示、placeholder 「キーワードで検索」、入力欄のみ有効
//   - work tap → searchCards の workIds で legacy fallback まで連動 (group_name / series ilike)

import { Ionicons } from '@expo/vector-icons'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import {
  getSearchSuggestionTypeLabel,
  getUnifiedSearchSuggestions,
  isMasterCacheReady,
  type SearchSuggestion,
} from '@/lib/master'
import type { MasterCharacter, MasterItemType, MasterWork } from '@/lib/types'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

export interface SearchAutocompleteProps {
  /** 選択中の作品/グループ master 配列 */
  selectedWorks: MasterWork[]
  onChangeWorks: (next: MasterWork[]) => void

  /** 選択中のキャラ master 配列 */
  selectedCharacters: MasterCharacter[]
  onChangeCharacters: (next: MasterCharacter[]) => void

  /** 選択中のアイテム種別 master 配列 */
  selectedItemTypes: MasterItemType[]
  onChangeItemTypes: (next: MasterItemType[]) => void

  /** 入力欄テキスト (制御 props、親で state 管理) */
  inputText: string
  onChangeInputText: (text: string) => void

  /**
   * Enter キーまたは「『XXX』のまま検索 →」ボタン押下時に呼ばれる。
   * 「ユーザーが意図的にフリーテキスト確定したシグナル」として親側で活用する想定。
   */
  onSubmitFreeText: (text: string) => void

  /** 入力欄の placeholder。master 未 ready 時は内部で「キーワードで検索」に上書き */
  placeholder?: string
  /** 候補表示の最低入力文字数 (default 2) */
  minInputChars?: number
  /** 統合候補の上限 (default 15) */
  suggestionLimit?: number
}

export function SearchAutocomplete(props: SearchAutocompleteProps) {
  const minInputChars = props.minInputChars ?? 2
  const suggestionLimit = props.suggestionLimit ?? 15

  // master ready を内部で reactive 化。
  // 起動時 isMasterCacheReady() = false の可能性に備え、100ms poll を最大 5 秒。
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

  // 候補計算 (sync、master cache 前提)
  const trimmedInput = props.inputText.trim()
  const showSuggest = masterReady && trimmedInput.length >= minInputChars

  const candidates = useMemo<SearchSuggestion[]>(() => {
    if (!showSuggest) return []
    const selectedWorkIds = new Set(props.selectedWorks.map((w) => w.id))
    const selectedCharIds = new Set(props.selectedCharacters.map((c) => c.id))
    const selectedItemIds = new Set(props.selectedItemTypes.map((t) => t.id))
    return getUnifiedSearchSuggestions(trimmedInput, suggestionLimit).filter((s) => {
      if (s.type === 'work') return !selectedWorkIds.has(s.data.id)
      if (s.type === 'character') return !selectedCharIds.has(s.data.id)
      return !selectedItemIds.has(s.data.id)
    })
  }, [
    showSuggest,
    trimmedInput,
    props.selectedWorks,
    props.selectedCharacters,
    props.selectedItemTypes,
    suggestionLimit,
  ])

  const hasCandidates = candidates.length > 0
  const showFreeTextFallback = showSuggest && !hasCandidates

  // ── handlers ──

  const handleSelect = (s: SearchSuggestion) => {
    if (s.type === 'work') {
      props.onChangeWorks([...props.selectedWorks, s.data])
    } else if (s.type === 'character') {
      props.onChangeCharacters([...props.selectedCharacters, s.data])
    } else {
      props.onChangeItemTypes([...props.selectedItemTypes, s.data])
    }
    props.onChangeInputText('')
  }

  const handleRemoveWork = (w: MasterWork) => {
    props.onChangeWorks(props.selectedWorks.filter((x) => x.id !== w.id))
  }

  const handleRemoveCharacter = (c: MasterCharacter) => {
    props.onChangeCharacters(props.selectedCharacters.filter((x) => x.id !== c.id))
  }

  const handleRemoveItemType = (t: MasterItemType) => {
    props.onChangeItemTypes(props.selectedItemTypes.filter((x) => x.id !== t.id))
  }

  const handleSubmitFreeText = () => {
    const text = trimmedInput
    if (text === '') return
    props.onSubmitFreeText(text)
  }

  // ── render ──

  const effectivePlaceholder = masterReady
    ? props.placeholder ?? 'グループ・作品・キャラ・アイテム名で検索'
    : 'キーワードで検索'

  const hasSelected =
    props.selectedWorks.length > 0 ||
    props.selectedCharacters.length > 0 ||
    props.selectedItemTypes.length > 0

  return (
    <View style={styles.wrap}>
      {/* 選択チップ群 (works + characters + item_types、横並び flexWrap) */}
      {hasSelected && (
        <View style={styles.selectedChipsRow}>
          {props.selectedWorks.map((w) => (
            <View key={`work-${w.id}`} style={styles.selectedChip}>
              <Text style={styles.selectedChipLabel} numberOfLines={1}>
                {w.display_name_ja}
              </Text>
              <Pressable
                onPress={() => handleRemoveWork(w)}
                hitSlop={8}
                style={styles.selectedChipClear}
              >
                <Ionicons name="close" size={12} color={colors.textInverse} />
              </Pressable>
            </View>
          ))}
          {props.selectedCharacters.map((c) => (
            <View key={`char-${c.id}`} style={styles.selectedChip}>
              <Text style={styles.selectedChipLabel} numberOfLines={1}>
                {c.display_name_ja}
              </Text>
              <Pressable
                onPress={() => handleRemoveCharacter(c)}
                hitSlop={8}
                style={styles.selectedChipClear}
              >
                <Ionicons name="close" size={12} color={colors.textInverse} />
              </Pressable>
            </View>
          ))}
          {props.selectedItemTypes.map((t) => (
            <View key={`item-${t.id}`} style={styles.selectedChip}>
              <Text style={styles.selectedChipLabel} numberOfLines={1}>
                {t.display_name_ja}
              </Text>
              <Pressable
                onPress={() => handleRemoveItemType(t)}
                hitSlop={8}
                style={styles.selectedChipClear}
              >
                <Ionicons name="close" size={12} color={colors.textInverse} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* 入力欄 */}
      <View style={styles.inputBar}>
        <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
        <TextInput
          value={props.inputText}
          onChangeText={props.onChangeInputText}
          placeholder={effectivePlaceholder}
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={handleSubmitFreeText}
          style={styles.input}
          clearButtonMode="while-editing"
        />
      </View>

      {/* 候補 / 該当なし (master ready かつ minInputChars 以上のときのみ) */}
      {showSuggest && (
        <View style={styles.suggestList}>
          {hasCandidates &&
            candidates.map((s) => {
              const id = s.type === 'work' ? s.data.id : s.type === 'character' ? s.data.id : s.data.id
              const typeLabel = getSearchSuggestionTypeLabel(s)
              return (
                <Pressable
                  key={`${s.type}-${id}`}
                  onPress={() => handleSelect(s)}
                  style={({ pressed }) => [
                    styles.candidateRow,
                    pressed && styles.candidateRowPressed,
                  ]}
                >
                  <View style={styles.candidateMain}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {s.data.display_name_ja}
                    </Text>
                  </View>
                  <View style={styles.candidateTypeBadge}>
                    <Text style={styles.candidateTypeBadgeText}>{typeLabel}</Text>
                  </View>
                </Pressable>
              )
            })}

          {showFreeTextFallback && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>該当なし</Text>
              <Pressable
                onPress={handleSubmitFreeText}
                style={({ pressed }) => [
                  styles.freeTextBtn,
                  pressed && styles.freeTextBtnPressed,
                ]}
              >
                <Text style={styles.freeTextBtnLabel} numberOfLines={1}>
                  「{trimmedInput}」のまま検索
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={colors.primary}
                />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },

  // 選択チップ (primary 一色)
  selectedChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    paddingVertical: 4,
    maxWidth: 200,
  },
  selectedChipLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
    flexShrink: 1,
  },
  selectedChipClear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 入力欄
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.backgroundCard,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
  },

  // 候補リスト (flat)
  suggestList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  candidateRowPressed: {
    backgroundColor: colors.backgroundMuted,
  },
  candidateMain: {
    flex: 1,
    minWidth: 0,
  },
  candidateName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  candidateTypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.tagNeutralBorder,
    backgroundColor: colors.tagNeutralBg,
  },
  candidateTypeBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.tagNeutralText,
    letterSpacing: 0.3,
  },

  // 該当なし + フリーテキストボタン
  emptyState: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  freeTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  freeTextBtnPressed: {
    opacity: 0.7,
  },
  freeTextBtnLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    flexShrink: 1,
  },
})
