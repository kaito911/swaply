// components/EmptyHomeState.tsx
//
// 自分の公開出品が 0 件のとき、ホームのレーン群の最上部に出す出品誘導カード。
//   ★全画面の空表示ではなく、他レーン (成立しやすい交換 / すべての交換) と同居する compact な
//     カードにする (home.tsx が ownActiveCount===0 のとき最上部に描画する)。
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { router } from 'expo-router'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

export function EmptyHomeState() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.main}>あなたの出品はまだありません</Text>
      <Text style={styles.sub}>交換は、あなたが1件出すところから始まります</Text>
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
  // compact カード (レーンより上に同居)。
  wrap: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  main: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  sub: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  ctaWrap: {
    width: '100%',
    marginTop: spacing.xs,
  },
})
