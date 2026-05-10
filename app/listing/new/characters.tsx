// app/listing/new/characters.tsx
// Step 3 commit 4: 出品 form 3-step フロー Step 2 — キャラクター (characters[]) 入力
//
// 設計方針 (Phase 2 §4):
//   - MultiSelectAutocomplete で master_characters を multi-select (work_id フィルタ)
//   - フリーテキスト fallback 有効、onFreeText で recordListingKeyword + state 追加
//   - master 選択 chip は MultiSelectAutocomplete 内、free text chip は下部別セクション
//   - 最低 1 個必須 (master + free text 合計、ハイブリッドマスタの本質)
//
// 受け取る params (work.tsx から):
//   imageUri, imageBackUri, workId, category
// 渡す params (items.tsx へ):
//   imageUri, imageBackUri, workId, category, charactersJson (master ID + free text 混在)

import { Ionicons } from '@expo/vector-icons'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import { getCharacterSuggestions, recordListingKeyword } from '@/lib/master'
import type { MasterCategory, MasterCharacter } from '@/lib/types'
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

export default function ListingNewCharactersScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri?: string
    workId: string
    category: string
  }>()
  const { userId } = useAuth()

  const [characters, setCharacters] = useState<MasterCharacter[]>([])
  const [freeTexts, setFreeTexts] = useState<string[]>([])

  const fetchSuggestions = (input: string) =>
    getCharacterSuggestions(input, { workId: params.workId })

  const handleFreeText = (text: string) => {
    const trimmed = text.trim()
    if (trimmed === '') return
    // dedup + append
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

  const totalCount = characters.length + freeTexts.length
  const canNext = totalCount >= 1

  const handleNext = () => {
    if (!canNext) return
    // 統合: master ID + free text 混在の string[]
    const allCharIds = [...characters.map((c) => c.id), ...freeTexts]
    router.push({
      pathname: '/listing/new/items' as never,
      params: {
        imageUri: params.imageUri ?? '',
        imageBackUri: params.imageBackUri ?? '',
        workId: params.workId,
        category: params.category,
        charactersJson: JSON.stringify(allCharIds),
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
          <Text style={styles.descTitle}>キャラクターを選択</Text>
          <Text style={styles.descSub}>
            主要なキャラを 1-5 個入れれば検索でヒットします。{'\n'}
            セット出品でも全員入れる必要はありません。
          </Text>
        </View>

        {/* MultiSelectAutocomplete: master 選択 */}
        <MultiSelectAutocomplete<MasterCharacter>
          selected={characters}
          onChange={setCharacters}
          fetchSuggestions={fetchSuggestions}
          getKey={(c) => c.id}
          renderOption={(c) => (
            <View>
              <Text style={styles.optionMain}>{c.display_name_ja}</Text>
              {c.display_name_en != null && c.display_name_en !== '' && (
                <Text style={styles.optionSub}>{c.display_name_en}</Text>
              )}
            </View>
          )}
          renderChip={(c) => (
            <Text style={styles.chipLabel}>{c.display_name_ja}</Text>
          )}
          placeholder="例: 炭治郎, 善逸, 蜜璃"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={handleFreeText}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにない名前を追加できます。運営が確認次第マスタに追加されると、検索でヒットしやすくなります。"
        />

        {/* free text 追加分 (別セクション) */}
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

      {/* Fixed CTA */}
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
  // option 内
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
  // chip 内 (master)
  chipLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
  },
  // free text 別セクション
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
  // 合計
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
