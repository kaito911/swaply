// components/ModeChip.tsx
import { colors, fontSize, radius, spacing } from '@/constants/theme'
import { MODE_LABELS, UserMode } from '@/lib/types'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity } from 'react-native'

const MODES: UserMode[] = ['oshi', 'trading_card', 'collection']

interface ModeChipProps {
  currentMode: UserMode
  onChangeMode?: (mode: UserMode) => void
}

export function ModeChip({ currentMode, onChangeMode }: ModeChipProps) {
  const handleChange = () => {
    if (!onChangeMode) return
    const idx = MODES.indexOf(currentMode)
    const next = MODES[(idx + 1) % MODES.length]
    onChangeMode(next)
  }

  return (
    <TouchableOpacity
      onPress={handleChange}
      activeOpacity={onChangeMode ? 0.7 : 1}
      style={styles.chip}
    >
      <Text style={styles.label}>{MODE_LABELS[currentMode]}モード</Text>
      {onChangeMode != null && <Text style={styles.caret}>▾</Text>}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.tagPurple,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.tagPurpleText,
    fontWeight: '600',
  },
  caret: {
    fontSize: 10,
    color: colors.tagPurpleText,
    marginTop: 1,
  },
})