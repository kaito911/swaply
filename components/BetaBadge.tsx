// components/BetaBadge.tsx
// β 表示用の小バッジ。
//
// 用途: マイページ最上部に「Swaply β版」と表示し、初期 β 段階であることを明示。
// 過剰演出は避け、控えめなトーン (text + 細枠 + 薄背景)。
//
// 設計指針:
//   - 法的表示というより「期待値補正」目的 (Apple 審査でも beta 表記推奨)
//   - 1 行に収まる範囲で「Swaply β版」「現在 β 版として少人数で改善中です」を表示

import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

export function BetaBadge() {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.tag}>β</Text>
        <Text style={styles.title}>Swaply β版</Text>
      </View>
      <Text style={styles.note}>
        現在 β 版として少人数で改善中です。仕様変更や軽微な不具合が発生する可能性があります。
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  tag: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textInverse,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  title: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  note: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
})
