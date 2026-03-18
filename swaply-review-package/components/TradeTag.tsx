// components/TradeTag.tsx
import { colors, radius } from '@/constants/theme'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

export type TradeTagVariant =
  | 'default'
  | 'mail'
  | 'handoff'
  | 'adjustment'
  | 'no_adjustment'
  | 'match'
  | 'mode'

interface TradeTagProps {
  label: string
  variant?: TradeTagVariant
}

type StyleDef = { bg: string; text: string }

const VARIANT_STYLES: Record<TradeTagVariant, StyleDef> = {
  default: { bg: colors.tagPurple, text: colors.tagPurpleText },
  mail: { bg: colors.tagBlue, text: colors.tagBlueText },
  handoff: { bg: colors.tagGreen, text: colors.tagGreenText },
  adjustment: { bg: colors.tagAmber, text: colors.tagAmberText },
  no_adjustment: { bg: colors.tagGreen, text: colors.tagGreenText },
  match: { bg: '#EDE9FE', text: '#4C1D95' },
  mode: { bg: colors.tagPurple, text: colors.tagPurpleText },
}

export function TradeTag({ label, variant = 'default' }: TradeTagProps) {
  const s = VARIANT_STYLES[variant]
  return (
    <View style={[styles.tag, { backgroundColor: s.bg }]}>
      <Text style={[styles.label, { color: s.text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
})