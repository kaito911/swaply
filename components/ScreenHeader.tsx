// components/ScreenHeader.tsx
// 画面内ヘッダー (Stack ヘッダーを使わず、画面ファイル内で完結させたい場合に使う)。
// 戻る動作は onBack を渡せばカスタマイズ可、未指定なら router.back()。
// canGoBack() で表示制御はしない (常に表示) — 画面が Stack 経由で push されている前提。
// 中央にタイトル + 任意の subtitle (例: ステップ「1/5」)。

import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export function ScreenHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
}) {
  const handleBack = () => {
    if (onBack != null) {
      onBack()
      return
    }
    if (router.canGoBack()) {
      router.back()
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={handleBack}
        hitSlop={12}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle != null && subtitle !== '' && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={styles.btn} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  btn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  btnPressed: {
    backgroundColor: colors.backgroundMuted,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
})
