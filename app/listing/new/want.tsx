// app/listing/new/want.tsx
// Step 3.5c Phase 1: 出品 form「求」構造化入力 step
//
// 設計方針:
//   - 譲側 (work / characters / items) と同じ MultiSelectAutocomplete + free text fallback
//     パターンを再利用、画面分割せず 1 ページに 3 個の autocomplete を縦並び
//     (求は全 optional なので「気軽に書ける」UX を演出する)
//   - want_works / want_characters / want_item_types の 3 配列を出力 (master id + free text 混在)
//   - 「入力するとマッチングされやすくなります」コピーで matcher v3 連動を匂わせる
//
// 受け取る params (items.tsx から):
//   imageUri, imageBackUri, workId, category, charactersJson, itemTypesJson
// 渡す params (condition.tsx へ):
//   上記 + wantCharactersJson, wantItemTypesJson, wantWorksJson

import { Ionicons } from '@expo/vector-icons'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import {
  getCharacterSuggestionsAcrossWorks,
  getItemTypeSuggestions,
  getWorkSuggestions,
  recordListingKeyword,
} from '@/lib/master'
import type {
  MasterCharacter,
  MasterItemType,
  MasterWork,
} from '@/lib/types'
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

export default function ListingNewWantScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri?: string
    workId: string
    category: string
    charactersJson: string
    itemTypesJson: string
  }>()
  const { userId } = useAuth()

  // master 選択 (chip 表示) と free text を分離保持 (characters/items.tsx と同じ paradigm)
  const [wantWorks, setWantWorks] = useState<MasterWork[]>([])
  const [wantWorkFreeTexts, setWantWorkFreeTexts] = useState<string[]>([])

  const [wantChars, setWantChars] = useState<MasterCharacter[]>([])
  const [wantCharFreeTexts, setWantCharFreeTexts] = useState<string[]>([])

  const [wantItemTypes, setWantItemTypes] = useState<MasterItemType[]>([])
  const [wantItemTypeFreeTexts, setWantItemTypeFreeTexts] = useState<string[]>([])

  // 自分の出品作品でフィルタしない (求は別作品も対象になり得る)。
  // matcher v3 で「Aの譲 ↔ Bの求」を overlap マッチする前提で、別作品の指定を許容する。
  const fetchWorkSuggestions = (input: string) =>
    getWorkSuggestions(input, 10)

  // 求めるキャラは特定 work に紐づかない (別作品キャラの指定可)
  // Phase 0.5b で追加された作品横断 fuzzy filter を流用
  const fetchCharSuggestions = (input: string) =>
    getCharacterSuggestionsAcrossWorks(input)

  const fetchItemTypeSuggestions = (input: string) =>
    getItemTypeSuggestions(input)

  const handleFreeText = (
    text: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    const trimmed = text.trim()
    if (trimmed === '') return
    setter((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
    if (userId != null) {
      void recordListingKeyword(userId, trimmed)
    }
  }

  const removeFreeText = (
    text: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter((prev) => prev.filter((t) => t !== text))
  }

  // 「次へ」は常に有効 (求は全 optional)
  const handleNext = () => {
    const allWorks = [...wantWorks.map((w) => w.id), ...wantWorkFreeTexts]
    const allChars = [...wantChars.map((c) => c.id), ...wantCharFreeTexts]
    const allItemTypes = [
      ...wantItemTypes.map((t) => t.id),
      ...wantItemTypeFreeTexts,
    ]
    router.push({
      pathname: '/listing/new/condition' as never,
      params: {
        imageUri: params.imageUri ?? '',
        imageBackUri: params.imageBackUri ?? '',
        workId: params.workId,
        category: params.category,
        charactersJson: params.charactersJson,
        itemTypesJson: params.itemTypesJson,
        wantWorksJson: JSON.stringify(allWorks),
        wantCharactersJson: JSON.stringify(allChars),
        wantItemTypesJson: JSON.stringify(allItemTypes),
      },
    })
  }

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
      <ScreenHeader title="出品" subtitle="求 5/6" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 説明 */}
        <View style={styles.desc}>
          <Text style={styles.descTitle}>求めるものを選択（任意）</Text>
          <Text style={styles.descSub}>
            空のままでも出品できます。{'\n'}
            入力するとマッチングされやすくなります。
          </Text>
        </View>

        {/* ── 求める作品 ─── */}
        <Text style={styles.sectionLabel}>求める作品（任意）</Text>
        <MultiSelectAutocomplete<MasterWork>
          selected={wantWorks}
          onChange={setWantWorks}
          fetchSuggestions={fetchWorkSuggestions}
          getKey={(w) => w.id}
          renderOption={(w) => (
            <View>
              <Text style={styles.optionMain}>{w.display_name_ja}</Text>
              {w.display_name_en != null && w.display_name_en !== '' && (
                <Text style={styles.optionSub}>{w.display_name_en}</Text>
              )}
            </View>
          )}
          renderChip={(w) => (
            <Text style={styles.chipLabel}>{w.display_name_ja}</Text>
          )}
          placeholder="例: 鬼滅の刃, TREASURE"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={(t) => handleFreeText(t, setWantWorkFreeTexts)}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにない作品/グループを追加できます。"
        />
        {wantWorkFreeTexts.length > 0 && (
          <FreeTextChipsRow
            items={wantWorkFreeTexts}
            onRemove={(t) => removeFreeText(t, setWantWorkFreeTexts)}
          />
        )}

        {/* ── 求めるキャラ ─── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          求めるキャラ・メンバー（任意）
        </Text>
        <MultiSelectAutocomplete<MasterCharacter>
          selected={wantChars}
          onChange={setWantChars}
          fetchSuggestions={fetchCharSuggestions}
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
          placeholder="例: 炭治郎, ハルト"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={(t) => handleFreeText(t, setWantCharFreeTexts)}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにない名前を追加できます。"
        />
        {wantCharFreeTexts.length > 0 && (
          <FreeTextChipsRow
            items={wantCharFreeTexts}
            onRemove={(t) => removeFreeText(t, setWantCharFreeTexts)}
          />
        )}

        {/* ── 求めるグッズ種類 ─── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          求めるグッズ種類（任意）
        </Text>
        <MultiSelectAutocomplete<MasterItemType>
          selected={wantItemTypes}
          onChange={setWantItemTypes}
          fetchSuggestions={fetchItemTypeSuggestions}
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
          placeholder="例: アクスタ, トレカ, 缶バッジ"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={(t) => handleFreeText(t, setWantItemTypeFreeTexts)}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにない種別を追加できます。"
        />
        {wantItemTypeFreeTexts.length > 0 && (
          <FreeTextChipsRow
            items={wantItemTypeFreeTexts}
            onRemove={(t) => removeFreeText(t, setWantItemTypeFreeTexts)}
          />
        )}
      </ScrollView>

      <View style={styles.ctaWrap}>
        <PrimaryCTA label="次へ" onPress={handleNext} size="lg" />
      </View>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// sub-components
// ─────────────────────────────────────────

function FreeTextChipsRow({
  items,
  onRemove,
}: {
  items: string[]
  onRemove: (text: string) => void
}) {
  return (
    <View style={styles.freeTextSection}>
      <Text style={styles.freeTextSectionTitle}>
        フリーテキスト追加分 ({items.length})
      </Text>
      <View style={styles.freeTextChipsRow}>
        {items.map((t) => (
          <View key={t} style={styles.freeTextChip}>
            <Text style={styles.freeTextChipLabel}>{t}</Text>
            <Pressable
              onPress={() => onRemove(t)}
              hitSlop={8}
              style={styles.freeTextChipClear}
            >
              <Ionicons name="close" size={12} color={colors.primary} />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
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
  sectionLabel: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionLabelSpaced: {
    marginTop: spacing.lg,
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
    marginTop: spacing.sm,
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
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
})
