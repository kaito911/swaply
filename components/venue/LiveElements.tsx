// components/venue/LiveElements.tsx
//
// 会場モード「ライブ空間」演出の共有要素: LIVE バッジ (脈打ち) と参加者アバター stack。
// 会場一覧 (venue/index.tsx) と会場の中 (venue/[id].tsx) の両方で使う。
import { LinearGradient } from 'expo-linear-gradient'
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'

// LIVE バッジ: 90deg #E11D48→#BE185D + 白脈打ちドット (opacity 1↔0.4, 700ms×2, native driver)。
export function LiveBadge({ label = 'LIVE 開催中' }: { label?: string }) {
  const dot = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dot, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dot, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [dot])
  return (
    <LinearGradient
      colors={['#E11D48', '#BE185D']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.badge}
    >
      <Animated.View style={[styles.dot, { opacity: dot }]} />
      <Text style={styles.text}>{label}</Text>
    </LinearGradient>
  )
}

// 参加者アバター: 実データがないため参加人数だけグラデ円で表現 (最大 max、-9px 重ね)。
const AVATAR_GRADIENTS: readonly [string, string][] = [
  ['#F472B6', '#A855F7'],
  ['#60A5FA', '#818CF8'],
  ['#F472B6', '#A855F7'],
  ['#60A5FA', '#818CF8'],
]
export function VenueAvatarStack({ count, max = 3, size = 26 }: { count: number; max?: number; size?: number }) {
  const n = Math.min(count, max, AVATAR_GRADIENTS.length)
  if (n <= 0) return null
  return (
    <View style={styles.avatarRow}>
      {Array.from({ length: n }).map((_, i) => (
        <LinearGradient
          key={i}
          colors={AVATAR_GRADIENTS[i]}
          style={[
            { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#FFFFFF' },
            i > 0 && { marginLeft: -9 },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  text: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
})
