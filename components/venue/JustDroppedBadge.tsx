// components/venue/JustDroppedBadge.tsx
//
// EXCHANGE DROP (#3) の「JUST DROPPED」バッジ + 相対時刻。新着出品カードの右上に数秒表示。
// ★瞬間だけ: 表示は呼び出し側が recentlyDropped 判定 (数秒で解除) して出し入れする。
import { fontWeight } from '@/constants/theme'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

/** created_at → 「N分前 / たった今 / N時間前」。会場出品は当日中なので日跨ぎは想定薄。 */
export function formatDropAge(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'たった今'
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const h = Math.floor(min / 60)
  return `${h}時間前`
}

export function JustDroppedBadge({ age }: { age?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>JUST DROPPED</Text>
      {age != null && age !== '' && <Text style={styles.age}>{age}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,77,109,0.92)',
  },
  text: {
    fontSize: 9,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
  age: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    color: 'rgba(255,255,255,0.85)',
  },
})
