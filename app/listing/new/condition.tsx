// app/listing/new/condition.tsx
// Step 3 commit 7: セット 1 出品の条件入力 (求カード + 調整金)
//
// 旧版 (commit 4 まで): aiCardsJson (N 件) を受け取り、enrichedCardsJson (N 件) を出力
// 新版 (commit 7): charactersJson + itemTypesJson (1 セット) を受け取り、enrichedListingJson を出力
//
// 設計方針 (Phase 2 §5):
//   - セット 1 出品 = 1 want / 1 adjustment 設定 (1 セット全体に対する設定)
//   - 「N 件すべて」バナー削除 (旧 N 件分割パターン用、新フローでは不要)
//   - サマリーは 1 セット分の表示 (work + characters + item_types)
//   - 求カード必須、調整金は任意・折りたたみ・0〜¥1,000

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { getCharacterById, getItemTypeById, getWorkById } from '@/lib/master'
import type { MasterCategory } from '@/lib/types'
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

/**
 * セット 1 出品の構造化データ。confirm.tsx に渡す中間型。
 *
 * characters / itemTypes には master ID と raw text が混在し得る (ハイブリッドマスタ)。
 * 表示時は master cache lookup → 未ヒットなら raw text を直接表示。
 *
 * 3.5c Phase 1: 求の構造化 (want_works / want_characters / want_item_types) を追加。
 * 全 optional、空配列でも DB 投入する (NOT NULL DEFAULT '{}' に揃える)。
 */
export type EnrichedListing = {
  workId: string
  category: MasterCategory
  characters: string[]
  itemTypes: string[]
  want_description: string
  want_works: string[]
  want_characters: string[]
  want_item_types: string[]
  allows_adjustment: boolean
  adjustment_max: number
}

// ─────────────────────────────────────────
// helpers
// ─────────────────────────────────────────

/** master ID → display name、未ヒットなら raw text */
function characterDisplay(id: string): string {
  return getCharacterById(id)?.display_name_ja ?? id
}

function itemTypeDisplay(id: string): string {
  return getItemTypeById(id)?.display_name_ja ?? id
}

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────

export default function ListingNewConditionScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri?: string
    workId: string
    category: string
    charactersJson: string
    itemTypesJson: string
    wantWorksJson?: string
    wantCharactersJson?: string
    wantItemTypesJson?: string
  }>()

  // 受信データを lazy parse (param は同期取得、setter 不要)
  const [characters] = useState<string[]>(() => {
    try {
      return JSON.parse(params.charactersJson) as string[]
    } catch {
      return []
    }
  })
  const [itemTypes] = useState<string[]>(() => {
    try {
      return JSON.parse(params.itemTypesJson) as string[]
    } catch {
      return []
    }
  })
  // 求の構造化データ (任意、未指定なら空配列)
  const [wantWorks] = useState<string[]>(() => {
    try {
      return params.wantWorksJson != null
        ? (JSON.parse(params.wantWorksJson) as string[])
        : []
    } catch {
      return []
    }
  })
  const [wantCharacters] = useState<string[]>(() => {
    try {
      return params.wantCharactersJson != null
        ? (JSON.parse(params.wantCharactersJson) as string[])
        : []
    } catch {
      return []
    }
  })
  const [wantItemTypes] = useState<string[]>(() => {
    try {
      return params.wantItemTypesJson != null
        ? (JSON.parse(params.wantItemTypesJson) as string[])
        : []
    } catch {
      return []
    }
  })

  // 求カード (β1 拡張: 必須 → 任意化。未入力でも出品可、入力時は出品詳細「求」タブに反映)
  const [want, setWant] = useState('')
  // 調整金 (任意・折りたたみ)
  const [showDiff, setShowDiff] = useState(false)
  const [diffAmt, setDiffAmt] = useState('0')

  const work = getWorkById(params.workId)

  // 任意化: want の入力有無に関わらず確認画面へ進める
  const canProceed = true

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
    const enriched: EnrichedListing = {
      workId: params.workId,
      category: params.category as MasterCategory,
      characters,
      itemTypes,
      want_description: want.trim(),
      want_works: wantWorks,
      want_characters: wantCharacters,
      want_item_types: wantItemTypes,
      allows_adjustment: showDiff,
      adjustment_max: parsedDiffAmt,
    }
    router.push({
      pathname: '/listing/new/confirm' as never,
      params: {
        imageUri: params.imageUri ?? '',
        imageBackUri: params.imageBackUri ?? '',
        enrichedListingJson: JSON.stringify(enriched),
      },
    })
  }

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
      <ScreenHeader title="出品" subtitle="条件 6/6" />
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
          {/* セットサマリー */}
          <View style={styles.setSummary}>
            <Text style={styles.summaryLabel}>出品内容</Text>
            <Text style={styles.summaryWork}>
              {/* master 未登録の自由入力 workId は raw text を表示 */}
              {work?.display_name_ja ?? params.workId ?? '(作品未指定)'}
            </Text>
            <Text style={styles.summaryDetail}>
              {characters.length > 0
                ? characters.map(characterDisplay).join('、')
                : '(キャラ未指定)'}
            </Text>
            {itemTypes.length > 0 && (
              <Text style={styles.summaryDetailSub}>
                {itemTypes.map(itemTypeDisplay).join(' / ')}
              </Text>
            )}
          </View>

          {/* ── 求の詳細・コメント(任意) ── */}
          {/* 3.5c Phase 1: 構造化された want_* は前ステップで入力済。ここはフリーテキスト補足。 */}
          <Text style={styles.sectionLabel}>
            求の詳細・コメント<Text style={styles.optional}>（任意）</Text>
          </Text>
          <Text style={styles.sectionHint}>
            前のステップで選んだ「求」に補足したいことを自由に書けます。
          </Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="例: 美品希望、未所持優先、異種交換も相談OK"
            value={want}
            onChangeText={setWant}
            multiline
            textAlignVertical="top"
          />

          {/* ── 調整金(任意・折りたたみ)── */}
          <Pressable
            style={styles.diffToggleBtn}
            onPress={() => setShowDiff((v) => !v)}
          >
            <Text style={styles.diffToggleBtnText}>
              {showDiff ? '▼ 調整金を非表示' : '＋ 調整金を許可する(任意)'}
            </Text>
          </Pressable>

          {showDiff && (
            <View style={styles.diffWrap}>
              <Text style={styles.diffLabel}>調整金の目安(0〜¥1,000)</Text>
              <TextInput
                style={styles.diffInput}
                value={diffAmt}
                onChangeText={handleDiffChange}
                keyboardType="number-pad"
                textAlign="center"
              />
              <Text style={styles.diffNote}>
                出品時点で確定不要。提案時に変更できます。上限¥1,000(売買化防止)。
              </Text>
            </View>
          )}
        </ScrollView>

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
  outerWrap: { flex: 1, backgroundColor: colors.background },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  // セットサマリー (1 セット分の表示、旧 N 件バナー廃止)
  setSummary: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  summaryWork: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  summaryDetail: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
  },
  summaryDetailSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  // section
  sectionLabel: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  required: { color: colors.error },
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
  inputMulti: { minHeight: 88 },
  // 調整金トグル
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
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
})
