// app/account-delete.tsx
// Phase 0 PR-D: アカウント削除画面 (modal presentation)
//
// 設計方針:
//   - マウント時に fetchActiveTradeCount を呼び、進行中取引の有無を判定
//   - 進行中ありの場合: 削除不可表示 + 取引一覧へのリンク (削除ボタン disabled)
//   - 進行中なしの場合: 注意事項表示 + 「削除」テキスト入力 + 二段 Alert 確認
//   - 削除成功時: signOut + login 画面遷移 + 完了 Alert
//
// 文言ポリシー (kaito 指示):
//   - 削除不可文言: 「進行中の取引を完了またはキャンセルしてから削除してください。」
//   - 削除成功文言: 「アカウントの削除を完了しました。ご利用ありがとうございました。」
//   - 「安全」「完全安心」「詐欺防止」「本物保証」「公式」「公認」「提携」一切使用せず

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import {
  deleteMyAccount,
  fetchActiveTradeCount,
  supabase,
} from '@/lib/supabase'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const CONFIRM_KEYWORD = '削除'

export default function AccountDeleteScreen() {
  const [activeTradeCount, setActiveTradeCount] = useState<number | null>(null)
  const [loadingTradeCount, setLoadingTradeCount] = useState(true)
  // A1: 取得失敗フラグ。fetchActiveTradeCount(内部 auth.getUser)が throw/reject しても
  //   永久スピナー(=退会不能・進行不能)にせず error+再試行を出す。
  const [loadFailed, setLoadFailed] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // マウント時に進行中取引数を取得
  const load = useCallback(() => {
    setLoadingTradeCount(true)
    setLoadFailed(false)
    fetchActiveTradeCount().then((count) => {
      setActiveTradeCount(count)
    }).catch((e) => {
      console.error('[account-delete][load]', e)
      setLoadFailed(true)
    }).finally(() => setLoadingTradeCount(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const canSubmit =
    activeTradeCount === 0 &&
    confirmText.trim() === CONFIRM_KEYWORD &&
    !submitting

  const handleSubmit = () => {
    if (!canSubmit) return

    Alert.alert(
      'アカウントを削除しますか?',
      'この操作は取り消せません。本当に削除する場合は「削除する」をタップしてください。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              setSubmitting(true)
              await deleteMyAccount()

              // 成功 → signOut + login 画面遷移
              try {
                await supabase.auth.signOut()
              } catch (signOutErr) {
                // signOut 失敗は無視 (auth.users は削除済)
                console.warn('[account-delete] signOut error', signOutErr)
              }

              Alert.alert(
                'アカウントの削除を完了しました',
                'ご利用ありがとうございました。',
                [
                  {
                    text: 'OK',
                    onPress: () => router.replace('/(auth)/login' as never),
                  },
                ],
              )
            } catch (err) {
              const code = err instanceof Error ? err.message : 'INTERNAL_ERROR'
              console.error('[account-delete] error', { code, err })
              let title = '削除に失敗しました'
              let message =
                '時間をおいてもう一度お試しください。問題が続く場合はお問い合わせください。'

              if (code === 'AUTH_REQUIRED') {
                title = 'ログインが必要です'
                message = '再ログインしてからお試しください。'
              } else if (code === 'ACTIVE_TRADE_EXISTS') {
                // マウント時の判定後に取引が発生したケース
                title = '削除できません'
                message = '進行中の取引を完了またはキャンセルしてから削除してください。'
                // 状態を更新して UI を「削除不可」に切り替える
                setActiveTradeCount((prev) => (prev != null ? prev + 1 : 1))
              } else if (code === 'AUTH_DELETE_FAILED') {
                title = '削除を完了できませんでした'
                message =
                  'プロフィールは匿名化されました。時間をおいてもう一度お試しください。'
              }

              Alert.alert(title, message)
            } finally {
              setSubmitting(false)
            }
          },
        },
      ],
    )
  }

  // ─────────────────────────────────────────
  // render
  // ─────────────────────────────────────────

  if (loadingTradeCount) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="アカウント削除" />
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    )
  }

  if (loadFailed) {
    // ★取得失敗: 永久スピナー(退会不能)にせず再試行を出す (home/wants と同手法)。
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="アカウント削除" />
        <View style={styles.centerWrap}>
          <Text style={styles.retryText}>読み込みに失敗しました</Text>
          <Pressable style={styles.retryButton} onPress={() => load()}>
            <Text style={styles.retryButtonText}>再試行</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const hasActiveTrade = activeTradeCount != null && activeTradeCount > 0

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="アカウント削除" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {hasActiveTrade ? (
          // ── 削除不可 (進行中取引あり) ──
          <>
            <View style={styles.blockBox}>
              <Text style={styles.blockTitle}>現在アカウントを削除できません</Text>
              <Text style={styles.blockBody}>
                進行中の取引を完了またはキャンセルしてから削除してください。
              </Text>
              <Text style={styles.blockCount}>
                進行中の取引: {activeTradeCount} 件
              </Text>
            </View>

            <Pressable
              style={styles.linkRow}
              onPress={() => router.push('/(tabs)/trades' as never)}
            >
              <Text style={styles.linkText}>取引中の一覧を見る</Text>
            </Pressable>
          </>
        ) : (
          // ── 削除可能 ──
          <>
            <Text style={styles.sectionTitle}>削除されるデータ</Text>
            <View style={styles.noteBox}>
              <Text style={styles.noteLine}>・プロフィール (ハンドル / 表示名 / アバター)</Text>
              <Text style={styles.noteLine}>・配送先情報 (氏名 / 住所)</Text>
              <Text style={styles.noteLine}>・出品中のグッズ (画像 / 説明 / 求情報)</Text>
              <Text style={styles.noteLine}>・いいね / 求リスト</Text>
              <Text style={styles.noteLine}>・棚 / 推し設定</Text>
              <Text style={styles.noteLine}>・ブロック設定 / 検索履歴</Text>
              <Text style={styles.noteLine}>・ログイン用アカウント情報</Text>
            </View>

            <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
              履歴として残るデータ
            </Text>
            <View style={styles.noteBox}>
              <Text style={styles.noteLine}>
                ・完了 / キャンセル / 問題報告済みの取引履歴
              </Text>
              <Text style={styles.noteLine}>
                ・あなたが過去に提出した通報内容 (通報者情報は匿名化)
              </Text>
              <Text style={styles.noteSubtle}>
                これらは取引相手の履歴整合性と運営対応のため、一定期間保持します
                (詳細はプライバシーポリシー参照)。
              </Text>
            </View>

            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                削除は取り消せません。復旧はできません。
              </Text>
            </View>

            <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
              削除を続ける場合
            </Text>
            <Text style={styles.hint}>
              下の入力欄に「{CONFIRM_KEYWORD}」と入力してください。
            </Text>
            <TextInput
              style={styles.input}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={CONFIRM_KEYWORD}
              placeholderTextColor={colors.textTertiary}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </>
        )}
      </ScrollView>

      {!hasActiveTrade && (
        <View style={styles.ctaWrap}>
          {/* わくわく化 STEP 1: アカウント削除は destructive アクションのため
              solid coral ではなく outline (白地 + coral 枠線 + coral 文字) に分離。
              主 CTA との押し間違い防止 + ベタ塗り面積の削減。 */}
          <PrimaryCTA
            label="アカウントを削除する"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            size="lg"
            variant="outline"
          />
        </View>
      )}
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A1: 読み込み失敗時の再試行UI (home/wants と同一トークン)。
  retryText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.base,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  retryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  // 削除不可 (進行中取引あり) box
  blockBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  blockBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  blockCount: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  linkRow: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  // section
  sectionTitle: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionTitleSpaced: {
    marginTop: spacing.lg,
  },
  noteBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    padding: spacing.md,
  },
  noteLine: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: 2,
  },
  noteSubtle: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    lineHeight: 17,
  },
  warnBox: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  warnText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundCard,
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
