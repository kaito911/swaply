// app/report.tsx
// 通報フォーム画面 (Phase 0 PR-B)
//
// 用途:
//   - 出品 (card) およびユーザー (user) への通報を受け付ける
//   - 理由選択 (5 種) + 自由記述 (任意) を入力、createReport で reports テーブルに保存
//
// 設計方針:
//   - 過剰に怖い / 断定的表現を避け、運営が確認する旨を中立的に伝える
//   - 「ご協力ありがとうございます」等のトーンで送信後の安心感を提供
//   - 未ログイン時は createReport が AUTH_REQUIRED を throw、Alert で案内
//   - reason 未選択時は送信ボタン disabled (空送信防止)
//   - 送信中は重複送信防止のため CTA disabled + 起動中ローダー
//
// 受け取る params:
//   targetType: 'card' | 'user'
//   targetId: uuid
//   targetLabel: 表示用ラベル (任意、出品名やユーザー名)

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import {
  createContentReport,
  type ContentReportCategory,
  type ReportTargetType,
} from '@/lib/supabase'
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

// content_reports の構造化カテゴリを対象別に出し分ける (card6 / user5、other 共有)。
const CATEGORY_LABELS: Record<ContentReportCategory, string> = {
  prohibited_item: '禁止・違法な出品',
  counterfeit: '偽物・権利侵害',
  inappropriate_image: '不適切な画像',
  spam: 'スパム・宣伝',
  miscategorized: '内容と違う（誤カテゴリ）',
  harassment: '嫌がらせ・迷惑行為',
  monetary_demand: '金銭を要求された',
  impersonation: 'なりすまし',
  inappropriate_profile: '不適切なプロフィール',
  other: 'その他',
}

const CARD_CATEGORIES: ContentReportCategory[] = [
  'prohibited_item',
  'counterfeit',
  'inappropriate_image',
  'spam',
  'miscategorized',
  'other',
]

const USER_CATEGORIES: ContentReportCategory[] = [
  'harassment',
  'monetary_demand',
  'impersonation',
  'inappropriate_profile',
  'other',
]

const MAX_DETAIL_LENGTH = 1000

// RPC の raise exception 文字列 → ユーザー向け日本語。
function messageForError(raw: string): string {
  switch (raw) {
    case 'ALREADY_REPORTED':
      return 'この対象にはすでに通報済みです。'
    case 'TARGET_NOT_FOUND':
      return '対象が見つかりませんでした。前の画面に戻ってお試しください。'
    case 'SELF_REPORT_NOT_ALLOWED':
      return '自分自身は通報できません。'
    case 'AUTH_REQUIRED':
      return 'ログインが必要です。再ログインしてからお試しください。'
    case 'INVALID_CATEGORY':
    case 'TARGET_REF_INVALID':
      return '通報内容が正しくありません。前の画面に戻ってお試しください。'
    default:
      return '通報の送信に失敗しました。時間をおいてもう一度お試しください。'
  }
}

function isValidTargetType(value: string | undefined): value is ReportTargetType {
  return value === 'card' || value === 'user'
}

export default function ReportScreen() {
  const params = useLocalSearchParams<{
    targetType?: string
    targetId?: string
    targetLabel?: string
  }>()

  const targetType: ReportTargetType = isValidTargetType(params.targetType)
    ? params.targetType
    : 'card'
  const targetId = params.targetId ?? ''
  const targetLabel = params.targetLabel ?? ''

  const categories = targetType === 'user' ? USER_CATEGORIES : CARD_CATEGORIES

  const [category, setCategory] = useState<ContentReportCategory | null>(null)
  const [detail, setDetail] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = category != null && confirmed && targetId !== '' && !submitting

  const handleSubmit = () => {
    if (!canSubmit || category == null) return

    Alert.alert(
      '通報を送信しますか?',
      'お送りいただいた内容は運営が確認します。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '送信する',
          style: 'default',
          onPress: async () => {
            try {
              setSubmitting(true)
              await createContentReport({
                cardId: targetType === 'card' ? targetId : null,
                userId: targetType === 'user' ? targetId : null,
                category,
                note: detail.trim() !== '' ? detail.trim() : null,
              })
              Alert.alert(
                '通報を受け付けました',
                'ご協力ありがとうございます。お送りいただいた内容は運営が確認します。相手や第三者には公開されません。',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      if (router.canGoBack()) {
                        router.back()
                      }
                    },
                  },
                ],
              )
            } catch (err) {
              console.error('[ReportScreen][handleSubmit]', err)
              const raw = err instanceof Error ? err.message : ''
              Alert.alert('送信エラー', messageForError(raw))
            } finally {
              setSubmitting(false)
            }
          },
        },
      ],
    )
  }

  // targetId が空のときは入口の遷移が壊れている。アクセス即エラー表示。
  if (targetId === '') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="通報" />
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>
            通報対象が指定されていません。前の画面に戻ってもう一度お試しください。
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="通報" />
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
          <View style={styles.intro}>
            <Text style={styles.introTitle}>気になる内容があれば運営にお知らせください</Text>
            <Text style={styles.introBody}>
              お送りいただいた内容は運営が確認します。返信が必要な場合は別途お問い合わせ窓口をご利用ください。
            </Text>
          </View>

          {/* 通報対象 */}
          <View style={styles.targetBox}>
            <Text style={styles.targetLabel}>通報対象</Text>
            <Text style={styles.targetTypeText}>
              {targetType === 'card' ? '出品' : 'ユーザー'}
            </Text>
            {targetLabel !== '' && (
              <Text style={styles.targetName} numberOfLines={2}>
                {targetLabel}
              </Text>
            )}
          </View>

          {/* 理由選択 */}
          <Text style={styles.sectionLabel}>
            理由を選択してください<Text style={styles.required}> *</Text>
          </Text>
          <View style={styles.reasonList}>
            {categories.map((c) => {
              const selected = category === c
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={({ pressed }) => [
                    styles.reasonRow,
                    selected && styles.reasonRowSelected,
                    pressed && styles.reasonRowPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.radio,
                      selected && styles.radioSelected,
                    ]}
                  >
                    {selected && <View style={styles.radioInner} />}
                  </View>
                  <Text
                    style={[
                      styles.reasonLabel,
                      selected && styles.reasonLabelSelected,
                    ]}
                  >
                    {CATEGORY_LABELS[c]}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* 自由記述 */}
          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
            詳細<Text style={styles.optional}>（任意）</Text>
          </Text>
          <Text style={styles.sectionHint}>
            具体的な状況があれば記入してください ({detail.length}/{MAX_DETAIL_LENGTH})
          </Text>
          <TextInput
            style={styles.textArea}
            value={detail}
            onChangeText={(v) =>
              setDetail(v.length > MAX_DETAIL_LENGTH ? v.slice(0, MAX_DETAIL_LENGTH) : v)
            }
            multiline
            textAlignVertical="top"
            placeholder="例: 説明と画像が一致していない、外部 EC サイトの画像を使っているように見える 等"
            placeholderTextColor={colors.textTertiary}
            maxLength={MAX_DETAIL_LENGTH}
          />

          <Text style={styles.footerNote}>
            通報者の情報は被通報者に開示されません。プライバシーポリシーをご確認ください。
          </Text>

          {/* 誤送信防止チェック */}
          <Pressable
            style={styles.checkRow}
            onPress={() => setConfirmed((v) => !v)}
          >
            <Ionicons
              name={confirmed ? 'checkbox' : 'square-outline'}
              size={22}
              color={confirmed ? colors.primary : colors.textTertiary}
            />
            <Text style={styles.checkLabel}>この内容で通報します</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.ctaWrap}>
          {/* わくわく化 STEP 1: 通報送信は destructive 寄りアクションのため
              solid coral ではなく outline (白地 + coral 枠線 + coral 文字) に分離。
              主 CTA との押し間違い防止 + ベタ塗り面積の削減。 */}
          <PrimaryCTA
            label="送信する"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            size="lg"
            variant="outline"
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
  safe: { flex: 1, backgroundColor: colors.background },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  intro: {
    marginBottom: spacing.lg,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    lineHeight: 22,
  },
  introBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  targetBox: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  targetLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textTertiary,
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  targetTypeText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  targetName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
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
  required: {
    color: colors.error,
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
  // 理由一覧
  reasonList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  reasonRowSelected: {
    backgroundColor: '#EEF2FF',
  },
  reasonRowPressed: {
    opacity: 0.7,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  reasonLabel: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  reasonLabelSelected: {
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  // 自由記述
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundCard,
    minHeight: 120,
  },
  footerNote: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    lineHeight: 17,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  checkLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
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
  // エラー表示
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
})
