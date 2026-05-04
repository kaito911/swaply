// app/listing/new/condition.tsx
// STEP4: 交換条件入力（共通条件）
// 資料: プロトタイプ STEP4「共通条件（求カード・調整金）」
//   - aiCardsJson を受け取り、activeCards を初期化
//   - 求カード: フリーテキスト必須（全カード共通）
//   - 調整金: 初期折りたたみ・任意・0〜¥1,000（全カード共通）
//   - 発送方法はこのSTEPに含まれない（プロトタイプ仕様）
//   - 出口: enrichedCardsJson（EnrichedCard[] を JSON化）を confirm.tsx へ渡す
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
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

// ─────────────────────────────────────────
// types
// ─────────────────────────────────────────

// cardinfo.tsx から受け取るカード型
type AiCard = {
  id: string
  group: string
  series: string
  member: string
  card: string
  deleted: boolean
  memberCandidates: string[]
  seriesCandidates: string[]
  cardCandidates: string[]
}

// confirm.tsx へ渡すカード型（条件フィールドを各カードに保持）
type EnrichedCard = {
  id: string
  group: string
  series: string
  member: string
  card: string
  want_description: string
  allows_adjustment: boolean
  adjustment_max: number
}

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────
export default function ListingNewConditionScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri: string
    aiCardsJson: string
  }>()
  const { imageUri, imageBackUri } = params

  // useLocalSearchParams は同期的に値を返すため lazy initializer で直接 parse する
  // activeCards は STEP4 内で編集しないため setter は不要
  const [activeCards] = useState<AiCard[]>(() => {
    const all = JSON.parse(params.aiCardsJson) as AiCard[]
    return all.filter((c) => !c.deleted)
  })

  // 求カード（必須・全カード共通）
  const [want, setWant] = useState('')
  // 調整金（任意・初期折りたたみ・全カード共通）
  const [showDiff, setShowDiff] = useState(false)
  const [diffAmt, setDiffAmt] = useState('0')

  const canProceed = want.trim().length > 0 && activeCards.length > 0

  const handleDiffChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, '')
    if (digits === '') {
      setDiffAmt('0')
      return
    }
    setDiffAmt(String(Math.min(1000, parseInt(digits, 10))))
  }

  const parsedDiffAmt = parseInt(diffAmt, 10) || 0

  const handleNext = () => {
    if (!canProceed) return
    // 共通条件を各カードに適用して EnrichedCard[] を生成
    const enriched: EnrichedCard[] = activeCards.map((c) => ({
      id: c.id,
      group: c.group,
      series: c.series,
      member: c.member,
      card: c.card,
      want_description: want.trim(),
      allows_adjustment: showDiff,
      adjustment_max: parsedDiffAmt,
    }))
    router.push({
      pathname: '/listing/new/confirm' as never,
      params: {
        imageUri,
        imageBackUri,
        enrichedCardsJson: JSON.stringify(enriched),
      },
    })
  }

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
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
          {/* ── 複数カード共通適用バナー（N>1のみ表示）── */}
          {activeCards.length > 1 && (
            <View style={styles.commonBanner}>
              <Text style={styles.commonBannerText}>
                ここで設定した条件は{' '}
                <Text style={styles.commonBannerBold}>
                  {activeCards.length}件すべての出品
                </Text>
                {' '}に共通で適用されます。
              </Text>
            </View>
          )}

          {/* ── 対象カードサマリー ── */}
          <View style={styles.cardSummaryList}>
            {activeCards.map((c, i) => (
              <View key={c.id} style={styles.cardSummaryRow}>
                <View style={styles.cardSummaryBadge}>
                  <Text style={styles.cardSummaryBadgeText}>{i + 1}</Text>
                </View>
                <Text style={styles.cardSummaryLabel} numberOfLines={1}>
                  {[c.group, c.member, c.series].filter(Boolean).join(' · ') || '（未入力）'}
                </Text>
              </View>
            ))}
          </View>

          {/* ── 求（欲しいカード）必須 ── */}
          <Text style={styles.sectionLabel}>
            求（欲しいカード）<Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.sectionHint}>
            カード単位で指定。メンバー・シリーズだけでも可。
          </Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="例：ヨシ solo ver."
            value={want}
            onChangeText={setWant}
            multiline
            textAlignVertical="top"
          />

          {/* ── 調整金（任意・折りたたみ）── */}
          <Pressable
            style={styles.diffToggleBtn}
            onPress={() => setShowDiff((v) => !v)}
          >
            <Text style={styles.diffToggleBtnText}>
              {showDiff ? '▼ 調整金を非表示' : '＋ 調整金を許可する（任意）'}
            </Text>
          </Pressable>

          {showDiff && (
            <View style={styles.diffWrap}>
              <Text style={styles.diffLabel}>調整金の目安（0〜¥1,000）</Text>
              <TextInput
                style={styles.diffInput}
                value={diffAmt}
                onChangeText={handleDiffChange}
                keyboardType="number-pad"
                textAlign="center"
              />
              <Text style={styles.diffNote}>
                出品時点で確定不要。提案時に変更できます。上限¥1,000（売買化防止）。
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Fixed CTA */}
        <View style={styles.ctaWrap}>
          <PrimaryCTA
            label="次へ"
            onPress={handleNext}
            disabled={!canProceed}
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────
const styles = StyleSheet.create({
  outerWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  // 複数カード共通適用バナー
  commonBanner: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  commonBannerText: {
    fontSize: 12,
    color: '#3730A3',
    lineHeight: 18,
  },
  commonBannerBold: {
    fontWeight: fontWeight.bold,
  },
  // カードサマリー
  cardSummaryList: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  cardSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  cardSummaryBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardSummaryBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  cardSummaryLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  // section
  sectionLabel: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.error,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  // text input
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
  inputMulti: {
    minHeight: 88,
  },
  // 調整金トグルボタン
  diffToggleBtn: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  diffToggleBtnText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  // 調整金展開エリア
  diffWrap: {
    marginTop: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  diffLabel: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  diffInput: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    fontSize: 20,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundCard,
    marginBottom: spacing.sm,
  },
  diffNote: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 17,
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
