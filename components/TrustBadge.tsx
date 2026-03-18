// components/TrustBadge.tsx
import { colors, radius } from '@/constants/theme'
import { TrustBadgeLevel } from '@/lib/types'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

interface TrustBadgeProps {
  level: TrustBadgeLevel
  size?: 'sm' | 'md'
}

type BadgeConfig = {
  label: string
  bg: string
  text: string
  border: string
  dot: boolean
}

const BADGE_CONFIG: Record<TrustBadgeLevel, BadgeConfig> = {
  none: {
    label: '未取引',
    bg: '#F3F4F6',
    text: '#9CA3AF',
    border: '#E5E7EB',
    dot: false,
  },
  bronze: {
    label: 'Bronze',
    bg: colors.trustBronzeBg,
    text: colors.trustBronze,
    border: colors.trustBronzeBorder,
    dot: true,
  },
  silver: {
    label: 'Silver',
    bg: colors.trustSilverBg,
    text: colors.trustSilver,
    border: colors.trustSilverBorder,
    dot: true,
  },
  gold: {
    label: 'Gold',
    bg: colors.trustGoldBg,
    text: colors.trustGold,
    border: colors.trustGoldBorder,
    dot: true,
  },
}

export function TrustBadge({ level, size = 'sm' }: TrustBadgeProps) {
  const cfg = BADGE_CONFIG[level]
  const isMd = size === 'md'

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          paddingHorizontal: isMd ? 10 : 6,
          paddingVertical: isMd ? 3 : 2,
        },
      ]}
    >
      {cfg.dot && (
        <View
          style={[
            styles.dot,
            { backgroundColor: cfg.text, width: isMd ? 5 : 4, height: isMd ? 5 : 4 },
          ]}
        />
      )}
      <Text
        style={[styles.label, { color: cfg.text, fontSize: isMd ? 12 : 10 }]}
      >
        {cfg.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 3,
    alignSelf: 'flex-start',
  },
  dot: {
    borderRadius: radius.full,
  },
  label: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
})