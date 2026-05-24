// components/HeaderActions.tsx
// タブヘッダー右側の 3 アイコン (通知ベル / いいね♡ / マイページアバター)。
// マイページタブ active 時は Avatar 強調 (primary 色) + tap 無効化。
// 通知バッジ count は 3.5d でデータソース投入予定 (3.5a 現在は表示なし)。

import { colors, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router, useSegments } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

export function HeaderActions() {
  const segments = useSegments()
  const isMypageActive = segments.includes('mypage' as never)

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.push('/notifications')}
        hitSlop={8}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
      </Pressable>

      <Pressable
        onPress={() => router.push('/wants')}
        hitSlop={8}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
      >
        <Ionicons name="heart-outline" size={22} color={colors.textPrimary} />
      </Pressable>

      <Pressable
        onPress={isMypageActive ? undefined : () => router.navigate('/(tabs)/mypage')}
        hitSlop={8}
        disabled={isMypageActive}
        style={({ pressed }) => [styles.iconBtn, pressed && !isMypageActive && styles.iconBtnPressed]}
      >
        <Ionicons
          name={isMypageActive ? 'person' : 'person-outline'}
          size={22}
          color={isMypageActive ? colors.primary : colors.textPrimary}
        />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  iconBtnPressed: {
    backgroundColor: colors.backgroundMuted,
  },
})
