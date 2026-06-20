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
//   - 通常タブ画面では SubmitFab (デフォルト): /listing/new/image へ遷移、tab bar 上に配置
//   - 会場詳細画面では SubmitFab を hasTabBar={false} + label/onPress 上書きで再利用、
//     その会場の供給板に出品する form を開く動線として機能
//
// 文脈別の使い分け:
//   - 通常: ラベル '出品'、router.push('/listing/new/image')、hasTabBar=true (default)
//   - 会場: ラベル 'この会場で出す'、setLane('supply') + setShowPostForm(true)、hasTabBar=false
//     (会場詳細は (tabs) の外、Stack push された画面なので tab bar の overlap がない)

import { colors, fontSize, fontWeight, radius, shadow, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router, usePathname } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TAB_BAR_HEIGHT = 72

// 通常 FAB を非表示にするタブルート。
// - /venue-tab: 会場一覧。会場文脈に入っているのに通常出品 FAB が出ると、
//   ユーザーが「通常出品」か「会場出品」か迷う。会場詳細に入ってから
//   専用 FAB「＋ この会場で出す」が出る設計に揃える。
// - /trades: 取引一覧。新規出品アクションの優先度が低いため非表示。
//
// 注意: pathname は (tabs) group を strip した値が入る。
//       会場詳細画面 (Stack push、route '/venue/<id>') にはマッチしないので、
//       会場詳細用 FAB は本リストの影響を受けない。
const HIDDEN_GLOBAL_FAB_ROUTES: readonly string[] = ['/venue-tab', '/trades']

type SubmitFabProps = {
  /** ボタン上のラベル文字列。default: '出品' */
  label?: string
  /** タップ時の挙動。default: /listing/new/image へ遷移 */
  onPress?: () => void
  /**
   * 下部タブバーがある画面か (true なら tab bar の上に配置、false なら safe area 直上に配置)。
   * default: true (通常タブ画面)
   */
  hasTabBar?: boolean
  /** スクリーンリーダー用ラベル。default: '出品を作成' */
  accessibilityLabel?: string
  /**
   * 背景色の上書き。default: colors.primary (navy)。
   * 文脈別に brand 色を渡す用途 (例: 会場モードで brand 色 #4B3BD6 を渡す)。
   */
  backgroundColor?: string
}

export function SubmitFab(props: SubmitFabProps = {}) {
  const {
    label = '出品',
    onPress,
    hasTabBar = true,
    accessibilityLabel = '出品を作成',
    backgroundColor,
  } = props
  const insets = useSafeAreaInsets()
  const pathname = usePathname()

  // 通常 FAB (hasTabBar=true、(tabs) 層から呼ばれる用途) を venue-tab / trades
  // ルートで非表示にする。会場詳細など Stack push 画面で hasTabBar=false で
  // 呼ばれている場合は本判定を skip し、呼び出し側の表示条件のみに従う。
  if (hasTabBar && HIDDEN_GLOBAL_FAB_ROUTES.includes(pathname)) {
    return null
  }

  const handlePress =
    onPress ?? (() => router.push('/listing/new/image' as never))

  // 通常タブ画面: tab bar 上に余白 16px を置く (tab bar 自身が safe area bottom を吸収)。
  // タブバーなし画面 (会場詳細など): safe area bottom 上に余白 16px のみ。
  const bottomDistance = hasTabBar
    ? insets.bottom + TAB_BAR_HEIGHT + spacing.base
    : insets.bottom + spacing.base

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.fab,
        { bottom: bottomDistance },
        backgroundColor != null && { backgroundColor },
        pressed && styles.fabPressed,
      ]}
    >
      <Ionicons name="add" size={22} color={colors.textInverse} />
      <Text style={styles.label}>{label}</Text>
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
