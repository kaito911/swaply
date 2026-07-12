// components/venue/ShowtimeClock.tsx
//
// 開演前カウントダウン (#5 SHOWTIME CLOCK)。「DOORS OPEN IN HH:MM:SS」。
// ★K指定: ライブ「前」のみ。開場中/終演後の演出は無し。
// ★starts_at が NULL の間は非表示で先行実装 (自動投入で埋まれば自動表示)。
//
// 表示条件: startsAt != null かつ 残り時間 > 0。それ以外は null (何も出さない)。
import { fontWeight } from '@/constants/theme'
import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

interface ShowtimeClockProps {
  /** venues.starts_at (ISO文字列) or null。 */
  startsAt: string | null | undefined
  /** ラベル文言 (既定 "DOORS OPEN IN")。 */
  label?: string
}

function fmt(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function ShowtimeClock({ startsAt, label = 'DOORS OPEN IN' }: ShowtimeClockProps) {
  const target = startsAt != null ? new Date(startsAt).getTime() : null
  const [remaining, setRemaining] = useState<number>(() =>
    target != null ? target - Date.now() : -1,
  )

  useEffect(() => {
    if (target == null) return
    // 1 秒ごとに更新。残り 0 以下になったら停止 (以後 remaining<=0 で非表示)。
    const tick = () => setRemaining(target - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])

  // starts_at 無し / 不正 / 開演済 は非表示 (開場中・終演後の演出を出さない)。
  if (target == null || Number.isNaN(target) || remaining <= 0) return null

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.time}>{fmt(remaining)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,159,92,0.5)',
    backgroundColor: 'rgba(255,159,92,0.10)',
  },
  label: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1,
    color: '#FFC59A',
  },
  time: {
    fontSize: 15,
    fontWeight: fontWeight.extrabold,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
})
