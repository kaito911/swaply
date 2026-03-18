// app/listing/new.tsx
import { colors, fontSize, spacing } from '@/constants/theme'
import { StyleSheet, Text, View } from 'react-native'

export default function ListingNewScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>🚧</Text>
      <Text style={styles.title}>出品フロー</Text>
      <Text style={styles.sub}>P2実装予定</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  icon: { fontSize: 48 },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sub: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
})