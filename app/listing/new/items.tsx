// app/listing/new/items.tsx
// Step 3 commit 4: 出品 form 3-step フロー Step 3 — アイテム種別 (item_types[]) 入力
//
// 設計方針 (Phase 2 §4):
//   - characters.tsx と同じ MultiSelectAutocomplete + free text fallback パターン
//   - master_item_types を category_hint でフィルタ (アニメなら anime + NULL カテゴリ)
//   - 最低 1 個必須 (master + free text 合計)
//
// 受け取る params (characters.tsx から):
//   imageUri, imageBackUri, workId, category, charactersJson
// 渡す params (condition.tsx へ):
//   imageUri, imageBackUri, workId, category, charactersJson, itemTypesJson

import { Ionicons } from '@expo/vector-icons'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import { getItemTypeSuggestions, recordListingKeyword } from '@/lib/master'
import type { MasterCategory, MasterItemType } from '@/lib/types'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ListingNewItemsScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri?: string
    workId: string
    category: string
    charactersJson: string
  }>()
  const { userId } = useAuth()

  const [itemTypes, setItemTypes] = useState<MasterItemType[]>([])
  const [freeTexts, setFreeTexts] = useState<string[]>([])

  const fetchSuggestions = (input: string) =>
    getItemTypeSuggestions(input, {
      categoryHint: params.category as MasterCategory,
    })

  const handleFreeText = (text: string) => {
    const trimmed = text.trim()
    if (trimmed === '') return
    setFreeTexts((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed],
    )
    if (userId != null) {
      void recordListingKeyword(userId, trimmed)
    }
  }

  const removeFreeText = (text: string) => {
    setFreeTexts((prev) => prev.filter((t) => t !== text))
  }

  const totalCount = itemTypes.length + freeTexts.length
  const canNext = totalCount >= 1

  const handleNext = () => {
    if (!canNext) return
    const allItemTypeIds = [...itemTypes.map((t) => t.id), ...freeTexts]
    router.push({
      pathname: '/listing/new/condition' as never,
      params: {
        imageUri: params.imageUri ?? '',
        imageBackUri: params.imageBackUri ?? '',
        workId: params.workId,
        category: params.category,
        charactersJson: params.charactersJson,
        itemTypesJson: JSON.stringify(allItemTypeIds),
      },
    })
  }

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 説明 */}
        <View style={styles.desc}>
          <Text style={styles.descTitle}>アイテム種別を選択</Text>
          <Text style={styles.descSub}>
            アクスタ、缶バッジ、ガチャ、一番くじ など。{'\n'}
            複数の種別が混ざる場合は全部選んで OK です。
          </Text>
        </View>

        <MultiSelectAutocomplete<MasterItemType>
          selected={itemTypes}
          onChange={setItemTypes}
          fetchSuggestions={fetchSuggestions}
          getKey={(t) => t.id}
          renderOption={(t) => (
            <View>
              <Text style={styles.optionMain}>{t.display_name_ja}</Text>
              {t.display_name_en != null && t.display_name_en !== '' && (
                <Text style={styles.optionSub}>{t.display_name_en}</Text>
              )}
            </View>
          )}
          renderChip={(t) => (
            <Text style={styles.chipLabel}>{t.display_name_ja}</Text>
          )}
          placeholder="例: アクスタ, ガチャ, 一番くじ"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={handleFreeText}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにない種別を追加できます。運営が確認次第マスタに追加されます。"
        />

        {/* free text 追加分 */}
        {freeTexts.length > 0 && (
          <View style={styles.freeTextSection}>
            <Text style={styles.freeTextSectionTitle}>
              フリーテキスト追加分 ({freeTexts.length})
            </Text>
            <View style={styles.freeTextChipsRow}>
              {freeTexts.map((t) => (
                <View key={t} style={styles.freeTextChip}>
                  <Text style={styles.freeTextChipLabel}>{t}</Text>
                  <Pressable
                    onPress={() => removeFreeText(t)}
                    hitSlop={8}
                    style={styles.freeTextChipClear}
                  >
                    <Ionicons name="close" size={12} color={colors.primary} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 合計 */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>合計</Text>
          <Text style={styles.totalCount}>{totalCount} 個</Text>
        </View>
      </ScrollView>

      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label="次へ"
          onPress={handleNext}
          disabled={!canNext}
          size="lg"
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  outerWrap: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  desc: { marginBottom: spacing.md },
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
  optionMain: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  optionSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
  },
  freeTextSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  freeTextSectionTitle: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  freeTextChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  freeTextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    paddingVertical: 3,
    backgroundColor: colors.background,
  },
  freeTextChipLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  freeTextChipClear: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  totalCount: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
})
