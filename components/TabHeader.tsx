// components/TabHeader.tsx
// 全タブ画面共通のヘッダー。canGoBack() が true のとき左に戻るボタンを表示。
// 戻り先がない (タブを直接タップして来た) ときは戻るボタンを hide。

import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export function TabHeader({ title }: { title: string }) {
  const canGoBack = router.canGoBack()

  return (
    <View style={styles.wrap}>
      {canGoBack ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
      ) : (
        <View style={styles.btn} />
      )}
      <Text style={styles.title}>{title}</Text>
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
  title: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
})
