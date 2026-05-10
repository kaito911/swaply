// app/listing/new/select.tsx
//
// ⚠️ DEPRECATED 2026-05-XX (Step 3 commit 5): K-POP 個別 N 出品 flow (1 photo → N cards 行) 用。
// β1 アニメ flow (1 photo → 1 set 行) では使用しない。
// commit 5 で image.tsx の routing が /work 直行に変更されたため、本ファイルは route から
// アクセス不可 (dead code 化)。Phase 1.5 で K-POP 復活時に AI bbox 認識需要が出れば再利用余地。
//
// STEP1 (旧): カードを選択
// 資料: プロトタイプ STEP1「カード選択（写真上でタップ ①②③）」
//   - 写真を全面表示し、AI検出bbox枠をタップして選択/解除
//   - テキストリスト選択は禁止
//   - canNext = selected.length > 0
//   - 次: /listing/new/ai
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import {
  Dimensions,
  Image,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// ─────────────────────────────────────────
// types
// ─────────────────────────────────────────
type BboxCard = {
  id: string
  label: string
  xPct: number  // 0〜1 (container幅に対する割合)
  yPct: number  // 0〜1
  wPct: number
  hPct: number
}

// ─────────────────────────────────────────
// constants
// ─────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get('window').width
// 写真コンテナの高さ: 横3枚並びカード写真を想定した比率
const PHOTO_H = Math.round(SCREEN_WIDTH * 0.72)

// モックbbox（プロトタイプ PHOTO_CARDS_MOCK 準拠: 3枚横並び）
const BBOX_MOCK: BboxCard[] = [
  { id: 'b1', label: '①', xPct: 0.05, yPct: 0.08, wPct: 0.27, hPct: 0.84 },
  { id: 'b2', label: '②', xPct: 0.37, yPct: 0.08, wPct: 0.27, hPct: 0.84 },
  { id: 'b3', label: '③', xPct: 0.68, yPct: 0.08, wPct: 0.27, hPct: 0.84 },
]

// 未選択時の枠色（bbox ごとに色分け）
const BBOX_COLORS: readonly [string, string, string] = ['#6366F1', '#D97706', '#059669']

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────
export default function ListingNewSelectScreen() {
  const params = useLocalSearchParams<{ imageUri: string }>()
  const { imageUri } = params

  const [selected, setSelected] = useState<string[]>([])
  // bbox絶対位置計算用にコンテナ実寸を取得
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const canNext = selected.length > 0

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleNext = () => {
    if (!canNext) return
    router.push({
      pathname: '/listing/new/ai' as never,
      params: {
        imageUri,
        selectedIdsJson: JSON.stringify(selected),
      },
    })
  }

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* AI 検出バナー */}
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>
            AI が <Text style={styles.bannerBold}>{BBOX_MOCK.length}枚</Text>を検出しました
          </Text>
          <Text style={styles.bannerSub}>
            タップで選択・解除。最終的にどれを出品するかはあなたが決めます。
          </Text>
        </View>

        {/* 写真 + bbox overlay */}
        <View
          style={styles.imageContainer}
          onLayout={(e: LayoutChangeEvent) =>
            setContainerSize({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.imageFallback]}>
              <Text style={styles.imageFallbackText}>写真なし</Text>
            </View>
          )}

          {/* bbox タップ枠: コンテナ実寸確定後に描画 */}
          {containerSize.width > 0 && BBOX_MOCK.map((bbox, idx) => {
            const isSelected = selected.includes(bbox.id)
            const borderColor = isSelected ? colors.success : BBOX_COLORS[idx % BBOX_COLORS.length]
            const bgColor = isSelected
              ? 'rgba(5,150,105,0.12)'
              : 'rgba(99,102,241,0.05)'
            return (
              <Pressable
                key={bbox.id}
                onPress={() => toggleSelect(bbox.id)}
                style={[
                  styles.bboxBase,
                  {
                    left: bbox.xPct * containerSize.width,
                    top: bbox.yPct * containerSize.height,
                    width: bbox.wPct * containerSize.width,
                    height: bbox.hPct * containerSize.height,
                    borderColor,
                    backgroundColor: bgColor,
                  },
                ]}
              >
                <View
                  style={[
                    styles.bboxBadge,
                    { backgroundColor: borderColor },
                  ]}
                >
                  <Text style={styles.bboxBadgeText}>
                    {isSelected ? '✓' : bbox.label}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        {/* 選択状態チップ */}
        <View style={styles.chipsRow}>
          {BBOX_MOCK.map((bbox) => {
            const isSel = selected.includes(bbox.id)
            return (
              <View key={bbox.id} style={[styles.chip, isSel && styles.chipOn]}>
                <Text style={[styles.chipText, isSel && styles.chipTextOn]}>
                  {bbox.label} {isSel ? '選択中' : '未選択'}
                </Text>
              </View>
            )
          })}
        </View>

        {/* 説明 */}
        <View style={styles.note}>
          <Text style={styles.noteText}>
            複数まとめて選択OK。選択したカードがそれぞれ1件の出品になります。
          </Text>
        </View>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label="次へ"
          onPress={handleNext}
          disabled={!canNext}
          size="lg"
        />
      </View>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────
const styles = StyleSheet.create({
  outerWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  // banner
  banner: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerTitle: {
    fontSize: 12,
    color: '#3730A3',
    lineHeight: 18,
  },
  bannerBold: {
    fontWeight: fontWeight.bold,
  },
  bannerSub: {
    fontSize: 11,
    color: '#4338CA',
    marginTop: 2,
    lineHeight: 16,
  },
  // 写真コンテナ
  imageContainer: {
    marginHorizontal: spacing.base,
    height: PHOTO_H,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  // bbox
  bboxBase: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: radius.sm,
  },
  bboxBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
  },
  bboxBadgeText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  // 選択状態チップ
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.backgroundCard,
  },
  chipOn: {
    borderColor: colors.success,
    backgroundColor: '#ECFDF5',
  },
  chipText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  chipTextOn: {
    color: colors.success,
  },
  // 説明
  note: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noteText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  // CTA
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
})
