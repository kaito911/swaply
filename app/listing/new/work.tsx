// app/listing/new/work.tsx
// Step 1 commit (β1 拡張): 作品/グループ選択 — 固定ボタン式 → autocomplete + 自由入力式に変更
//
// 設計方針:
//   - master_works が β1 期間中に拡大予定 (鬼滅/コナン/サンリオ → K-POP/アニメ/2.5次元/VTuber 含む 50+ 件)
//   - autocomplete で input に応じて候補を絞り込み + 候補にない作品も自由入力可能
//   - 自由入力時はカテゴリ (CHECK 制約 5 値内 = anime/idol/character/other) を必須選択
//   - work_id は FK 制約なし (ハイブリッドマスタ) のため、自由入力値も DB insert 可能
//   - 出口: workId + category を query params で next step へ (既存仕様維持)
//
// 受け取る params (image.tsx から):
//   imageUri, imageBackUri (任意)
// 渡す params (characters.tsx へ):
//   imageUri, imageBackUri, workId, category
//
// 自由入力時の挙動:
//   - workId に user 入力の trimmed text を直接渡す (slugify せず raw text 保持)
//   - characters.tsx 側で master_characters は cache.charactersByWork.get(workId) で取得するため、
//     master 未登録の workId のときキャラ候補は空配列 (= 全部フリーテキスト) になる。β1 許容。
//   - confirm.tsx の buildSetName は work?.display_name_ja ?? workId で fallback 表示 (本 commit 同梱)

import { Ionicons } from '@expo/vector-icons'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { getWorkSuggestions } from '@/lib/master'
import type { MasterCategory, MasterWork } from '@/lib/types'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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

export default function ListingNewWorkScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri?: string
  }>()

  const [input, setInput] = useState('')
  const [selectedWork, setSelectedWork] = useState<MasterWork | null>(null)
  const [freeTextCategory, setFreeTextCategory] = useState<MasterCategory | null>(null)

  const trimmedInput = input.trim()

  // master 候補 (selectedWork が無い & input がある時のみ計算)。
  // 空入力時は sort_order 順で全件 (β1 期間は ~50 件以下を想定)。
  const suggestions = useMemo<MasterWork[]>(() => {
    if (selectedWork != null) return []
    return getWorkSuggestions(input, 10)
  }, [input, selectedWork])

  // 入力がマスタの display_name_ja / aliases にちょうど一致するか
  // → 一致時は自由入力 registration UI を出さない (= 候補から選んでね)
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

  const canNext =
    selectedWork != null ||
    (canRegisterFreeText && freeTextCategory != null)

  const handleSelectWork = (w: MasterWork) => {
    setSelectedWork(w)
    setInput(w.display_name_ja)
    setFreeTextCategory(null)
  }

  const handleClearSelection = () => {
    setSelectedWork(null)
    setInput('')
    setFreeTextCategory(null)
  }

  const handleInputChange = (text: string) => {
    setInput(text)
    if (selectedWork != null) {
      // 既選択中に input を変えたら選択解除して再検索モードへ
      setSelectedWork(null)
    }
    // 入力が変わったら freeText category 選択もリセット (不整合防止)
    if (freeTextCategory != null) {
      setFreeTextCategory(null)
    }
  }

  const handleNext = () => {
    if (selectedWork != null) {
      router.push({
        pathname: '/listing/new/characters' as never,
        params: {
          imageUri: params.imageUri ?? '',
          imageBackUri: params.imageBackUri ?? '',
          workId: selectedWork.id,
          category: selectedWork.category,
        },
      })
      return
    }
    if (canRegisterFreeText && freeTextCategory != null) {
      router.push({
        pathname: '/listing/new/characters' as never,
        params: {
          imageUri: params.imageUri ?? '',
          imageBackUri: params.imageBackUri ?? '',
          workId: trimmedInput,
          category: freeTextCategory,
        },
      })
    }
  }

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
      <ScreenHeader title="出品" subtitle="作品 2/6" />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 説明 */}
          <View style={styles.desc}>
            <Text style={styles.descTitle}>どの作品・グループの出品ですか?</Text>
            <Text style={styles.descSub}>
              作品名やグループ名を入力してください。{'\n'}
              候補にない場合は自由入力できます。
            </Text>
          </View>

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
            value={input}
            onChangeText={handleInputChange}
            placeholder="例: TREASURE、鬼滅の刃、サンリオ"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={MAX_FREE_TEXT_WORK_ID_LENGTH}
          />

          {/* マスタ候補 */}
          {selectedWork == null && suggestions.length > 0 && (
            <View style={styles.suggestionList}>
              {suggestions.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() => handleSelectWork(w)}
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

          {/* 自由入力 registration UI */}
          {canRegisterFreeText && (
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
                      onPress={() => setFreeTextCategory(opt.value)}
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

          {/* 候補ゼロ + 入力ゼロ時の空状態 */}
          {selectedWork == null &&
            trimmedInput === '' &&
            suggestions.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  作品マスタを読み込み中、または読み込み失敗。{'\n'}
                  自由入力でも出品できます。
                </Text>
              </View>
            )}
        </ScrollView>

        {/* Fixed CTA */}
        <View style={styles.ctaWrap}>
          <PrimaryCTA
            label="次へ"
            onPress={handleNext}
            disabled={!canNext}
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  outerWrap: { flex: 1, backgroundColor: colors.background },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  desc: {
    marginBottom: spacing.lg,
  },
  descTitle: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  descSub: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  // 選択中カード
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  selectedBody: {
    flex: 1,
  },
  selectedLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginBottom: 2,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  selectedSub: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 入力欄
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundCard,
    marginBottom: spacing.sm,
  },
  // サジェスト
  suggestionList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  suggestionItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  suggestionItemPressed: {
    backgroundColor: colors.backgroundMuted,
  },
  suggestionBody: { flexDirection: 'column' },
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
  // 自由入力 section
  freeTextSection: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  freeTextHeader: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  freeTextSubLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundCard,
  },
  categoryBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: '#EEF2FF',
  },
  categoryBtnPressed: {
    opacity: 0.7,
  },
  categoryBtnLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  categoryBtnLabelSelected: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  // 空状態
  emptyState: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  // CTA
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
})
