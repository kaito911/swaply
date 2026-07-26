// components/GiveWantBlock.tsx
// 一覧カードの譲/求ブロック (3行固定・単一実装)。HomeLargeCard / FeedGridCard で共用。
//   行1: 【譲】or【求】+ グループ名 (小さめ・淡い)
//   行2: メンバー名 (太字・最も目立たせる)
//   行3: グッズ種別 (通常)
//   ★各行 numberOfLines={1} + ellipsizeMode="tail"。行数は絶対に増やさない。
//   ★版/シリーズは出さない (Swaply 設計上構造化しない)。
//   色 (タイポグラフィのみ・背景チップや塗りは作らない):
//     譲 = ネイビー系 → colors.textPrimary (ink #1A1A2E)。faint 行は textSecondary。
//          ※旧 navy はパレットから撤去済 (primary が coral 化) のため、現テーマで
//            最も navy に近い ink=textPrimary を採用。
//     求 = コーラル系 → colors.primary (coral #D94370)。
//   ブロック間の 8px 間隔は want 側 (kind='want') の marginTop で確保。
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fontWeight } from '@/constants/theme'
import type { GiveWantFields } from '@/lib/master'

type Size = 'large' | 'grid'

// 実測値 (Large)。Grid は幅が狭い (3列) ため各 −1 して収まりを優先。
const SIZES: Record<Size, { member: number; group: number; goods: number }> = {
  large: { member: 12, group: 10, goods: 11 },
  grid: { member: 11, group: 9, goods: 10 },
}

export function GiveWantBlock({
  kind,
  fields,
  size,
}: {
  kind: 'give' | 'want'
  fields: GiveWantFields
  size: Size
}) {
  const s = SIZES[size]
  const isGive = kind === 'give'
  const label = isGive ? '【譲】' : '【求】'
  // メンバー(主役)の色: 譲=ink / 求=coral。グループ行(淡い): 譲=slate / 求=coral。
  const memberColor = isGive ? colors.textPrimary : colors.primary
  const groupColor = isGive ? colors.textSecondary : colors.primary

  return (
    <View style={kind === 'want' ? styles.wantBlock : undefined}>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.group, { fontSize: s.group, color: groupColor }]}
      >
        {label}
        {fields.group}
      </Text>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.member, { fontSize: s.member, color: memberColor }]}
      >
        {fields.member}
      </Text>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.goods, { fontSize: s.goods }]}
      >
        {fields.goods}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wantBlock: {
    marginTop: 8, // ブロック間 8px (譲/求の視覚的な区切り)
  },
  group: {
    fontWeight: fontWeight.semibold,
  },
  member: {
    fontWeight: fontWeight.bold,
    marginTop: 1,
  },
  goods: {
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginTop: 1,
  },
})
