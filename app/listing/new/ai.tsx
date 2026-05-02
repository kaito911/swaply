// app/listing/new/ai.tsx
// STEP2: AI確認・修正
// 資料: プロトタイプ STEP2「AI 検出 → 確認・修正」
//   - AI検出結果一覧表示
//   - 各カードに 修正/削除/戻す
//   - 候補チップ（メンバー/シリーズ/カード）タップで選択
//   - 候補にない場合のみ直接入力
//   - 手動追加ボタン
//   - canNext = deleted=false のカードが1件以上
//   - 次: /listing/new/cardinfo
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import {
  Image,
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
type AiCard = {
  id: string
  series: string
  member: string
  card: string
  deleted: boolean
  memberCandidates: string[]
  seriesCandidates: string[]
  cardCandidates: string[]
}

// ─────────────────────────────────────────
// mock AI 検出データ（bbox id → card 候補）
// Phase 1: AI 未連携のため mock を使用
// ─────────────────────────────────────────
type MockEntry = Omit<AiCard, 'id' | 'deleted'>

const AI_MOCK: Record<string, MockEntry> = {
  b1: {
    series: 'REBOOT',
    member: 'ハルト',
    card: 'A ver.',
    memberCandidates: ['ハルト', 'ヨシ', 'ジュンギュ'],
    seriesCandidates: ['REBOOT', 'THE FIRST STEP', 'ROAD TO KINGDOM'],
    cardCandidates: ['A ver.', 'B ver.', 'unit'],
  },
  b2: {
    series: 'REBOOT',
    member: 'ヨシ',
    card: 'unit',
    memberCandidates: ['ヨシ', 'ハルト', 'テヒョン'],
    seriesCandidates: ['REBOOT', 'THE FIRST STEP', 'ROAD TO KINGDOM'],
    cardCandidates: ['unit', 'A ver.', 'B ver.'],
  },
  b3: {
    series: 'REBOOT',
    member: 'ダヒョン',
    card: 'B ver.',
    memberCandidates: ['ダヒョン', 'ジュンギュ', 'マシュー'],
    seriesCandidates: ['REBOOT', 'THE FIRST STEP', 'ROAD TO KINGDOM'],
    cardCandidates: ['B ver.', 'A ver.', 'unit'],
  },
}

// 未知の id 用のフォールバック
const EMPTY_MOCK: MockEntry = {
  series: '',
  member: '',
  card: '',
  memberCandidates: [],
  seriesCandidates: [],
  cardCandidates: [],
}

// ─────────────────────────────────────────
// helpers
// ─────────────────────────────────────────
function buildAiCards(selectedIds: string[]): AiCard[] {
  return selectedIds.map((id) => ({
    id,
    ...(AI_MOCK[id] ?? EMPTY_MOCK),
    deleted: false,
  }))
}

function cardSummaryLabel(c: AiCard): string {
  const parts = [c.series, c.member, c.card].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '（未入力）'
}

// ─────────────────────────────────────────
// sub-components
// ─────────────────────────────────────────

// 候補チップ一覧
function CandidateChips({
  label,
  candidates,
  current,
  onSelect,
}: {
  label: string
  candidates: string[]
  current: string
  onSelect: (v: string) => void
}) {
  if (candidates.length === 0) return null
  return (
    <View style={chipStyles.wrap}>
      <Text style={chipStyles.label}>{label}候補（タップで選択）</Text>
      <View style={chipStyles.row}>
        {candidates.map((c) => {
          const isOn = current === c
          return (
            <Pressable
              key={c}
              onPress={() => onSelect(c)}
              style={[chipStyles.chip, isOn && chipStyles.chipOn]}
            >
              <Text style={[chipStyles.chipText, isOn && chipStyles.chipTextOn]}>
                {isOn ? '✓ ' : ''}{c}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const chipStyles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  label: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.backgroundCard,
  },
  chipOn: {
    borderColor: colors.primary,
    backgroundColor: '#EEF2FF',
  },
  chipText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  chipTextOn: { color: colors.primary },
})

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────
export default function ListingNewAiScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    selectedIdsJson: string
  }>()
  const { imageUri } = params

  // useLocalSearchParams は同期的に値を返すため lazy initializer で直接 parse する
  const [aiCards, setAiCards] = useState<AiCard[]>(() => {
    const ids = JSON.parse(params.selectedIdsJson) as string[]
    return buildAiCards(ids)
  })
  const [editIdx, setEditIdx] = useState<number | null>(null)

  const activeCards = aiCards.filter((c) => !c.deleted)
  const canNext = activeCards.length > 0

  // ── state updaters ──────────────────────

  const updateCard = (id: string, field: 'series' | 'member' | 'card', val: string) => {
    setAiCards((cs) => cs.map((c) => (c.id === id ? { ...c, [field]: val } : c)))
  }

  const deleteCard = (id: string) => {
    setAiCards((cs) => cs.map((c) => (c.id === id ? { ...c, deleted: true } : c)))
    setEditIdx(null)
  }

  const restoreCard = (id: string) => {
    setAiCards((cs) => cs.map((c) => (c.id === id ? { ...c, deleted: false } : c)))
  }

  const addManualCard = () => {
    const newIdx = aiCards.length
    const newCard: AiCard = {
      id: `manual_${Date.now()}`,
      series: '',
      member: '',
      card: '',
      deleted: false,
      memberCandidates: [],
      seriesCandidates: [],
      cardCandidates: [],
    }
    setAiCards((cs) => [...cs, newCard])
    setEditIdx(newIdx)
  }

  const handleNext = () => {
    if (!canNext) return
    router.push({
      pathname: '/listing/new/cardinfo' as never,
      params: {
        imageUri,
        aiCardsJson: JSON.stringify(aiCards),
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
          {/* バナー */}
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>
              AI が<Text style={styles.bannerBold}>{activeCards.length}枚</Text>を検出しました
            </Text>
            <Text style={styles.bannerSub}>
              内容を確認して、修正・削除してください。最終確定はあなたです。
            </Text>
          </View>

          {/* カード一覧 */}
          <View style={styles.cardList}>
            {aiCards.map((c, i) => (
              <View
                key={c.id}
                style={[styles.cardRow, c.deleted && styles.cardRowDeleted]}
              >
                {/* ヘッダー行 */}
                <View style={styles.cardHeader}>
                  {/* サムネイル */}
                  <View style={styles.thumb}>
                    {imageUri ? (
                      <Image
                        source={{ uri: imageUri }}
                        style={styles.thumbImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.thumbPlaceholder} />
                    )}
                    <View style={[styles.numBadge, c.deleted && styles.numBadgeDeleted]}>
                      <Text style={styles.numBadgeText}>{i + 1}</Text>
                    </View>
                  </View>

                  {/* カード情報 */}
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardInfoLabel}>AI 候補</Text>
                    <Text
                      style={[styles.cardInfoValue, c.deleted && styles.cardInfoValueDeleted]}
                      numberOfLines={1}
                    >
                      {cardSummaryLabel(c)}
                    </Text>
                  </View>

                  {/* ボタン */}
                  <View style={styles.cardBtns}>
                    {!c.deleted ? (
                      <>
                        <Pressable
                          style={[styles.btn, editIdx === i && styles.btnActive]}
                          onPress={() => setEditIdx(editIdx === i ? null : i)}
                        >
                          <Text style={[styles.btnText, editIdx === i && styles.btnTextActive]}>
                            {editIdx === i ? '閉じる' : '修正'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.btn, styles.btnDanger]}
                          onPress={() => deleteCard(c.id)}
                        >
                          <Text style={[styles.btnText, styles.btnTextDanger]}>削除</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable style={styles.btn} onPress={() => restoreCard(c.id)}>
                        <Text style={styles.btnText}>戻す</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* 修正展開エリア */}
                {editIdx === i && !c.deleted && (
                  <View style={styles.editArea}>
                    <CandidateChips
                      label="メンバー"
                      candidates={c.memberCandidates}
                      current={c.member}
                      onSelect={(v) => updateCard(c.id, 'member', v)}
                    />
                    <CandidateChips
                      label="シリーズ"
                      candidates={c.seriesCandidates}
                      current={c.series}
                      onSelect={(v) => updateCard(c.id, 'series', v)}
                    />
                    <CandidateChips
                      label="カード"
                      candidates={c.cardCandidates}
                      current={c.card}
                      onSelect={(v) => updateCard(c.id, 'card', v)}
                    />

                    {/* 直接入力（候補にない場合） */}
                    <Text style={styles.directInputNote}>候補にない場合は直接入力できます</Text>

                    {(
                      [
                        ['シリーズ', 'series', c.series, '例：REBOOT'],
                        ['メンバー', 'member', c.member, '例：ハルト'],
                        ['カード', 'card', c.card, '例：A ver.'],
                      ] as [string, 'series' | 'member' | 'card', string, string][]
                    ).map(([fieldLabel, field, value, placeholder]) => (
                      <View key={field} style={styles.inputRow}>
                        <Text style={styles.inputRowLabel}>{fieldLabel}</Text>
                        <TextInput
                          style={[styles.input, value ? styles.inputFilled : undefined]}
                          value={value}
                          onChangeText={(v) => updateCard(c.id, field, v)}
                          placeholder={placeholder}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* 手動追加ボタン */}
          <Pressable style={styles.addBtn} onPress={addManualCard}>
            <Text style={styles.addBtnText}>＋ カードを手動で追加する</Text>
          </Pressable>
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
  // banner
  banner: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  bannerTitle: { fontSize: 12, color: '#3730A3', lineHeight: 18 },
  bannerBold: { fontWeight: fontWeight.bold },
  bannerSub: { fontSize: 11, color: '#4338CA', marginTop: 2, lineHeight: 16 },
  // card list
  cardList: { gap: spacing.sm },
  cardRow: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardRowDeleted: {
    borderColor: colors.errorBg,
    opacity: 0.55,
  },
  // card header row
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  // thumbnail
  thumb: { position: 'relative', flexShrink: 0 },
  thumbImage: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundMuted,
  },
  thumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundMuted,
  },
  numBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numBadgeDeleted: { backgroundColor: colors.textSecondary },
  numBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  // card info
  cardInfo: { flex: 1, minWidth: 0 },
  cardInfoLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  cardInfoValue: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardInfoValueDeleted: { color: colors.textSecondary },
  // buttons
  cardBtns: { flexDirection: 'row', gap: spacing.xs, flexShrink: 0 },
  btn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  btnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: colors.primary,
  },
  btnDanger: {
    borderColor: '#FECACA',
    backgroundColor: colors.errorBg,
  },
  btnText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  btnTextActive: { color: colors.primary },
  btnTextDanger: { color: colors.error },
  // edit expansion area
  editArea: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#FAFBFF',
  },
  directInputNote: {
    fontSize: 10,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inputRowLabel: {
    width: 56,
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundCard,
  },
  inputFilled: {
    borderColor: colors.primary,
  },
  // 手動追加ボタン
  addBtn: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
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
