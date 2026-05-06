// components/SearchBar.tsx
import { colors, fontSize, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native'

interface SearchBarProps {
  value?: string
  onChangeText?: (text: string) => void
  placeholder?: string
  /** 押すだけで画面遷移させたい場合に指定（非編集モード） */
  onPress?: () => void
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'カード名、グループ、メンバーで検索',
  onPress,
}: SearchBarProps) {
  const inner = (
    <View style={styles.inner} pointerEvents={onPress ? 'none' : 'auto'}>
      <Ionicons name="search-outline" size={16} color={colors.textTertiary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        editable={onPress == null}
      />
    </View>
  )

  if (onPress != null) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.container}>
        {inner}
      </TouchableOpacity>
    )
  }

  return <View style={styles.container}>{inner}</View>
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    padding: 0,
    margin: 0,
  },
})