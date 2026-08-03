// components/venue/VenueComposerScreen.tsx
//
// 会場フォーム (出品 / Hold申請) の共通シェル。
// 旧: app/venue/[id].tsx の 2 つの RN Modal (固定75% / maxHeight90%) を撤去し、
//     フル画面ルート (app/venue/post.tsx, app/venue/hold.tsx) の共通レイアウトに統一。
//
// 構成: SafeAreaView → 画面内 ScreenHeader (← 戻る + タイトル) →
//       KeyboardAvoidingView → ScrollView (フォーム本体、MSA 候補が直下展開できる縦の余地) →
//       sticky bottom CTA (ScrollView の外に固定、候補展開で押し下げられない)。
//
// CTA は既存 PrimaryCTA (コーラル、controlled) を流用。コーラルは CTA とタグのみ (UI は器)。
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import {
  KeyboardAwareScrollProvider,
  useKeyboardAwareScroll,
} from '@/components/KeyboardAwareScroll'
import { colors, spacing } from '@/constants/theme'
import { LinearGradient } from 'expo-linear-gradient'
import React from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

// 段階3-C: 会場フォームの上部を紫トーンに沈め「会場の世界の続き」であることを示す。
// 深いステージ紫ではなく淡いトーン (入力=白の器/写真主役を邪魔しない)。
const VENUE_FORM_GRADIENT = ['#EDE4FA', '#F6F0FA', colors.background] as const
const VENUE_FORM_LOCATIONS = [0, 0.28, 0.6] as const

type VenueComposerScreenProps = {
  title: string
  children: React.ReactNode
  ctaLabel: string
  onSubmit: () => void
  submitting?: boolean
  submitDisabled?: boolean
}

export function VenueComposerScreen({
  title,
  children,
  ctaLabel,
  onSubmit,
  submitting = false,
  submitDisabled = false,
}: VenueComposerScreenProps) {
  const insets = useSafeAreaInsets()
  // ③修正: MSA 候補がキーボードに隠れる問題対策。single-page.tsx と同型で
  //   ScrollView に scrollRef/onScroll を配線し、ensureVisible を Provider で下流の
  //   MultiSelectAutocomplete へ供給する (候補出現時に入力欄を可視域上部へ寄せる)。
  const { scrollRef, onScroll, ensureVisible } = useKeyboardAwareScroll()

  return (
    <View style={styles.root}>
      {/* 段階3-C: 上部を淡い紫に沈める世界観レイヤー。下方は app 背景に馴染ませる。 */}
      <LinearGradient
        colors={[...VENUE_FORM_GRADIENT]}
        locations={[...VENUE_FORM_LOCATIONS]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safeTransparent} edges={['top']}>
      <ScreenHeader title={title} transparent />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <KeyboardAwareScrollProvider value={ensureVisible}>
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        </KeyboardAwareScrollProvider>

        {/* sticky bottom CTA: ScrollView の兄弟として最下部に固定。 */}
        <View
          style={[
            styles.ctaBar,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}
        >
          <PrimaryCTA
            label={ctaLabel}
            onPress={onSubmit}
            loading={submitting}
            disabled={submitDisabled}
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  safeTransparent: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  ctaBar: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
})
