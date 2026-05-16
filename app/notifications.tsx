// app/notifications.tsx
// 通知一覧画面 (空表示 MVP)。
// 3.5a: ベル icon → push 動線確認用の空表示のみ。
// 3.5d: matcher v3 ヒット時の notification レコード生成 + データソース表示。
// Phase 1.5: 運営お知らせ等追加予定。

import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, spacing } from '@/constants/theme'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function NotificationsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="通知" />
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>通知はまだありません</Text>
        <Text style={styles.emptySub}>
          交換マッチや取引の進行があるとここに表示されます。
        </Text>
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
    paddingHorizontal: spacing.base,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  emptySub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
})
