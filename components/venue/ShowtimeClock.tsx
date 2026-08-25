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

const DAY_MS = 24 * 60 * 60 * 1000

// 残り 24h 以上は「N日」(端数の時間は切り捨て)、24h 未満は HH:MM:SS。
// ★24h 未満では h は必ず 0〜23 → 常に 2 桁。従来の Math.floor(total/3600) が 60 日表示で
//   「100:33:22」と 3 桁破綻していた事象の根絶。
// ★閾値付近の挙動 (意図した仕様): 残り 24h を切った瞬間に表示形式が「4日」→「23:59:xx」へ
//   切り替わる。日単位から秒単位へ粒度が上がるためで、バグではない (誤認防止のため明記)。
function fmtCountdown(ms: number): string {
  if (ms >= DAY_MS) {
    const days = Math.floor(ms / DAY_MS)
    return `${days}日` // ラベル「開演まで」と合わせて「開演まで 4日」
  }
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600) // ms < DAY_MS のため 0〜23
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

  // target のみに依存する自己スケジュール方式。★24h 以上は毎秒 setInterval を回さない
  //   (48 カードの毎秒再描画による一覧スクロール性能・バッテリー影響を回避)。
  //   24h を切る瞬間に 1 度だけ起きて per-second モードへ切り替える。
  //   remaining を依存に含めないため exhaustive-deps 警告も出さない。
  useEffect(() => {
    if (target == null) return
    let id: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      const rem = target - Date.now()
      setRemaining(rem)
      if (rem <= 0) return // 開演済: 以後更新しない (下の判定で null 表示)
      if (rem >= DAY_MS) {
        // 24h 以上: 毎秒更新せず、24h を切る瞬間 (+500ms 余裕) に 1 度だけ再スケジュール。
        id = setTimeout(schedule, rem - DAY_MS + 500)
      } else {
        // 24h 未満: 従来どおり毎秒更新。
        id = setInterval(schedule, 1000)
      }
    }
    schedule()
    return () => {
      if (id !== undefined) {
        clearTimeout(id)
        clearInterval(id)
      }
    }
  }, [target])

  // starts_at 無し / 不正 / 開演済 は非表示 (開場中・終演後の演出を出さない)。
  if (target == null || Number.isNaN(target) || remaining <= 0) return null

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.time}>{fmtCountdown(remaining)}</Text>
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
