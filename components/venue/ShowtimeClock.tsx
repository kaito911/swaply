// components/venue/ShowtimeClock.tsx
//
// 開演カウントダウン (#5 SHOWTIME CLOCK)。「開演まで HH:MM:SS」。
// starts_at (= ライブ公演の開演時刻) までの残り時間を表示する。
// ★前日でも当日でも表示する (呼出側の phase ゲートは撤廃済)。開演時刻を過ぎたら非表示。
// ★会場ページの利用可否 (getVenuePhase) とは非連動: カウントダウンが 0 になっても
//   会場ページは開催日 23:59 まで利用できる (時刻は利用可否判定に使わない)。
// ★starts_at が NULL の会場では何も表示しない。
//
// 表示条件: startsAt != null かつ 残り時間 > 0。それ以外は null (何も出さない)。
import { colors, fontWeight } from '@/constants/theme'
import { VENUE_LIGHT } from '@/lib/venueIgnition'
import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

interface ShowtimeClockProps {
  /** venues.starts_at (ISO文字列) or null。 */
  startsAt: string | null | undefined
  /** ラベル文言 (既定 "開演まで")。 */
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

export function ShowtimeClock({ startsAt, label = '開演まで' }: ShowtimeClockProps) {
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
    // ①修正: 半透明(10%)チップは親色が透け、白カード(一覧)上で白文字が同化して読めない。
    //   不透明の中間コーラル(VENUE_LIGHT.coralMuted=#EE8FA8)にし親背景に依存せず可読化。
    //   LIVE(coral/primary)より一段弱く「開催予定 < 開催中」の序列を保つ。
    //   不透明塗りのため枠線は不要 (borderWidth/borderColor 削除済)。
    backgroundColor: VENUE_LIGHT.coralMuted,
  },
  label: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1,
    color: colors.textInverse,
  },
  time: {
    fontSize: 15,
    fontWeight: fontWeight.extrabold,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
})
