// app/trade/report.tsx
//
// 取引の質への申告フォーム (Trust 質 PR / β1 は「収集のみ」)。
//   - params: { normalTradeId } または { venueTradeId } を XOR で受ける。
//   - 通常取引=7カテゴリ / 会場取引=8カテゴリ (venue_noshow を出し分け)。
//   - note は任意 (最大2000字、RPC の CHECK と整合)。写真は初版では省略 (後追い)。
//   - createTradeReport (SECURITY DEFINER RPC) を呼ぶだけ。reported_id はサーバ導出。
//
// ★設計厳守 (#22): 収集のみ。表示・集計・trust反映・「良い評価」枠は作らない。
//   申告は任意ルート (トラブル時のみ)。取引完了の必須関門にはしない。
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { createTradeReport, type TradeReportCategory } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import {
  Alert,
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

const NOTE_MAX = 2000

// カテゴリ日本語ラベル。venue_noshow は会場取引でのみ提示 (下の出し分け)。
const CATEGORY_LABELS: Record<TradeReportCategory, string> = {
  state_mismatch: '状態が説明と違った',
  wrong_item: '違う商品が届いた',
  poor_packaging: '梱包が雑だった',
  late_shipping: '発送が遅かった',
  no_contact: '連絡がつかなかった',
  not_received: '商品が届かなかった',
  venue_noshow: '会場で相手が来なかった',
  other: 'その他',
}

// 通常取引で提示する7カテゴリ (venue_noshow を除く)。
const NORMAL_CATEGORIES: TradeReportCategory[] = [
  'state_mismatch',
  'wrong_item',
  'poor_packaging',
  'late_shipping',
  'no_contact',
  'not_received',
  'other',
]

// 会場取引で提示する8カテゴリ (venue_noshow を含む)。
const VENUE_CATEGORIES: TradeReportCategory[] = [
  'state_mismatch',
  'wrong_item',
  'poor_packaging',
  'late_shipping',
  'no_contact',
  'not_received',
  'venue_noshow',
  'other',
]

// RPC の raise exception 文字列 → ユーザー向け日本語。
function messageForError(raw: string): string {
  switch (raw) {
    case 'ALREADY_REPORTED':
      return 'この取引にはすでに申告済みです。'
    case 'TRADE_NOT_ELIGIBLE':
      return '申告できる期間を過ぎています（取引完了後は7日以内、キャンセル後は14日以内）。'
    case 'NOT_TRADE_PARTICIPANT':
      return 'この取引の当事者ではありません。'
    case 'TRADE_NOT_FOUND':
      return '対象の取引が見つかりませんでした。'
    case 'AUTH_REQUIRED':
      return 'ログインが必要です。'
    case 'VENUE_NOSHOW_INVALID':
      return 'このカテゴリは会場取引でのみ選べます。'
    case 'SELF_REPORT_NOT_ALLOWED':
      return '自分自身は申告できません。'
    case 'TRADE_REF_INVALID':
      return '取引情報が正しくありません。'
    default:
      return '申告の送信に失敗しました。時間をおいて再度お試しください。'
  }
}

export default function TradeReportScreen() {
  const params = useLocalSearchParams<{
    normalTradeId?: string
    venueTradeId?: string
  }>()
  const normalTradeId =
    typeof params.normalTradeId === 'string' && params.normalTradeId !== ''
      ? params.normalTradeId
      : null
  const venueTradeId =
    typeof params.venueTradeId === 'string' && params.venueTradeId !== ''
      ? params.venueTradeId
      : null

  const isVenue = venueTradeId != null
  const categories = isVenue ? VENUE_CATEGORIES : NORMAL_CATEGORIES

  const [category, setCategory] = useState<TradeReportCategory | null>(null)
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // params 不正 (両方 NULL / 両方指定) は器の XOR に反するため、フォームを出さず案内。
  const paramsInvalid = (normalTradeId == null) === (venueTradeId == null)

  const canSubmit = category != null && confirmed && !submitting

  const handleSubmit = async () => {
    if (category == null) {
      Alert.alert('入力エラー', '申告の種類を選択してください。')
      return
    }
    if (!confirmed) {
      Alert.alert('確認', '「この内容で申告します」にチェックしてください。')
      return
    }
    try {
      setSubmitting(true)
      await createTradeReport({
        normalTradeId,
        venueTradeId,
        category,
        note: note.trim() !== '' ? note.trim() : null,
      })
      Alert.alert(
        '申告を送信しました',
        'ご協力ありがとうございます。内容は運営のみが確認し、相手や第三者には公開されません。',
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : ''
      Alert.alert('申告エラー', messageForError(raw))
    } finally {
      setSubmitting(false)
    }
  }

  if (paramsInvalid) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="取引を報告" />
        <View style={styles.center}>
          <Text style={styles.invalidText}>
            対象の取引を特定できませんでした。取引画面から開き直してください。
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScreenHeader title="取引を報告" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>
            取引で問題があった場合のみ、内容を運営に申告できます。申告は任意で、内容は
            運営のみが確認します（相手・第三者には公開されません）。
          </Text>

          {/* カテゴリ選択 */}
          <Text style={styles.sectionLabel}>どんな問題がありましたか？</Text>
          <View style={styles.categoryWrap}>
            {categories.map((c) => {
              const selected = category === c
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={({ pressed }) => [
                    styles.categoryPill,
                    selected && styles.categoryPillSelected,
                    pressed && styles.categoryPillPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      selected && styles.categoryPillTextSelected,
                    ]}
                  >
                    {CATEGORY_LABELS[c]}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* note (任意) */}
          <Text style={styles.sectionLabel}>詳細（任意）</Text>
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
            placeholder="具体的な状況があれば記入してください。"
            placeholderTextColor="#9A94AA"
            style={styles.noteInput}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.counter}>
            {note.length} / {NOTE_MAX}
          </Text>

          {/* 誤申告防止チェック */}
          <Pressable
            style={styles.checkRow}
            onPress={() => setConfirmed((v) => !v)}
          >
            <Ionicons
              name={confirmed ? 'checkbox' : 'square-outline'}
              size={22}
              color={confirmed ? colors.primary : colors.textTertiary}
            />
            <Text style={styles.checkLabel}>この内容で申告します</Text>
          </Pressable>

          <PrimaryCTA
            label={submitting ? '送信中...' : 'この内容で申告する'}
            onPress={handleSubmit}
            disabled={!canSubmit}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
    gap: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  invalidText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  lead: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  categoryPillSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.tagAccentBg,
  },
  categoryPillPressed: {
    opacity: 0.7,
  },
  categoryPillText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  categoryPillTextSelected: {
    color: colors.tagAccentText,
    fontWeight: fontWeight.bold,
  },
  noteInput: {
    minHeight: 110,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'right',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  checkLabel: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
})
