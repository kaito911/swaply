// app/listing/new/choose.tsx
//
// 出品フロー刷新 Phase 1: 出品ボタン → 2 択分岐画面。
//   - 「1点だけ出品する」→ /listing/new/entry (Phase B 単品フロー: 下書きハブ → single-page)
//   - 「1枚の写真から複数出品する」→ /listing/new/bulk (一括フロー、Phase 2 で実装。現状プレースホルダ)
//
// 導線: SubmitFab (通常出品) の default onPress を本画面に変更 (会場モードは onPress 上書きで不変)。
// 旧 7 画面フロー (image→...→confirm) と DEPRECATED (select/ai/cardinfo) は本 Phase では残置。
//
// デザイン: 白基調・coral は使わない (2 択は "選択" であって主 CTA ではない)。
//   2 枚の大きめタップカードを縦積み。アイコン + タイトル + 補足。

import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ListingNewChooseScreen() {
  const handleSingle = () => {
    router.push('/listing/new/entry' as never)
  }
  const handleBulk = () => {
    router.push('/listing/new/bulk' as never)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="出品する" />

      <View style={styles.content}>
        <Text style={styles.lead}>どちらの方法で出品しますか?</Text>

        {/* 1点だけ出品 */}
        <Pressable
          onPress={handleSingle}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="image-outline" size={26} color={colors.textPrimary} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>1点だけ出品する</Text>
            <Text style={styles.cardSub}>
              写真1枚で、1つのグッズを出品します。
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textTertiary}
          />
        </Pressable>

        {/* 1枚から複数出品 */}
        <Pressable
          onPress={handleBulk}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="images-outline" size={26} color={colors.textPrimary} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>1枚の写真から複数出品する</Text>
            <Text style={styles.cardSub}>
              まとめ撮りした写真から、複数のグッズを一括で出品します。
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textTertiary}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  lead: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  cardPressed: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 19,
  },
})
