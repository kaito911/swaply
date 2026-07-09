// components/venue/FreeTextChipsRow.tsx
//
// MSA のフリーテキスト追加分を破線チップで表示する行。
// 旧 app/venue/[id].tsx のローカル FreeTextChipsRow を、会場フォームのフル画面ルート
// (venue/post.tsx, venue/hold.tsx) 双方から使えるよう共有コンポーネントに抽出。
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export function FreeTextChipsRow({
  items,
  onRemove,
}: {
  items: string[]
  onRemove: (text: string) => void
}) {
  if (items.length === 0) return null
  return (
    <View style={styles.row}>
      {items.map((t) => (
        <View key={t} style={styles.chip}>
          <Text style={styles.label}>{t}</Text>
          <Pressable onPress={() => onRemove(t)} hitSlop={8} style={styles.clear}>
            <Ionicons name="close" size={12} color={colors.primary} />
          </Pressable>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    paddingVertical: 3,
    backgroundColor: colors.background,
  },
  label: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  clear: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
