// components/TradeStats.tsx
import { colors, fontSize, spacing } from '@/constants/theme'
import { formatReplyTime } from '@/lib/types'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

interface TradeStatsProps {
  tradeCount: number
  shipRate: number
  replyMedianHours: number
  layout?: 'row' | 'grid'
}

interface StatItem {
  icon: string
  value: string
  label: string
  valueColor?: string
}

export function TradeStats({
  tradeCount,
  shipRate,
  replyMedianHours,
  layout = 'row',
}: TradeStatsProps) {
  const items: StatItem[] = [
    {
      icon: '✓',
      value: `${tradeCount}件`,
      label: '成立',
      valueColor: tradeCount >= 10 ? colors.trustGreen : colors.textPrimary,
    },
    {
      icon: '📦',
      value: `${shipRate}%`,
      label: '発送率',
      valueColor:
        shipRate >= 95
          ? colors.trustGreen
          : shipRate >= 90
          ? colors.textPrimary
          : colors.warning,
    },
    {
      icon: '⏱',
      value: formatReplyTime(replyMedianHours),
      label: '返信',
    },
  ]

  if (layout === 'grid') {
    return (
      <View style={styles.grid}>
        {items.map((item, i) => (
          <View key={i} style={styles.gridItem}>
            <Text style={[styles.gridValue, item.valueColor ? { color: item.valueColor } : null]}>
              {item.value}
            </Text>
            <Text style={styles.gridLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={styles.row}>
      {items.map((item, i) => (
        <View key={i} style={styles.rowItem}>
          <Text style={styles.rowIcon}>{item.icon}</Text>
          <Text
            style={[
              styles.rowValue,
              item.valueColor ? { color: item.valueColor } : null,
            ]}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rowIcon: {
    fontSize: 11,
  },
  rowValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gridItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  gridValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  gridLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
})