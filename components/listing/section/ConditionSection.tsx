// components/listing/section/ConditionSection.tsx
//
// Phase A: 出品 1 ページ化 section 抽出。
// 元: app/listing/new/condition.tsx (求詳細フリーテキスト + 調整金)。
//
// 再利用/書き換え比率: 再利用 ~75% / 書き換え ~25%
//   - want (求詳細フリーテキスト) 入力: 完全流用
//   - 調整金 toggle + input + FEATURE_FLAGS.ADJUSTMENT_MONEY_ENABLED gate: 完全流用
//   - handleDiffChange の parse ロジック: 完全流用
//   - 削除: SafeAreaView / KeyboardAvoidingView / ScreenHeader / セットサマリー /
//           handleNext / PrimaryCTA / router.push
//     ※ セットサマリーは condition.tsx が params から work/characters/itemTypes を
//        受け取って表示していたが、1 ページ化では 1 画面内で全 section の値が見えるため
//        本 section にはサマリー表示を含めない (Phase B で親画面が任意で表示する)
//   - 追加: value/onChange props (want_description / allows_adjustment / adjustment_max)

import { FEATURE_FLAGS } from '@/constants/feature-flags'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import React from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import type { ConditionSectionValue } from './types'

export type ConditionSectionProps = {
  value: ConditionSectionValue
  onChange: (next: ConditionSectionValue) => void
}

export function ConditionSection({ value, onChange }: ConditionSectionProps) {
  const handleWantChange = (text: string) => {
    onChange({ ...value, want_description: text })
  }

  const toggleAdjustment = () => {
    onChange({ ...value, allows_adjustment: !value.allows_adjustment })
  }

  const handleDiffChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, '')
    const parsed = digits === '' ? 0 : Math.min(1000, parseInt(digits, 10))
    onChange({ ...value, adjustment_max: parsed })
  }

  return (
    <View style={styles.wrap}>
      {/* ── 求の詳細・コメント(任意) ── */}
      <Text style={styles.sectionLabel}>
        求の詳細・コメント<Text style={styles.optional}>（任意）</Text>
      </Text>
      <Text style={styles.sectionHint}>
        前のセクションで選んだ「求」に補足したいことを自由に書けます。
      </Text>
      <TextInput
        style={[styles.input, styles.inputMulti]}
        placeholder="例: 美品希望、未所持優先、異種交換も相談OK"
        value={value.want_description}
        onChangeText={handleWantChange}
        multiline
        textAlignVertical="top"
      />

      {/* ── 調整金(任意・折りたたみ) ──
          β1: ADJUSTMENT_MONEY_ENABLED=false 中は非表示。
          allows_adjustment は false 固定、adjustment_max は 0 のまま。 */}
      {FEATURE_FLAGS.ADJUSTMENT_MONEY_ENABLED && (
        <>
          <Pressable
            style={styles.diffToggleBtn}
            onPress={toggleAdjustment}
          >
            <Text style={styles.diffToggleBtnText}>
              {value.allows_adjustment
                ? '▼ 調整金を非表示'
                : '＋ 調整金を許可する(任意)'}
            </Text>
          </Pressable>

          {value.allows_adjustment && (
            <View style={styles.diffWrap}>
              <Text style={styles.diffLabel}>調整金の目安(0〜¥1,000)</Text>
              <TextInput
                style={styles.diffInput}
                value={String(value.adjustment_max)}
                onChangeText={handleDiffChange}
                keyboardType="number-pad"
                textAlign="center"
              />
              <Text style={styles.diffNote}>
                出品時点で確定不要。提案時に変更できます。上限¥1,000(売買化防止)。
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  optional: {
    fontSize: 12,
    fontWeight: fontWeight.medium,
    color: colors.textTertiary,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
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
  inputMulti: { minHeight: 88 },
  diffToggleBtn: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
  },
  diffToggleBtnText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  diffWrap: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    gap: spacing.xs,
  },
  diffLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  diffInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  diffNote: {
    fontSize: 11,
    color: colors.textTertiary,
    lineHeight: 16,
  },
})
