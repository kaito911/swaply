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
import { colors, spacing } from '@/constants/theme'
import React from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={title} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>

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
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
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
