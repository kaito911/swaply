// app/listing/new/cardinfo.tsx
// STEP3: カード情報入力
// 資料: プロトタイプ STEP3「カード情報入力（カード単位）」
//   - deleted=false のカードごとに シリーズ・メンバー・カード を入力（全必須）
//   - canNext = activeCards.every(c => c.series && c.member && c.card)
//   - 次: /listing/new/condition
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
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

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────
export default function ListingNewCardinfoScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri: string | undefined
  }>()
  const { imageUri, imageBackUri } = params

  const [cards, setCards] = useState<AiCard[]>(() => [
    {
      id: 'card_1',
      group: '',
      series: '',
      member: '',
      card: '',
      deleted: false,
      memberCandidates: [],
      seriesCandidates: [],
      cardCandidates: [],
    },
  ])

  const activeCards = cards.filter((c) => !c.deleted)

  const canNext =
    activeCards.length > 0 &&
    activeCards.every(
      (c) => c.group.trim().length > 0 && c.member.trim().length > 0,
    )

  const updateCard = (id: string, field: 'group' | 'series' | 'member' | 'card', val: string) => {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, [field]: val } : c)))
  }

  const handleNext = () => {
    if (!canNext) return
    router.push({
      pathname: '/listing/new/condition' as never,
      params: {
        imageUri,
        imageBackUri,
        aiCardsJson: JSON.stringify(cards),
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
          {/* 説明 */}
          <View style={styles.desc}>
            <Text style={styles.descText}>
              各カードの情報を確認・入力してください。
            </Text>
            <Text style={styles.descSub}>
              欲しいカード DB と照合するため、シリーズ・メンバー・カードの3つが必要です。
            </Text>
          </View>

          {/* カード単位フォーム */}
          <View style={styles.cardList}>
            {activeCards.map((c, i) => (
              <View key={c.id} style={styles.cardBlock}>
                {/* カードヘッダー */}
                <View style={styles.cardHeader}>
                  {imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.thumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]} />
                  )}
                  <View style={styles.cardHeaderBody}>
                    <Text style={styles.cardHeaderNum}>カード {i + 1}</Text>
                    <Text style={styles.cardHeaderSummary} numberOfLines={1}>
                      {[c.group, c.member, c.series].filter(Boolean).join(' · ') || '情報を入力してください'}
                    </Text>
                  </View>
                </View>

                {/* フォーム */}
                <View style={styles.form}>
                  {(
                    [
                      ['グループ', 'group', c.group, '例：TREASURE', true],
                      ['メンバー', 'member', c.member, '例：ハルト', true],
                      ['シリーズ', 'series', c.series, '例：REBOOT', false],
                    ] as [string, 'group' | 'series' | 'member' | 'card', string, string, boolean][]
                  ).map(([fieldLabel, field, value, placeholder, required]) => (
                    <View key={field} style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>
                        {fieldLabel}{required && <Text style={styles.required}> *</Text>}
                      </Text>
                      <TextInput
                        style={[styles.input, value.trim() ? styles.inputFilled : undefined]}
                        value={value}
                        onChangeText={(v) => updateCard(c.id, field, v)}
                        placeholder={placeholder}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* アクティブカードが0件の場合 */}
          {activeCards.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                出品するカードがありません。前の画面に戻って選択し直してください。
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

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────
const styles = StyleSheet.create({
  outerWrap: { flex: 1, backgroundColor: colors.background },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  // desc
  desc: {
    marginBottom: spacing.md,
  },
  descText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  descSub: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 4,
    lineHeight: 17,
  },
  // card list
  cardList: { gap: spacing.md },
  cardBlock: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  // card header
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundMuted,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    flexShrink: 0,
    backgroundColor: colors.border,
  },
  thumbPlaceholder: {
    backgroundColor: colors.backgroundMuted,
  },
  cardHeaderBody: { flex: 1, minWidth: 0 },
  cardHeaderNum: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  cardHeaderSummary: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 1,
  },
  // form
  form: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldLabel: {
    width: 64,
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  required: { color: colors.error },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundCard,
  },
  inputFilled: {
    borderColor: colors.primary,
  },
  // empty state
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
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
