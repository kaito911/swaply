// app/(auth)/signup.tsx
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { signUp } from '@/lib/auth'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
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
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SignUpScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  // β1 D-1: 利用規約・プライバシーポリシー同意。未チェックでアカウント作成不可。
  // canSubmit (email/password 完備判定) からは意図的に外している。
  // 理由: 入力途中の dim 表現は維持しつつ、未チェックで押した場合は明示 Alert で
  //       「規約同意が必要」と教える方が初見ユーザーに伝わるため。
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  // β1 D-3: 13 歳以上の年齢確認。利用規約第 3 条 5 項で 13 歳未満不可と定めているため、
  // signup 段階で当該年齢の自己申告を取る。D-1 と同じ理由 (Alert で教える) で
  // canSubmit には含めない。state は D-1 とは独立 (利用規約同意と年齢確認は別概念)。
  const [confirmedAge, setConfirmedAge] = useState(false)

  const canSubmit = email.trim().length > 0 && password.length >= 6

  const handleSignUp = async () => {
    if (!canSubmit) return
    if (!agreedToTerms) {
      Alert.alert(
        '同意が必要です',
        '利用規約とプライバシーポリシーをご確認のうえ、同意にチェックを入れてください。'
      )
      return
    }
    if (!confirmedAge) {
      Alert.alert(
        '年齢確認が必要です',
        'Swaplyは13歳以上の方を対象としています。13歳以上であることを確認してください。'
      )
      return
    }
    setLoading(true)
    const { error } = await signUp(email.trim(), password)
    setLoading(false)
    if (error != null) {
      Alert.alert('登録エラー', error)
      return
    }
    Alert.alert(
      '確認メールを送信しました',
      'メールに届いたリンクをタップして認証を完了してください。',
      [
        {
          text: 'ログイン画面へ',
          onPress: () => router.replace('/(auth)/login' as never),
        },
      ]
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ─ ヘッダー ─ */}
          <View style={styles.headerWrap}>
            <View style={[styles.logoMark, { backgroundColor: colors.primary }]}>
              <Text style={styles.logoMarkText}>S</Text>
            </View>
            <Text style={styles.logoText}>Swaply</Text>
            <Text style={styles.tagline}>交換を、もっとスムーズに。</Text>
          </View>

          {/* ─ フォーム ─ */}
          <View style={styles.form}>
            <View style={styles.formTitleWrap}>
              <Text style={styles.formTitle}>新規登録</Text>
              <Text style={styles.formSub}>
                アカウントを作成して交換を始めよう
              </Text>
            </View>

            {/* メールアドレス */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>メールアドレス</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="example@email.com"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* パスワード */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>パスワード</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="6文字以上"
                  placeholderTextColor={colors.textTertiary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
              {password.length > 0 && password.length < 6 && (
                <Text style={styles.passwordHint}>6文字以上で入力してください</Text>
              )}
            </View>

            {/* 仕組みの説明 */}
            <View style={styles.safetyNote}>
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={colors.primary}
              />
              <Text style={styles.safetyText}>
                交換成立後まで住所・電話番号は相手に表示されません
              </Text>
            </View>

            {/* β1 D-1: 利用規約 / プライバシーポリシー同意導線 */}
            <View style={styles.consentRow}>
              <Pressable
                onPress={() => setAgreedToTerms((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.consentCheckbox}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreedToTerms }}
                accessibilityLabel="利用規約とプライバシーポリシーに同意"
              >
                <Ionicons
                  name={agreedToTerms ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={agreedToTerms ? colors.primary : colors.textTertiary}
                />
              </Pressable>
              <Text style={styles.consentText}>
                <Text
                  style={styles.consentLink}
                  onPress={() => router.push('/legal/terms' as never)}
                >
                  利用規約
                </Text>
                <Text>と</Text>
                <Text
                  style={styles.consentLink}
                  onPress={() => router.push('/legal/privacy' as never)}
                >
                  プライバシーポリシー
                </Text>
                <Text>に同意します</Text>
              </Text>
            </View>

            {/* β1 D-3: 年齢確認 (13 歳以上) */}
            <View style={styles.consentRow}>
              <Pressable
                onPress={() => setConfirmedAge((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.consentCheckbox}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: confirmedAge }}
                accessibilityLabel="13歳以上であることを確認"
              >
                <Ionicons
                  name={confirmedAge ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={confirmedAge ? colors.primary : colors.textTertiary}
                />
              </Pressable>
              <Text style={styles.consentText}>私は13歳以上です</Text>
            </View>

            {/* 登録CTA — handleSignUp (認証 + 規約同意 + 年齢確認 ロジック) は変更せず、
                見た目のみ巻取り。disabled は canSubmit ベースのまま、規約/年齢の検査は
                handleSignUp 内の Alert で従来通り表示される。 */}
            <PrimaryCTA
              label="アカウントを作成する"
              onPress={handleSignUp}
              loading={loading}
              disabled={!canSubmit}
              size="lg"
              style={{ marginTop: spacing.sm }}
            />

            {/* ログインへ */}
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>すでにアカウントをお持ちの方は</Text>
              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login' as never)}
              >
                <Text style={styles.switchLink}>ログイン</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  headerWrap: {
    alignItems: 'center',
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoMarkText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  logoText: {
    fontSize: fontSize.hero,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  form: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    gap: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
  },
  formTitleWrap: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  formTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  formSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  fieldWrap: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  inputIcon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    padding: 0,
    margin: 0,
  },
  passwordHint: {
    fontSize: fontSize.xs,
    color: colors.error,
  },
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  safetyText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  // β1 D-1: 同意行 (CTA 直前)
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  consentCheckbox: {
    paddingTop: 1,
  },
  consentText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  consentLink: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  switchText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  switchLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '700',
  },
})