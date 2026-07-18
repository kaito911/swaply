// components/listing/section/WorkSection.tsx
//
// Phase A: 出品 1 ページ化 section 抽出。
// 元: app/listing/new/work.tsx (master_works autocomplete + カテゴリ + 自由入力)。
//
// 再利用/書き換え比率: 再利用 ~80% / 書き換え ~20%
//   - master 候補計算 (getWorkSuggestions) / hasExactMatch / canRegisterFreeText: 完全流用
//   - 選択カード / 入力欄 / 候補リスト / 自由入力カテゴリグリッド: 完全流用
//   - 削除: SafeAreaView / KeyboardAvoidingView / ScreenHeader / handleNext / PrimaryCTA
//   - 追加: value/onChange props、外部から commit された value での hydration ロジック
//
// hydration の考え方:
//   - value が master ID の場合 (getWorkById でヒット): master 選択状態で表示
//   - value が自由入力 workId の場合 (getWorkById でヒットしない): 自由入力モード復元
//   - value が null: 初期状態 (input 空 / selection なし)

import { Ionicons } from '@expo/vector-icons'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { useEnsureVisible } from '@/components/KeyboardAwareScroll'
import { getWorkById, getWorkSuggestions } from '@/lib/master'
import type { MasterCategory, MasterWork } from '@/lib/types'
import React, { useMemo, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import type { WorkSectionValue } from './types'

export type WorkSectionProps = {
  value: WorkSectionValue
  onChange: (next: WorkSectionValue) => void
}

// 自由入力時のカテゴリ選択肢。
// MasterCategory の CHECK 制約 ('anime' | 'idol' | 'character' | 'manga' | 'other') に揃える。
// 'manga' は β1 UI から直接選ばせず anime に集約 (CHECK 範囲には残す)。
const FREE_TEXT_CATEGORY_OPTIONS: readonly {
  label: string
  value: MasterCategory
}[] = [
  { label: 'アニメ / 漫画', value: 'anime' },
  { label: 'アイドル / K-POP / J-POP', value: 'idol' },
  { label: 'キャラクター', value: 'character' },
  { label: 'その他', value: 'other' },
]

// 自由入力 workId の最大長 (URL params + DB 文字列健全性のためのソフトリミット)
const MAX_FREE_TEXT_WORK_ID_LENGTH = 50

/** value から初期 UI 状態を導出 (hydration) */
function hydrate(value: WorkSectionValue): {
  input: string
  selectedWork: MasterWork | null
  freeTextCategory: MasterCategory | null
} {
  if (value == null) {
    return { input: '', selectedWork: null, freeTextCategory: null }
  }
  const master = getWorkById(value.workId)
  if (master != null) {
    return {
      input: master.display_name_ja,
      selectedWork: master,
      freeTextCategory: null,
    }
  }
  return {
    input: value.workId,
    selectedWork: null,
    freeTextCategory: value.category,
  }
}

export function WorkSection({ value, onChange }: WorkSectionProps) {
  const initial = useMemo(() => hydrate(value), [value])
  const [input, setInput] = useState<string>(initial.input)
  const [selectedWork, setSelectedWork] = useState<MasterWork | null>(
    initial.selectedWork,
  )
  const [freeTextCategory, setFreeTextCategory] = useState<MasterCategory | null>(
    initial.freeTextCategory,
  )
  // Phase B UI 微修正 (2026-07-05): 候補リストを常時展開ではなく、入力欄フォーカス時のみ展開。
  // 画面を無駄に長くする問題を解消。onBlur は 150ms 遅延して Pressable onPress が
  // 先に発火するようにする (候補タップと blur の競合回避)。
  const [isFocused, setIsFocused] = useState(false)

  // 候補出現時に入力欄を親 ScrollView 可視域上部へ寄せる (① キーボード被り対策)。
  const ensureVisible = useEnsureVisible()
  const inputRef = useRef<TextInput>(null)

  const handleFocus = () => setIsFocused(true)
  const handleBlur = () => {
    setTimeout(() => setIsFocused(false), 150)
  }

  const trimmedInput = input.trim()

  const suggestions = useMemo<MasterWork[]>(() => {
    if (selectedWork != null) return []
    return getWorkSuggestions(input, 10)
  }, [input, selectedWork])

  const hasExactMatch = useMemo(() => {
    if (trimmedInput === '') return false
    return suggestions.some(
      (w) =>
        w.display_name_ja === trimmedInput ||
        w.aliases.some((a) => a === trimmedInput),
    )
  }, [suggestions, trimmedInput])

  const canRegisterFreeText =
    selectedWork == null &&
    trimmedInput !== '' &&
    trimmedInput.length <= MAX_FREE_TEXT_WORK_ID_LENGTH &&
    !hasExactMatch

  const commitMaster = (w: MasterWork) => {
    setSelectedWork(w)
    setInput(w.display_name_ja)
    setFreeTextCategory(null)
    onChange({ workId: w.id, category: w.category })
  }

  const commitFreeText = (category: MasterCategory) => {
    setFreeTextCategory(category)
    if (canRegisterFreeText) {
      onChange({ workId: trimmedInput, category })
    }
  }

  const handleClearSelection = () => {
    setSelectedWork(null)
    setInput('')
    setFreeTextCategory(null)
    onChange(null)
  }

  const handleInputChange = (text: string) => {
    setInput(text)
    if (selectedWork != null) {
      setSelectedWork(null)
      onChange(null)
    }
    if (freeTextCategory != null) {
      setFreeTextCategory(null)
      onChange(null)
    }
  }

  return (
    <View style={styles.wrap}>
      {/* 選択中表示 */}
      {selectedWork != null && (
        <View style={styles.selectedCard}>
          <View style={styles.selectedBody}>
            <Text style={styles.selectedLabel}>選択中</Text>
            <Text style={styles.selectedName}>{selectedWork.display_name_ja}</Text>
            {selectedWork.display_name_en != null &&
              selectedWork.display_name_en !== '' && (
                <Text style={styles.selectedSub}>{selectedWork.display_name_en}</Text>
              )}
          </View>
          <Pressable
            onPress={handleClearSelection}
            hitSlop={10}
            style={styles.clearBtn}
          >
            <Ionicons name="close" size={18} color={colors.primary} />
          </Pressable>
        </View>
      )}

      {/* 入力欄 */}
      <TextInput
        ref={inputRef}
        value={input}
        onChangeText={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="例: TREASURE、鬼滅の刃、サンリオ"
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={MAX_FREE_TEXT_WORK_ID_LENGTH}
      />

      {/* マスタ候補: フォーカス時のみ展開 */}
      {isFocused && selectedWork == null && suggestions.length > 0 && (
        <View
          style={styles.suggestionList}
          onLayout={() => ensureVisible(inputRef)}
        >
          {suggestions.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => commitMaster(w)}
              style={({ pressed }) => [
                styles.suggestionItem,
                pressed && styles.suggestionItemPressed,
              ]}
            >
              <View style={styles.suggestionBody}>
                <Text style={styles.suggestionName}>{w.display_name_ja}</Text>
                {w.display_name_en != null && w.display_name_en !== '' && (
                  <Text style={styles.suggestionSub}>{w.display_name_en}</Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* 自由入力 registration UI: フォーカス時のみ展開 */}
      {isFocused && canRegisterFreeText && (
        <View style={styles.freeTextSection}>
          <Text style={styles.freeTextHeader}>
            候補にない場合: 「{trimmedInput}」で登録して進む
          </Text>
          <Text style={styles.freeTextSubLabel}>カテゴリを選んでください</Text>
          <View style={styles.categoryGrid}>
            {FREE_TEXT_CATEGORY_OPTIONS.map((opt) => {
              const isSelected = freeTextCategory === opt.value
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => commitFreeText(opt.value)}
                  style={({ pressed }) => [
                    styles.categoryBtn,
                    isSelected && styles.categoryBtnSelected,
                    pressed && styles.categoryBtnPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryBtnLabel,
                      isSelected && styles.categoryBtnLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      )}

      {/* 候補ゼロ + 入力ゼロ時の空状態: フォーカス時のみ展開 (未 focus 時は section 短く) */}
      {isFocused &&
        selectedWork == null &&
        trimmedInput === '' &&
        suggestions.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              作品マスタを読み込み中、または読み込み失敗。{'\n'}
              自由入力でも出品できます。
            </Text>
          </View>
        )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
  },
  selectedBody: { flex: 1 },
  selectedLabel: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginBottom: 2,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  selectedSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundCard,
  },
  suggestionList: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggestionItemPressed: { backgroundColor: colors.backgroundMuted },
  suggestionBody: {},
  suggestionName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  suggestionSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  freeTextSection: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  freeTextHeader: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  freeTextSubLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  categoryBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  categoryBtnPressed: { opacity: 0.7 },
  categoryBtnLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  categoryBtnLabelSelected: { color: colors.textInverse },
  emptyState: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
})
