// components/SubmitFab.tsx
//
// 「＋ 出品」用 Floating Action Button。
//
// 確定タブ構成 (案 E5 改) に伴い、出品は下部タブから外して右下 FAB に移動。
// 5 タブ均等配置 (ホーム / 検索 / 求リスト / 取引 / 会場) を維持し、
// 出品は「作成アクション」として独立した CTA を持つ。
//
// 配置:
//   - 下部タブ (CustomTabBar) の上に absolute で overlay
//   - right: spacing.base、bottom: tab bar 高さ + safe area + 余白
//   - すべてのタブ画面で表示。Stack push された画面 (取引詳細 / 会場詳細 / DM 等) では
//     (tabs) layout の外に出るため自動で非表示
//
// 遷移先:
//   - 通常: /listing/new/image (既存の出品作成 6 ステップの 1 ステップ目)
//   - 将来: 会場詳細画面の FAB は別途 `＋ この会場で出す` で会場出品 modal を呼ぶ予定
//     (本 PR では venue/[id] への FAB 配置は見送り、別 PR で対応)

import { colors, fontSize, fontWeight, radius, shadow, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TAB_BAR_HEIGHT = 72

export function SubmitFab() {
  const insets = useSafeAreaInsets()

  return (
    <Pressable
      onPress={() => router.push('/listing/new/image' as never)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="出品を作成"
      style={({ pressed }) => [
        styles.fab,
        {
          // 下部タブの上に余白 16px を置く。safe area inset.bottom はタブバー側で
          // padding として吸収されているため、ここでは TAB_BAR_HEIGHT + insets.bottom を足す。
          bottom: insets.bottom + TAB_BAR_HEIGHT + spacing.base,
        },
        pressed && styles.fabPressed,
      ]}
    >
      <Ionicons name="add" size={22} color={colors.textInverse} />
      <Text style={styles.label}>出品</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    ...shadow.lg,
  },
  fabPressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
})
