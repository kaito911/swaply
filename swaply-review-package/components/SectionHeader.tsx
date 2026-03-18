// components/SectionHeader.tsx
import { colors, fontSize, spacing } from '@/constants/theme'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  onSeeAll?: () => void
}

export function SectionHeader({ title, subtitle, onSeeAll }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle != null && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {onSeeAll != null && (
        <TouchableOpacity onPress={onSeeAll} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Text style={styles.seeAll}>すべて見る</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontWeight: '400',
  },
  seeAll: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
})