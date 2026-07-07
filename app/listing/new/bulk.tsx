// app/listing/new/bulk.tsx
//
// 出品フロー刷新: 一括出品フロー (1枚の写真から複数出品)。
//   Phase 1 では「準備中」プレースホルダ。Phase 2 で本体 (タップ→バッジ→属性シート→N insert) を実装。
//
// β1 方針: 手動タップのみ・AI 検出なし・切り出しファイル生成なし・native 依存追加ゼロ。

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ListingNewBulkScreen() {
  const handleBack = () => {
    if (router.canGoBack()) router.back()
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="1枚から複数出品" />

      <View style={styles.center}>
        <Ionicons name="construct-outline" size={40} color={colors.textTertiary} />
        <Text style={styles.title}>準備中です</Text>
        <Text style={styles.body}>
          1枚の写真から複数のグッズをまとめて出品する機能は、現在準備中です。{'\n'}
          今は「1点だけ出品する」からご利用ください。
        </Text>
      </View>

      <View style={styles.ctaWrap}>
        <PrimaryCTA label="戻る" onPress={handleBack} size="lg" variant="outline" />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  body: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
})
