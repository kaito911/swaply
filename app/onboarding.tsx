// app/onboarding.tsx
// 初回ログイン時のみ表示されるオンボーディング画面
// 完了フラグを AsyncStorage に保存し、以降はスキップされる
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuthContext } from '@/providers/AuthProvider'
import { addWantedCard, checkHandleAvailable, updateProfile } from '@/lib/supabase'

export const ONBOARDING_DONE_KEY = 'onboarding_done'

export async function resetOnboardingForDebug(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_DONE_KEY)
}

type Step = 'welcome' | 'handle' | 'wants'

type Props = {
  onComplete: () => void
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [step, setStep] = useState<Step>('welcome')
  const [cardName, setCardName] = useState('')
  const [saving, setSaving] = useState(false)
  const [handle, setHandle] = useState('')
  const [handleError, setHandleError] = useState<string | null>(null)
  const [checkingHandle, setCheckingHandle] = useState(false)
  const handleHandleSubmit = async () => {
    const trimmed = handle.trim()
    if (trimmed.length < 3) {
      setHandleError('3文字以上で入力してください')
      return
    }
    if (userId == null) return

    try {
      setCheckingHandle(true)
      setHandleError(null)
      const available = await checkHandleAvailable(trimmed)
      if (!available) {
        setHandleError('この表示名はすでに使われています')
        return
      }
      await updateProfile({ userId, handle: trimmed, displayName: null })
      setStep('wants')
    } catch (error) {
      console.error('[Onboarding] handleHandleSubmit', error)
      setHandleError('エラーが発生しました。もう一度お試しください。')
    } finally {
      setCheckingHandle(false)
    }
  }

  const handleComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, 'true')
    onComplete()
  }

  const handleWantsSubmit = async () => {
    const trimmed = cardName.trim()
    if (trimmed === '' || userId == null) {
      await handleComplete()
      return
    }

    try {
      setSaving(true)
      await addWantedCard({
        userId,
        cardName: trimmed,
        groupName: null,
        memberName: null,
        series: null,
      })
    } catch (error) {
      // 登録失敗してもオンボーディングは完了させる
      console.error('[Onboarding] addWantedCard failed', error)
    } finally {
      setSaving(false)
      await handleComplete()
    }
  }

  // ── STEP 1: ようこそ ──────────────────────
  if (step === 'welcome') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <View style={styles.heroArea}>
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

          <View style={styles.featureList}>
            <FeatureRow
              icon="shield-checkmark-outline"
              text="事実ベースのTrustで相手を判断できる"
            />
            <FeatureRow
              icon="swap-horizontal-outline"
              text="交換成立後に住所が開示される安全設計"
            />
            <FeatureRow
              icon="trending-up-outline"
              text="成立しやすい交換候補を自動で表示"
            />
          </View>

          <Pressable
            style={styles.primaryButton}
            onPress={() => setStep('handle')}
          >
            <Text style={styles.primaryButtonText}>はじめる</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP 2: 表示名入力 ──────────────
  if (step === 'handle') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <View style={styles.wantsHeader}>
            <Text style={styles.wantsTitle}>表示名を決めてください</Text>
            <Text style={styles.wantsSub}>
              取引や提案で表示される名前です（3文字以上）。あとから変更可能です。
            </Text>
          </View>

          <TextInput
            style={[styles.wantsInput, handleError != null && styles.wantsInputError]}
            placeholder="例：kaito_swaply"
            value={handle}
            onChangeText={(v) => {
              setHandle(v)
              setHandleError(null)
            }}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
          />

          {handleError != null && (
            <Text style={styles.errorText}>{handleError}</Text>
          )}

          <Pressable
            style={[
              styles.primaryButton,
              (handle.trim().length < 3 || checkingHandle) && styles.buttonDisabled,
            ]}
            onPress={handleHandleSubmit}
            disabled={handle.trim().length < 3 || checkingHandle}
          >
            {checkingHandle ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>次へ</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP 3: ほしいカード登録 ──────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.wantsHeader}>
          <Text style={styles.wantsTitle}>ほしいカードはありますか？</Text>
          <Text style={styles.wantsSub}>
            登録すると成立しやすい交換候補に優先表示されます。あとから追加もできます。
          </Text>
        </View>

        <TextInput
          style={styles.wantsInput}
          placeholder="例：ジュンギュ トレカ"
          value={cardName}
          onChangeText={setCardName}
          autoCorrect={false}
          autoFocus
        />

        <Pressable
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handleWantsSubmit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {cardName.trim() !== '' ? '登録してはじめる' : 'スキップ'}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.skipButton}
          onPress={handleComplete}
          disabled={saving}
        >
          <Text style={styles.skipText}>スキップ</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Ionicons name={icon as never} size={20} color={colors.primary} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
    justifyContent: 'center',
  },
  heroArea: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
    gap: spacing.sm,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoMarkText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  logoText: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  featureList: {
    gap: spacing.md,
    marginBottom: spacing['3xl'],
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  primaryButton: {
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  wantsHeader: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  wantsTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  wantsSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  wantsInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundCard,
    marginBottom: spacing.base,
  },
  skipButton: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  skipText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  wantsInputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: -8,
    marginBottom: 8,
  },
})
