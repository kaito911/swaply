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
import { createReport, type ReportTargetType } from '@/lib/supabase'
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

const REPORT_REASONS: readonly string[] = [
  '不適切な内容',
  '権利侵害の可能性',
  '交換条件が不明確',
  '迷惑行為の可能性',
  'その他',
]

const MAX_DETAIL_LENGTH = 1000

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

  const [reason, setReason] = useState<string | null>(null)
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = reason != null && targetId !== '' && !submitting

  const handleSubmit = () => {
    if (!canSubmit || reason == null) return

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
              await createReport({
                targetType,
                targetId,
                reason,
                detail: detail.trim() !== '' ? detail.trim() : null,
              })
              Alert.alert(
                '通報を受け付けました',
                'ご協力ありがとうございます。お送りいただいた内容は運営が確認します。',
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
              const message =
                err instanceof Error && err.message === 'AUTH_REQUIRED'
                  ? 'ログインが必要です。再ログインしてからお試しください。'
                  : '通報の送信に失敗しました。時間をおいてもう一度お試しください。'
              Alert.alert('送信エラー', message)
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
            {REPORT_REASONS.map((r) => {
              const selected = reason === r
              return (
                <Pressable
                  key={r}
                  onPress={() => setReason(r)}
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
                    {r}
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
        </ScrollView>

        <View style={styles.ctaWrap}>
          <PrimaryCTA
            label="送信する"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
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
