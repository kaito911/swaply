// components/venue/SwapMark.tsx
//
// Swapモーション試作 (ブランド記号)。2つの点が「交差して入れ替わる」= 交換の記号。
// ★View 版 (react-native-svg 不使用・native追加なし)。coral と orange の2点が弧を描いて
//   すれ違い、位置が入れ替わる。曲線は translateY の弧で近似 (直線交差でなく“交差感”を出す)。
// ★常時静か: 平時は静止。マウント時に1回 + trigger(新着等) 変化時に1回だけ再生し、以後静止。
import { VENUE_LIGHT } from '@/lib/venueIgnition'
import React, { useCallback, useEffect, useRef } from 'react'
import { Animated, Easing, View } from 'react-native'

interface SwapMarkProps {
  /** これが変わるたびに1回だけ入れ替わりモーションを再生 (新着/Hold 等の瞬間)。 */
  trigger?: number
  /** 点の直径。 */
  size?: number
  /** 2点の横移動幅 (すれ違い距離)。 */
  span?: number
  /** マウント時再生の遅延(ms)。親のヒーロー入場 fade-in と重ならないよう後にずらす用。 */
  mountDelayMs?: number
}

export function SwapMark({ trigger = 0, size = 9, span = 16, mountDelayMs = 0 }: SwapMarkProps) {
  const t = useRef(new Animated.Value(0)).current
  const dir = useRef(0) // 現在の到達側 (0/1)。再生の度にトグルして「入れ替わる」。

  const play = useCallback(() => {
    const next = dir.current === 0 ? 1 : 0
    dir.current = next
    Animated.timing(t, {
      toValue: next,
      duration: 600,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [t])

  // マウント時に1回。ヒーロー入場 fade-in(≈700ms) と重なると masked されるため、
  //   mountDelayMs だけ遅延し、full に見えている状態で交差させる (常時静か=1回のみ)。
  useEffect(() => {
    if (mountDelayMs <= 0) {
      play()
      return
    }
    const id = setTimeout(play, mountDelayMs)
    return () => clearTimeout(id)
  }, [play, mountDelayMs])

  // trigger 変化で1回 (初回はマウント側で再生済みなので skip)。
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    play()
  }, [trigger, play])

  const ax = t.interpolate({ inputRange: [0, 1], outputRange: [0, span] })
  const bx = t.interpolate({ inputRange: [0, 1], outputRange: [span, 0] })
  // 弧: A は上、B は下を通ってすれ違う (衝突せず“交差”に見せる)。
  const ay = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6, 0] })
  const by = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 6, 0] })

  // ★診断(一時・後でrevert): 強制可視化。120x120 マゼンタ矩形を translateX 0→200 で
  //   無限往復させ、(a)JSX が可視領域に描画されるか (b)Animated/useNativeDriver が実機で
  //   値を動かせるか を同時に炙り出す。既存の Swap ロジック/点はそのまま残す。
  const debugLoop = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(debugLoop, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(debugLoop, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [debugLoop])
  const debugX = debugLoop.interpolate({ inputRange: [0, 1], outputRange: [0, 200] })

  const dot = (bg: string, tx: Animated.AnimatedInterpolation<number>, ty: Animated.AnimatedInterpolation<number>) => (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        transform: [{ translateX: tx }, { translateY: ty }],
      }}
    />
  )

  return (
    <View pointerEvents="none">
      {/* ★診断: 遅延/条件を全バイパスした 120x120 マゼンタ矩形 (無条件・不透明)。 */}
      <Animated.View
        style={{ width: 120, height: 120, backgroundColor: '#FF00FF', transform: [{ translateX: debugX }] }}
      />
      {/* 既存 Swap の 2 点 (残す)。 */}
      <View style={{ width: span + size, height: size + 14, justifyContent: 'center' }}>
        {dot(VENUE_LIGHT.coral, ax, ay)}
        {dot(VENUE_LIGHT.orange, bx, by)}
      </View>
    </View>
  )
}
