// components/LaneSectionLabel.tsx
import { colors, fontSize, fontWeight, spacing } from '@/constants/theme'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

interface LaneSectionLabelProps {
  title: string
  sub?: string
  onSubPress?: () => void
}

export function LaneSectionLabel({ title, sub, onSubPress }: LaneSectionLabelProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {sub != null && (
        onSubPress != null ? (
          <TouchableOpacity onPress={onSubPress} activeOpacity={0.7}>
            <Text style={styles.subAction}>{sub}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.subLabel}>{sub}</Text>
        )
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  subAction: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.primary,
  },
  subLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textTertiary,
  },
})
