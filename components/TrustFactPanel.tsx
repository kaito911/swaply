// components/TrustFactPanel.tsx
// 他人向け Trust の4項目パネル (出品詳細 listing/[id] と trust/[id] で共用・単一実装)。
//   値の出どころは get_user_trust(対象user) の戻り値のみ。profiles の死列は使わない。
//   ★トラブル件数・発送遵守率(率)は作らない。トラブルは色サイン(TroubleDot)で表現。
//   ★0 または null は「—」(枠・行は必ず出す)。
//
// 4項目: 交換人数 / 取引回数 / 発送まで / 直近ログイン。
// 末尾に「※ 感情レビューなし。確定事実のみ表示。」の注記。
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, fontWeight, spacing } from '@/constants/theme'
import { trustDisplayStrings, type UserTrust } from '@/lib/types'

export function TrustFactPanel({ trust }: { trust: UserTrust | null }) {
  const v = trustDisplayStrings(trust)
  const rows: { label: string; value: string }[] = [
    { label: '交換人数', value: v.partner },
    { label: '取引回数', value: v.trade },
    { label: '発送まで', value: v.ship },
    { label: '直近ログイン', value: v.last },
  ]
  return (
    <View style={styles.wrap}>
      {rows.map((row, i) => (
        <View
          key={row.label}
          style={[styles.row, i < rows.length - 1 && styles.rowBorder]}
        >
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
      <Text style={styles.note}>※ 感情レビューなし。確定事実のみ表示。</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  value: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  note: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
})
