// components/venue/LightstickGalaxy.tsx
//
// 光の海 (#4 LIGHTSTICK GALAXY)。会場の中の背面に、参加者を「光の粒」で可視化。
// 人数が「灯りの密度」で伝わる。SVG 不使用 = RN View のみ (native 追加ゼロ)。
//
// ★原則死守: 常時ゆらめかせない。マウント時に一度だけふわっと点灯するのみ、以後静止。
//   粒の位置は決定的スキャッタで固定 (再レンダで飛ばない、Math.random 不使用)。
// ★軽量化 (K指定): 粒子は最大 60 でクランプ。人数がそれ未満なら人数分だけ (少ない=点火前で OK)。
// ★自分の在席: 自分の粒だけ白い輪郭で示す。
import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'

const MAX_PARTICLES = 60
// 0人でも「点火前の静かな灯り」を出すための最低アンビエント数 (少なさを武器にする思想)。
const AMBIENT_MIN = 6

interface LightstickGalaxyProps {
  /** 参加人数 (checkin count)。粒子数の基準。 */
  count: number
  /** 自分がチェックイン済みか (自分の粒を白輪郭で 1 つ足す)。 */
  selfPresent?: boolean
  /** 光源色。 */
  color?: string
}

// 決定的スキャッタ: index から 0..1 の (x,y) を返す (黄金角ベース、再現性あり・random 不要)。
function scatter(i: number): { fx: number; fy: number; op: number } {
  const fx = (i * 0.6180339887) % 1
  const fy = (i * 0.3819660113 + ((i * 0.11) % 1) * 0.13) % 1
  // twinkle: index で明滅差 (動かさず opacity を散らす)。0.35..0.9。
  const op = 0.35 + (((i * 7) % 10) / 10) * 0.55
  return { fx, fy, op }
}

export function LightstickGalaxy({ count, selfPresent = false, color = '#FF9F5C' }: LightstickGalaxyProps) {
  // 実人数。0/低でも最低 AMBIENT_MIN 個は「静かな灯り」として描く (点火前)。
  const real = Math.max(0, Math.floor(count))
  const n = Math.min(Math.max(real, AMBIENT_MIN), MAX_PARTICLES)
  const fade = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // マウント時に一度だけ点灯 (以後静止)。
    const anim = Animated.timing(fade, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    })
    anim.start()
    return () => anim.stop()
  }, [fade])

  const particles = useMemo(
    () => Array.from({ length: n }, (_, i) => ({ i, ...scatter(i) })),
    [n],
  )

  if (n <= 0) return null

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap, { opacity: fade }]}>
      {particles.map((p) => {
        const size = 5 + ((p.i * 3) % 4) // 5..8px、決定的
        const isSelf = selfPresent && p.i === 0
        // 実人数を超えた分は「アンビエント(点火前の予兆)」として一段暗く。
        const isAmbient = p.i >= real
        const dotOpacity = isSelf ? 1 : p.op * (isAmbient ? 0.4 : 1)
        return (
          <View
            key={p.i}
            style={{
              position: 'absolute',
              left: `${p.fx * 96 + 2}%`,
              top: `${p.fy * 92 + 4}%`,
              width: isSelf ? size + 3 : size,
              height: isSelf ? size + 3 : size,
              borderRadius: 99,
              backgroundColor: isSelf ? 'transparent' : color,
              opacity: dotOpacity,
              borderWidth: isSelf ? 1.5 : 0,
              borderColor: '#FFFFFF',
              shadowColor: color,
              shadowOpacity: 0.7,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        )
      })}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
})
