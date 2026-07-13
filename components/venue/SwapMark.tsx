// components/venue/SwapMark.tsx
//
// Swapモーション (ブランド装飾)。2つの点が「交差して入れ替わる」= 交換の記号。
// ★View 版 (react-native-svg 不使用・native追加なし)。coral と orange の2点が弧を描いて
//   すれ違い、位置が入れ替わる。曲線は translateY の弧で近似 (直線交差でなく“交差感”を出す)。
// ★常時ループ(ゆっくり・環境的): 一瞬だと意味をなさないため、往復し続けて「ヘッダーの生命感」
//   にする。ただし控えめ寸法+ゆっくり滑らかで、写真/カードの主役性は奪わない (背景化する速さ)。
import { VENUE_LIGHT } from '@/lib/venueIgnition'
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'

interface SwapMarkProps {
  /** 点の直径。 */
  size?: number
  /** 2点の横移動幅 (すれ違い距離)。 */
  span?: number
  /** 片道(すれ違い)の所要 ms。往復 = 2×。既定 1500ms → 往復 3000ms のゆっくり環境的な速さ。 */
  halfMs?: number
}

// 控えめ・かわいい装飾サイズ (実機微調整前提)。点は 10px、すれ違い幅 20px。
export function SwapMark({ size = 10, span = 20, halfMs = 1500 }: SwapMarkProps) {
  const t = useRef(new Animated.Value(0)).current

  // 常時ループ: 0→1→0 をゆっくり滑らかに往復し続ける。急加速/急停止させない (inOut.sin)。
  //   往復ごとに coral/orange の位置が入れ替わる (交換の記号)。useNativeDriver 維持。
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: halfMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: halfMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [t, halfMs])

  const ax = t.interpolate({ inputRange: [0, 1], outputRange: [0, span] })
  const bx = t.interpolate({ inputRange: [0, 1], outputRange: [span, 0] })
  // 弧: A は上、B は下を通ってすれ違う (衝突せず“交差”に見せる)。控えめサイズに合わせ弧も控えめ。
  const ay = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -7, 0] })
  const by = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 7, 0] })

  const dot = (bg: string, tx: Animated.AnimatedInterpolation<number>, ty: Animated.AnimatedInterpolation<number>) => (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        // 暗地で沈まないよう自色の発光 (光の島/点火と同じ光源表現)。控えめに。
        shadowColor: bg,
        shadowOpacity: 0.7,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 0 },
        transform: [{ translateX: tx }, { translateY: ty }],
      }}
    />
  )

  return (
    <View
      pointerEvents="none"
      style={{ width: span + size, height: size + 18, justifyContent: 'center' }}
    >
      {dot(VENUE_LIGHT.coral, ax, ay)}
      {dot(VENUE_LIGHT.orange, bx, by)}
    </View>
  )
}
