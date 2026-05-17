// components/PioneerBadge.tsx
// Pioneer バッジ表示 (β1 初期協力者、50 名上限、永久付与)。
// 詳細規約: docs/policies/pioneer_policy_v1.md
//
// 設計:
//   - TrustBadge と並列に表示できるスタイル (size sm/md 揃え)
//   - showNumber=true で「Pioneer #007」形式、false で「Pioneer」のみ
//   - 色は primary 基調 + gold accent (希少性・特別感を表現)
//   - Trust 思想 (序列化禁止) と独立した「歴史的貢献者の記録」位置付け

import { colors, radius } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

interface PioneerBadgeProps {
  pioneerNumber?: number | null
  showNumber?: boolean
  size?: 'sm' | 'md'
}

export function PioneerBadge({
  pioneerNumber,
  showNumber = true,
  size = 'sm',
}: PioneerBadgeProps) {
  const isMd = size === 'md'
  const label =
    showNumber && pioneerNumber != null
      ? `Pioneer #${String(pioneerNumber).padStart(3, '0')}`
      : 'Pioneer'

  return (
    <View
      style={[
        styles.badge,
        {
          paddingHorizontal: isMd ? 10 : 6,
          paddingVertical: isMd ? 3 : 2,
        },
      ]}
    >
      <Ionicons
        name="star"
        size={isMd ? 12 : 10}
        color={colors.textInverse}
      />
      <Text
        style={[
          styles.label,
          { fontSize: isMd ? 12 : 10 },
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    gap: 4,
    alignSelf: 'flex-start',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontWeight: '700',
    color: colors.textInverse,
    letterSpacing: 0.3,
  },
})
