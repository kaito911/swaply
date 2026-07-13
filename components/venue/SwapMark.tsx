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

// 控えめ・かわいい装飾サイズ (実機微調整前提)。点は 10px、すれ違い幅 20px、再生 800ms。
export function SwapMark({ trigger = 0, size = 10, span = 20, mountDelayMs = 0 }: SwapMarkProps) {
  const t = useRef(new Animated.Value(0)).current
  const dir = useRef(0) // 現在の到達側 (0/1)。再生の度にトグルして「入れ替わる」。

  const play = useCallback(() => {
    const next = dir.current === 0 ? 1 : 0
    dir.current = next
    Animated.timing(t, {
      toValue: next,
      duration: 800,
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
