// app/onboarding.tsx
// 初回ログイン時のみ表示されるオンボーディング。
// 構成: ようこそ (簡素) → 表示名 (handle) → Swaplyの約束 (promise) → ホーム。
// 完了フラグを AsyncStorage に保存し、以降はスキップされる。
import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { OshiPicker } from '@/components/OshiPicker'
import { useAuthContext } from '@/providers/AuthProvider'
import { checkHandleAvailable, updateProfile } from '@/lib/supabase'

export const ONBOARDING_DONE_KEY = 'onboarding_done'

export async function resetOnboardingForDebug(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_DONE_KEY)
}

type Step = 'welcome' | 'handle' | 'oshi' | 'promise'

type Props = {
  onComplete: () => void
}

export default function OnboardingScreen({ onComplete }: Props) {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [step, setStep] = useState<Step>('welcome')
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
      setStep('oshi')
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

  // ── STEP 1: ようこそ (簡素な挨拶のみ・書き込みなし) ──────────────
  if (step === 'welcome') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <View style={styles.heroArea}>
            {/* ブランドロゴ (2シンボル + ワードマーク) に統合。挨拶コピーは残す。 */}
            <Image
              source={require('../assets/images/splash-icon.png')}
              style={styles.logo}
              resizeMode="contain"
              accessible
              accessibilityRole="image"
              accessibilityLabel="Swaply"
            />
            <Text style={styles.welcomeGreeting}>ようこそ、Swaplyへ。</Text>
          </View>

          <PrimaryCTA label="はじめる" onPress={() => setStep('handle')} size="lg" />
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP 2: 表示名入力 (profiles.handle・必須) ──────────────
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

          {handleError != null && <Text style={styles.errorText}>{handleError}</Text>}

          <PrimaryCTA
            label="次へ"
            onPress={handleHandleSubmit}
            loading={checkingHandle}
            disabled={handle.trim().length < 3}
            size="lg"
          />

          {/* 名前入力の邪魔をしない位置に、使い方の在り処を一行案内 */}
          <Text style={styles.guideHint}>
            使い方や機能は、マイページの「Swaplyの使い方」でいつでも確認できます。
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP 3: 推し登録 (任意)。1件登録で次へ / 「あとで設定する」でスキップ ──────────────
  //   選択UI・保存・キーボード被り対策は共有 <OshiPicker> を再利用 (推し編集画面と同一)。
  if (step === 'oshi') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.oshiContainer}>
          <View style={styles.oshiHeaderPad}>
            <View style={styles.wantsHeader}>
              <Text style={styles.wantsTitle}>推しを登録しますか？</Text>
              <Text style={styles.wantsSub}>
                登録すると、あなたの推しの出品がホームにまとまって表示されます。あとからでも設定できます。
              </Text>
            </View>
          </View>

          <OshiPicker
            userId={userId}
            initiallyOpen
            showCollapseToggle={false}
            submitLabel="登録して次へ"
            onAdded={() => setStep('promise')}
          />

          <View style={styles.oshiHeaderPad}>
            <Pressable
              style={styles.skipButton}
              onPress={() => setStep('promise')}
              accessibilityRole="button"
              accessibilityLabel="あとで設定する"
            >
              <Text style={styles.skipButtonText}>あとで設定する</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP 4: Swaplyの約束 (世界観のみ・案内やリンクは入れない) ──────────────
  return <PromiseStep onStart={handleComplete} />
}

// 約束ページ: 文面ブロックを上から順に薄字→濃字でフェードインさせる。
const PROMISE_BLOCKS: string[] = [
  'はじめる前に、ひとつだけ。',
  '推し活グッズを、手数料0円で交換できる。\nそれが、Swaplyのいちばんの約束です。',
  'そしてSwaplyは、まだまだ進化の途中。\n匿名配送など、推し活に大切な機能も、\nこれから搭載を目指していきます。',
  '完璧じゃないけど、\n皆さんと一緒に、もっと良くしていく。\nそんなアプリです。',
  'これから、よろしくお願いします。',
]

export function PromiseStep({ onStart }: { onStart: () => void }) {
  const [starting, setStarting] = useState(false)
  // 各ブロック + CTA 用の opacity。0(薄=透明) → 1(濃=不透明) へ順次フェード。
  const opacities = useRef(
    [...PROMISE_BLOCKS, 'cta'].map(() => new Animated.Value(0)),
  ).current

  useEffect(() => {
    const animations = opacities.map((v) =>
      Animated.timing(v, { toValue: 1, duration: 600, useNativeDriver: true }),
    )
    Animated.stagger(260, animations).start()
  }, [opacities])

  const handlePress = () => {
    if (starting) return
    setStarting(true)
    void onStart()
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.promiseContainer}>
        <View style={styles.promiseTextArea}>
          {PROMISE_BLOCKS.map((block, i) => (
            <Animated.Text
              key={i}
              style={[styles.promiseText, { opacity: opacities[i] }]}
            >
              {block}
            </Animated.Text>
          ))}
        </View>

        <Animated.View style={{ opacity: opacities[opacities.length - 1] }}>
          <PrimaryCTA
            label="Swaplyを始める"
            onPress={handlePress}
            loading={starting}
            size="lg"
          />
        </Animated.View>
      </View>
    </SafeAreaView>
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
  // ブランドロゴ画像 (hero)。864:254 の実数指定 (h60 → w204)。
  //   ★aspectRatio は幅主軸に解決され巨大化するため width/height を実数指定。
  logo: {
    width: 204,
    height: 60,
    marginBottom: spacing.sm,
  },
  welcomeGreeting: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  // 推し登録ステップ: ヘッダー(固定) + OshiPicker(flex:1 スクロール) + スキップ(固定) の縦積み。
  oshiContainer: {
    flex: 1,
    paddingTop: spacing.xl,
  },
  oshiHeaderPad: {
    paddingHorizontal: spacing.base,
  },
  skipButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  skipButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textTertiary,
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
  wantsInputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: -8,
    marginBottom: 8,
  },
  guideHint: {
    marginTop: spacing.lg,
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  // ── 約束ページ ──
  promiseContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
    justifyContent: 'center',
  },
  promiseTextArea: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  promiseText: {
    fontSize: fontSize.lg,
    lineHeight: 30,
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: fontWeight.medium,
  },
})
