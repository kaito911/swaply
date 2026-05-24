// components/TrustBadge.tsx
import { colors, radius } from '@/constants/theme'
import { TRUST_BADGE_LABELS, TrustBadgeLevel } from '@/lib/types'
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
  green: {
    label: TRUST_BADGE_LABELS.green,
    bg: colors.trustBadgeGreenBg,
    text: colors.trustBadgeGreen,
    border: colors.trustBadgeGreenBorder,
    dot: false,
  },
  trial_blue: {
    label: TRUST_BADGE_LABELS.trial_blue,
    bg: colors.trustBadgeTrialBlueBg,
    text: colors.trustBadgeTrialBlue,
    border: colors.trustBadgeTrialBlueBorder,
    dot: true,
  },
  blue: {
    label: TRUST_BADGE_LABELS.blue,
    bg: colors.trustBadgeBlueBg,
    text: colors.trustBadgeBlue,
    border: colors.trustBadgeBlueBorder,
    dot: true,
  },
  gold_blue: {
    label: TRUST_BADGE_LABELS.gold_blue,
    bg: colors.trustBadgeGoldBlueBg,
    text: colors.trustBadgeGoldBlue,
    border: colors.trustBadgeGoldBlueBorder,
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
          borderWidth: level === 'gold_blue' ? 1.5 : 1,
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