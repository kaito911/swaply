// components/HomeLargeCard.tsx
// ホーム lane 1/3 (おすすめ / 新着) の大型カード。
// 3.5a (機能 H 真意): Trust 表示 (TrustBadge overlay + TradeStats) を完全削除、
// 求 (want_description) を「求: XXX」全体同サイズ太字で大強調、商品名は補助的に小さく。
// 写真右上に LikeButton (size=small) overlay。Trust は出品詳細画面で密度確保 (機能 H 戦略)。

import { GiveWantBlock } from '@/components/GiveWantBlock'
import { LikeButton } from '@/components/LikeButton'
import { FEATURE_FLAGS } from '@/constants/feature-flags'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { Card } from '@/lib/types'
import { formatStructuredGive, formatStructuredWantFields } from '@/lib/master'
import { useMasterCache } from '@/hooks/useMasterCache'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface HomeLargeCardProps {
  card: Card
  isOwn?: boolean
  isLiked?: boolean
  onToggleLike?: () => void
}

function getDiffLabel(card: Card): { text: string; bg: string; textColor: string } {
  if (!card.allows_adjustment) {
    return { text: '調整金なし', bg: colors.tagNeutralBg, textColor: colors.tagNeutralText }
  }
  if (card.adjustment_max != null) {
    return {
      text: `¥${card.adjustment_max.toLocaleString()}`,
      bg: colors.tagAccentBg,
      textColor: colors.tagAccentText,
    }
  }
  return { text: '要相談', bg: colors.tagInfoBg, textColor: colors.tagInfoText }
}

export function HomeLargeCard({ card, isOwn = false, isLiked = false, onToggleLike }: HomeLargeCardProps) {
  const diff = getDiffLabel(card)

  // item3 (build12 fix): 3 列だと商品名が「TREASUR…」で潰れて識別不能だったため、
  //   2.5 列相当に広げる (右端カードが半分見切れ、横スクロールを誘導)。
  //   ※発見体験のレーン構造は維持。除数 2.5 は感覚値でビルド微調整前提 (2.3〜2.7)。
  const { width: screenW } = useWindowDimensions()
  const cardWidth = Math.floor((screenW - spacing.base * 2 - spacing.sm) / 2.5)

  const handlePress = () => {
    router.push({ pathname: '/listing/[id]', params: { id: card.id } })
  }

  return (
    <Pressable style={[styles.card, { width: cardWidth }]} onPress={handlePress}>
      {/* Image area */}
      <View style={styles.imageWrap}>
        {card.image_url ? (
          <Image
            source={{ uri: card.image_url }}
            style={styles.image}
            contentFit="contain"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={colors.border} />
            <Text style={styles.placeholderText}>写真なし</Text>
          </View>
        )}

        {/* Diff label: bottom-left overlay
            β1: ADJUSTMENT_MONEY_ENABLED=false 中は非表示 */}
        {FEATURE_FLAGS.ADJUSTMENT_MONEY_ENABLED && (
          <View style={[styles.diffOverlay, { backgroundColor: diff.bg }]}>
            <Text style={[styles.diffText, { color: diff.textColor }]}>{diff.text}</Text>
          </View>
        )}

        {/* 自分の出品バッジ: top-left overlay */}
        {isOwn && (
          <View style={styles.ownBadge}>
            <Text style={styles.ownBadgeText}>自分の出品</Text>
          </View>
        )}

        {/* ♡ いいね: top-right overlay (自分の出品では非表示) */}
        {!isOwn && onToggleLike != null && (
          <LikeButton
            isLiked={isLiked}
            onToggle={onToggleLike}
            size="small"
            style={styles.likeOverlay}
          />
        )}
      </View>

      {/* Body */}
      {/* ★ 機能 H 真意 v2 (3.5a fix): 機能 H は Trust ホーム削除のみ。求の過剰強調は撤回、
          表示順は商品名 → 求の自然な視覚読み順、サイズは同じ、求は補助色控えめ */}
      <HomeLargeTitle card={card} />
    </Pressable>
  )
}

// 譲/求を 3行×2ブロック (グループ/メンバー/グッズ種別) で表示。master 解決の
// per-field を共通 GiveWantBlock に渡す。求が空 (旧テストデータ) はブロックごと非表示。
function HomeLargeTitle({ card }: { card: Card }) {
  // 修正3: master cache 更新を購読し、slug/空欄→名前への差し替えで再描画する。
  useMasterCache()
  const give = formatStructuredGive(card)
  const want = formatStructuredWantFields(card)
  return (
    <View style={styles.body}>
      <GiveWantBlock kind="give" fields={give} size="large" />
      {want != null && <GiveWantBlock kind="want" fields={want} size="large" />}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    // width は cardWidth (useWindowDimensions 由来) を inline 指定 (item5c)。
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginRight: spacing.md,
  },
  imageWrap: {
    // 幅可変に伴い固定 height を廃止し aspectRatio 化 (contain で顔切れ回避)。
    // ★RN の aspectRatio は width/height。確定仕様「高さ=幅×0.90」= width/height=1/0.9≈1.11。
    width: '100%',
    aspectRatio: 1.11,
    backgroundColor: colors.backgroundMuted,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  placeholderText: {
    fontSize: 11,
    color: colors.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  likeOverlay: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  diffOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  diffText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
  },
  ownBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ownBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  body: {
    padding: spacing.md,
  },
})
