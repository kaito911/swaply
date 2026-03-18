import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
    Alert,
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

      router.replace('/(tabs)')
    } catch (error) {
      console.error('[LoginScreen][handleLogin]', error)

      const message =
        error instanceof Error
          ? error.message
          : 'ログインに失敗しました'

      Alert.alert('ログインエラー', message)
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
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={styles.logoMark}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.logoMarkText}>S</Text>
            </LinearGradient>

            <Text style={styles.logoText}>Swaply</Text>
            <Text style={styles.tagline}>交換を、もっと安全に。</Text>
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

            <TouchableOpacity
              onPress={handleLogin}
              disabled={!canSubmit || loading}
              activeOpacity={0.85}
              style={[
                styles.ctaWrap,
                (!canSubmit || loading) && styles.ctaDisabled,
              ]}
            >
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                style={styles.cta}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.ctaText}>
                  {loading ? 'ログイン中...' : 'ログインする'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

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
  ctaWrap: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginTop: spacing.sm,
    ...shadow.md,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  cta: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
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