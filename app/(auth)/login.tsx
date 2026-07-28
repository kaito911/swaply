import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const canSubmit = email.trim().length > 0 && password.length >= 6

  // 未認証(email_not_confirmed)時の確認メール再送。supabase.auth.resend(type:'signup')。
  const handleResendConfirmation = async () => {
    const target = email.trim()
    if (target === '') return
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: target })
      if (error) throw error
      Alert.alert(
        '確認メールを再送しました',
        `${target} 宛に確認メールを再送しました。メール内のリンクをタップして認証を完了してください。`,
      )
    } catch (err) {
      console.error('[LoginScreen][handleResendConfirmation]', err)
      Alert.alert('再送に失敗しました', '時間をおいて、もう一度お試しください。')
    }
  }

  const handleLogin = async () => {
    if (!canSubmit || loading) return

    try {
      setLoading(true)

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        throw error
      }

      // ログイン成功後は _layout.tsx の session 監視が自動でルーティングする
      // router.replace は不要（onboardingDone チェックを経由させるため）
    } catch (error) {
      const message =
        error instanceof Error ? error.message : ''
      const code =
        typeof error === 'object' && error != null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : ''
      // 未認証(メール確認未完了)。code='email_not_confirmed' / message 'Email not confirmed'。
      const emailUnconfirmed =
        code === 'email_not_confirmed' ||
        message.toLowerCase().includes('not confirmed')

      if (emailUnconfirmed) {
        Alert.alert(
          'メール認証がまだ完了していません',
          '登録時にお送りしたメールのリンクをタップして認証を完了してください。迷惑メールフォルダもご確認ください。',
          [
            { text: '閉じる', style: 'cancel' },
            {
              text: '確認メールを再送する',
              onPress: () => void handleResendConfirmation(),
            },
          ],
        )
      } else if (message.includes('Invalid login credentials')) {
        Alert.alert('ログインエラー', 'メールアドレスまたはパスワードが違います')
      } else {
        console.error('[LoginScreen][handleLogin]', error)
        Alert.alert('ログインエラー', message || 'ログインに失敗しました')
      }
    } finally {
      setLoading(false)
    }
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
          <View style={styles.logoWrap}>
            {/* ブランドロゴ (2シンボル + ワードマーク)。旧「角丸S マーク + Swaply」を
                1枚のロゴ画像に統合。サブコピーは残す。読み上げ用に accessibilityLabel 明示。 */}
            <Image
              source={require('../../assets/images/splash-icon.png')}
              style={styles.logo}
              resizeMode="contain"
              accessible
              accessibilityRole="image"
              accessibilityLabel="Swaply"
            />
            <Text style={styles.tagline}>交換を、もっとスムーズに。</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>ログイン</Text>

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
            </View>

            <PrimaryCTA
              label="ログインする"
              onPress={handleLogin}
              loading={loading}
              disabled={!canSubmit}
              size="lg"
              style={{ marginTop: spacing.sm }}
            />
            {/* 認証ロジック (handleLogin) は触らず、ボタン見た目のみ巻取り。
                旧 52h + 自前 shadow → lg=56h + PrimaryCTA 内蔵 color shadow。
                ローディング中のテキスト切替 "ログイン中..." は spinner 表示に統一。 */}

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>アカウントをお持ちでない方は</Text>
              <TouchableOpacity
                onPress={() => router.replace('/(auth)/signup' as never)}
              >
                <Text style={styles.switchLink}>新規登録</Text>
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
  logoWrap: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  // ブランドロゴ画像 (hero)。高さ 56px 基準、幅は aspectRatio 864:254 で自動 (≈190px)。
  //   旧マーク 64px と同等の hero 存在感を横長ワードマークで確保。
  logo: {
    height: 56,
    aspectRatio: 864 / 254,
    marginBottom: spacing.sm,
  },
  tagline: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    fontWeight: '400',
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
  formTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
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