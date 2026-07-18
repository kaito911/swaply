// components/HomeLargeCard.tsx
// ホーム lane 1/3 (おすすめ / 新着) の大型カード。
// 3.5a (機能 H 真意): Trust 表示 (TrustBadge overlay + TradeStats) を完全削除、
// 求 (want_description) を「求: XXX」全体同サイズ太字で大強調、商品名は補助的に小さく。
// 写真右上に LikeButton (size=small) overlay。Trust は出品詳細画面で密度確保 (機能 H 戦略)。

import { LikeButton } from '@/components/LikeButton'
import { FEATURE_FLAGS } from '@/constants/feature-flags'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { Card, formatCardTitle } from '@/lib/types'
import { formatStructuredWant } from '@/lib/master'
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
            contentFit="cover"
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

// 【譲】/【求】2行併記 (同サイズ・現場フォーマット準拠、求は card_wanted_links を正)。
// 「提案する」CTA は撤去済 (詳細遷移がカード全体と同一で独自機能なし)。
function HomeLargeTitle({ card }: { card: Card }) {
  const { give, want: legacyWant } = formatCardTitle(card)
  const want = formatStructuredWant(card).text ?? legacyWant
  return (
    <View style={styles.body}>
      <Text style={styles.line} numberOfLines={2}>
        {give}
      </Text>
      {want != null && (
        <Text style={styles.line} numberOfLines={2}>
          {want}
        </Text>
      )}
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
    // item5c: 幅可変に伴い固定 height:220 を廃止し aspectRatio 化 (物理写真の
    //   顔切れ回避)。4:5 の縦長で人物/グッズを収めやすくする。実機で 4:5⇔1:1 を最終判断。
    width: '100%',
    aspectRatio: 4 / 5,
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
  // 【譲】【求】は同サイズ (対等・現場フォーマット)。2 行併記。
  // item3: 2.5 列化で広がった幅で読みやすくするため fontSize 15→13 に縮小 (ビルドで 12 まで微調整可)。
  line: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
})
