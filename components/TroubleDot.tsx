// components/TroubleDot.tsx
// トラブル色サイン (単一実装)。アバター右下に置く status dot。
//   入力は get_user_trust().trouble_stage (段階・回復・チャラは全て DB 側で計算)。
//   ★数字は絶対に出さない・色のみ。0 (通常) = 無表示 (問題時のみ surface させる)。
//   1 = amber (注意) / 2 = red (要確認)。
//
// 呼び出し側は position:relative なアバター View の中に <TroubleDot stage={n} /> を置く。
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '@/constants/theme'

const TROUBLE_SIGN_COLOR: Record<number, string> = {
  1: colors.warning,
  2: colors.error,
}
const TROUBLE_SIGN_A11Y: Record<number, string> = {
  1: '取引状態: 注意',
  2: '取引状態: 要確認',
}

export function TroubleDot({ stage }: { stage: number }) {
  if (stage < 1) return null
  return (
    <View
      style={[styles.dot, { backgroundColor: TROUBLE_SIGN_COLOR[stage] }]}
      accessible
      accessibilityLabel={TROUBLE_SIGN_A11Y[stage]}
    />
  )
}

const styles = StyleSheet.create({
  // アバター右下の status dot。白リングで縁を切り、どの写真上でも視認可能。
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: colors.backgroundCard,
  },
})
