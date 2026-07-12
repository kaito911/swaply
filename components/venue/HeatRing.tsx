// components/venue/HeatRing.tsx
//
// 会場の熱量リング (#1 HEAT)。会場カードの背面に置く発光。
// - 平時: intensity に応じた「静的グロー」(coral/orange の淡い枠 + colored shadow)。常時アニメしない。
// - イベント時 (新出品/Hold): pulseSignal が変わった瞬間に「1 回だけ」外周が脈打つ。
//
// ★原則死守: 常時は静か。動くのは pulseSignal 増加の瞬間のみ。写真/情報は白カード側が担うので
//   本コンポーネントは pointerEvents="none" の背面装飾に徹する。
//
// 使い方: position:relative な wrapper の中に、カードより先に置く (背面)。
//   <View style={{position:'relative'}}>
//     <HeatRing intensity={..} color={..} pulseSignal={..} radius={16} />
//     <Card />
//   </View>
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet } from 'react-native'

interface HeatRingProps {
  /** 発光強度 0..1 (venueIgnition の intensity)。 */
  intensity: number
  /** 光源色 (coral/orange)。 */
  color: string
  /** これが増えるたびに 1 回脈打つ。0/初期値では脈打たない。 */
  pulseSignal: number
  /** カードの角丸に合わせる。 */
  radius?: number
}

export function HeatRing({ intensity, color, pulseSignal, radius = 16 }: HeatRingProps) {
  const pulse = useRef(new Animated.Value(0)).current
  const firstRun = useRef(true)

  useEffect(() => {
    // 初回マウント (pulseSignal 初期値) では脈打たない = 常時静かの原則。
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    pulse.setValue(0)
    const anim = Animated.timing(pulse, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    })
    anim.start()
    return () => anim.stop()
  }, [pulseSignal, pulse])

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] })
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, 0.55 * intensity + 0.2, 0],
  })

  return (
    <>
      {/* 静的グロー: colored shadow で白カードの外に光を滲ませる。常時静止。 */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius + 4,
            shadowColor: color,
            shadowOpacity: 0.35 * intensity + 0.15,
            shadowRadius: 18 * intensity + 6,
            shadowOffset: { width: 0, height: 0 },
            // Android: shadow が弱いので極薄の色面 + elevation で補助。
            backgroundColor: 'transparent',
            elevation: Math.round(10 * intensity) + 2,
          },
        ]}
      />
      {/* 脈打ちリング: イベント時のみ現れて外へ広がりながら消える。 */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius + 2,
            borderWidth: 2,
            borderColor: color,
            opacity: pulseOpacity,
            transform: [{ scale: pulseScale }],
          },
        ]}
      />
    </>
  )
}
