// components/listing/section/CharactersSection.tsx
//
// Phase A: 出品 1 ページ化 section 抽出。
// 元: app/listing/new/characters.tsx (MultiSelectAutocomplete + free text)。
//
// 再利用/書き換え比率: 再利用 ~85% / 書き換え ~15%
//   - MultiSelectAutocomplete 呼出、renderOption / renderChip / freeText modal: 完全流用
//   - free text 別セクション + 合計行: 完全流用
//   - 削除: SafeAreaView / ScreenHeader / handleNext / PrimaryCTA / router.push
//   - 追加: controlled 化。value は hybrid string[] (master ID + free text 混在)、
//     内部で masters (MasterCharacter[]) と freeTexts (string[]) に分解して UI 表示。
//     onChange は merged string[] で通知。
//
// hydration:
//   value の各 ID を getCharacterById で lookup → master ヒット / 未ヒット を仕分け。

import { Ionicons } from '@expo/vector-icons'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import {
  getCharacterById,
  getCharacterSuggestions,
  recordListingKeyword,
} from '@/lib/master'
import type { MasterCharacter } from '@/lib/types'
import React, { useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { CharactersSectionValue } from './types'

export type CharactersSectionProps = {
  value: CharactersSectionValue
  onChange: (next: CharactersSectionValue) => void
  /** master_characters を絞り込む work_id (自由入力時は master 未ヒットで候補空になるが許容) */
  workId: string
  /** キーワード履歴記録用。未認証 (null) の場合は記録スキップ */
  userId: string | null
}

/** value (string[]) から masters + freeTexts に仕分ける */
function hydrate(value: CharactersSectionValue): {
  masters: MasterCharacter[]
  freeTexts: string[]
} {
  const masters: MasterCharacter[] = []
  const freeTexts: string[] = []
  for (const id of value) {
    const m = getCharacterById(id)
    if (m != null) masters.push(m)
    else freeTexts.push(id)
  }
  return { masters, freeTexts }
}

export function CharactersSection({
  value,
  onChange,
  workId,
  userId,
}: CharactersSectionProps) {
  // hydration は初回のみ。以降は内部 state を single source of truth とし、
  // 変更のたびに onChange で親へ通知する。
  const initial = useMemo(() => hydrate(value), [value])
  const [masters, setMasters] = useState<MasterCharacter[]>(initial.masters)
  const [freeTexts, setFreeTexts] = useState<string[]>(initial.freeTexts)

  const fetchSuggestions = (input: string) =>
    getCharacterSuggestions(input, { workId })

  const notify = (nextMasters: MasterCharacter[], nextFreeTexts: string[]) => {
    onChange([...nextMasters.map((m) => m.id), ...nextFreeTexts])
  }

  const handleMastersChange = (next: MasterCharacter[]) => {
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
      <MultiSelectAutocomplete<MasterCharacter>
        selected={masters}
        onChange={handleMastersChange}
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
