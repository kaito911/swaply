// components/EmptyHomeState.tsx
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, spacing } from '@/constants/theme'
import { router } from 'expo-router'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

export function EmptyHomeState() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.logo}>Swaply</Text>
      <Text style={styles.main}>まだ交換できるカードがありません</Text>
      <Text style={styles.sub}>
        {'このアプリは\n「出品」と「いいね」から\n交換が生まれます'}
      </Text>
      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label="カードを出品する"
          onPress={() => router.push('/listing/new/image' as never)}
          size="lg"
        />
        <PrimaryCTA
          label="いいねを追加する"
          onPress={() => router.push('/wants' as never)}
          variant="ghost"
          size="lg"
          style={styles.subCta}
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
  logo: {
    fontSize: 28,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
    letterSpacing: -0.5,
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
  subCta: {
    marginTop: spacing.xs,
  },
})
