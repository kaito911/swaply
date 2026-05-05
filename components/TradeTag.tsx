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
  default: { bg: colors.tagPersonalBg, text: colors.tagPersonalText },
  mail: { bg: colors.tagNeutralBg, text: colors.tagNeutralText },
  handoff: { bg: colors.tagNeutralBg, text: colors.tagNeutralText },
  adjustment: { bg: colors.tagAccentBg, text: colors.tagAccentText },
  no_adjustment: { bg: colors.tagNeutralBg, text: colors.tagNeutralText },
  match: { bg: colors.tagPersonalBg, text: colors.tagPersonalText },
  mode: { bg: colors.tagPersonalBg, text: colors.tagPersonalText },
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