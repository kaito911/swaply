// components/EmptyHomeState.tsx
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, spacing } from '@/constants/theme'
import { router } from 'expo-router'
import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'

export function EmptyHomeState() {
  return (
    <View style={styles.wrap}>
      {/* ブランドロゴ画像に統合 (旧コーラル文字ロゴ)。読み上げ用 label 明示。 */}
      <Image
        source={require('../assets/images/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel="Swaply"
      />
      <Text style={styles.main}>まだ交換できるカードがありません</Text>
      <Text style={styles.sub}>
        {'このアプリは\n「出品」と「いいね」から\n交換が生まれます'}
      </Text>
      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label="カードを出品する"
          onPress={() => router.push('/listing/new/choose' as never)}
          size="lg"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['4xl'],
    paddingBottom: spacing['4xl'],
  },
  // ブランドロゴ画像。高さ 30px 基準 (旧 28pt 文字相当)、幅は aspectRatio 864:254 で自動。
  logo: {
    height: 30,
    aspectRatio: 864 / 254,
    marginBottom: spacing.lg,
  },
  main: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  sub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
  ctaWrap: {
    width: '100%',
    gap: spacing.sm,
  },
})
