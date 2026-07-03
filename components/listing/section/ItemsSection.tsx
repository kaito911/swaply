// components/listing/section/ItemsSection.tsx
//
// Phase A: 出品 1 ページ化 section 抽出。
// 元: app/listing/new/items.tsx (種別 multi-select、CharactersSection とほぼ同構造)。
//
// 再利用/書き換え比率: 再利用 ~85% / 書き換え ~15%
//   - MultiSelectAutocomplete + free text section: 完全流用
//   - 削除: SafeAreaView / ScreenHeader / handleNext / PrimaryCTA / router.push
//   - 追加: controlled 化、hydration。CharactersSection と同型パターン。
//
// 元 items.tsx L46-48: category_hint フィルタ廃止、全 master_item_types から候補表示。
// (推し活グッズは作品カテゴリに関係なく交換対象)

import { Ionicons } from '@expo/vector-icons'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import {
  getItemTypeById,
  getItemTypeSuggestions,
  recordListingKeyword,
} from '@/lib/master'
import type { MasterItemType } from '@/lib/types'
import React, { useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { ItemsSectionValue } from './types'

export type ItemsSectionProps = {
  value: ItemsSectionValue
  onChange: (next: ItemsSectionValue) => void
  /** キーワード履歴記録用。未認証 (null) の場合は記録スキップ */
  userId: string | null
}

function hydrate(value: ItemsSectionValue): {
  masters: MasterItemType[]
  freeTexts: string[]
} {
  const masters: MasterItemType[] = []
  const freeTexts: string[] = []
  for (const id of value) {
    const m = getItemTypeById(id)
    if (m != null) masters.push(m)
    else freeTexts.push(id)
  }
  return { masters, freeTexts }
}

export function ItemsSection({
  value,
  onChange,
  userId,
}: ItemsSectionProps) {
  const initial = useMemo(() => hydrate(value), [value])
  const [masters, setMasters] = useState<MasterItemType[]>(initial.masters)
  const [freeTexts, setFreeTexts] = useState<string[]>(initial.freeTexts)

  const fetchSuggestions = (input: string) => getItemTypeSuggestions(input)

  const notify = (nextMasters: MasterItemType[], nextFreeTexts: string[]) => {
    onChange([...nextMasters.map((t) => t.id), ...nextFreeTexts])
  }

  const handleMastersChange = (next: MasterItemType[]) => {
    setMasters(next)
    notify(next, freeTexts)
  }

  const handleFreeText = (text: string) => {
    const trimmed = text.trim()
    if (trimmed === '') return
    if (freeTexts.includes(trimmed)) return
    const next = [...freeTexts, trimmed]
    setFreeTexts(next)
    notify(masters, next)
    if (userId != null) {
      void recordListingKeyword(userId, trimmed)
    }
  }

  const removeFreeText = (text: string) => {
    const next = freeTexts.filter((t) => t !== text)
    setFreeTexts(next)
    notify(masters, next)
  }

  const totalCount = masters.length + freeTexts.length

  return (
    <View style={styles.wrap}>
      <MultiSelectAutocomplete<MasterItemType>
        selected={masters}
        onChange={handleMastersChange}
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

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>合計</Text>
        <Text style={styles.totalCount}>{totalCount} 個</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
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
})
