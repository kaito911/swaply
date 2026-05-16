// components/HomeSmallCard.tsx
// ホーム lane 2 (成立しやすい交換) の小型カード。
// 3.5a (機能 H 真意): TrustBadge overlay 完全削除、求 or matchReason を大強調、商品名は補助。
// 写真右上に LikeButton (size=small) overlay。

import { LikeButton } from '@/components/LikeButton'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { Card } from '@/lib/types'
import { router } from 'expo-router'
import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface HomeSmallCardProps {
  card: Card
  isOwn?: boolean
  isWantMatched?: boolean
  matchReasonLabel?: string | null
  isLiked?: boolean
  onToggleLike?: () => void
}

export function HomeSmallCard({
  card,
  isOwn = false,
  isWantMatched = false,
  matchReasonLabel,
  isLiked = false,
  onToggleLike,
}: HomeSmallCardProps) {
  const handlePress = () => {
    router.push({ pathname: '/listing/[id]', params: { id: card.id } })
  }

  // ★ 機能 H 真意 (3.5a): 求 or matchReason を強調表示するテキスト
  const headlineText =
    matchReasonLabel != null
      ? matchReasonLabel
      : card.want_description != null
      ? `求: ${card.want_description}`
      : null

  return (
    <Pressable style={styles.card} onPress={handlePress}>
      <View style={styles.imageWrap}>
        {card.image_url ? (
          <Image
            source={{ uri: card.image_url }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={20} color={colors.border} />
          </View>
        )}

        {/* 差額なしタグ: bottom-left overlay（Lane 2 の責務を視覚的に伝える） */}
        {!card.allows_adjustment && (
          <View style={styles.diffOverlay}>
            <Text style={styles.diffText}>調整金なし</Text>
          </View>
        )}

        {/* wants 一致タグ: bottom-right overlay */}
        {isWantMatched && (
          <View style={styles.wantMatchOverlay}>
            <Text style={styles.wantMatchOverlayText}>ほしい</Text>
          </View>
        )}

        {/* 自分の出品バッジ: top-left overlay */}
        {isOwn && (
          <View style={styles.ownBadge}>
            <Text style={styles.ownBadgeText}>自分</Text>
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

      <View style={styles.body}>
        {/* ★ 機能 H 真意 (3.5a): 求 or matchReason を大強調、商品名は補助 */}
        {headlineText != null && (
          <Text style={styles.headline} numberOfLines={2}>
            {headlineText}
          </Text>
        )}

        {card.group_name != null && (
          <Text style={styles.group} numberOfLines={1}>
            {card.group_name}
          </Text>
        )}

        <Text style={styles.name} numberOfLines={2}>
          {card.name}
        </Text>
      </View>
    </Pressable>
  )
}

const CARD_WIDTH = 120

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginRight: spacing.sm,
  },
  imageWrap: {
    width: '100%',
    height: 110,
    backgroundColor: colors.backgroundMuted,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  likeOverlay: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  diffOverlay: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    backgroundColor: colors.tagNeutralBg,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  diffText: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    color: colors.tagNeutralText,
  },
  ownBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ownBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  body: {
    padding: spacing.sm,
  },
  headline: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 17,
  },
  group: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.regular,
    marginTop: spacing.xs,
  },
  name: {
    fontSize: 11,
    fontWeight: fontWeight.regular,
    color: colors.textSecondary,
    lineHeight: 14,
    marginTop: 2,
  },
  wantMatchOverlay: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    backgroundColor: colors.tagPersonalBg,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  wantMatchOverlayText: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    color: colors.tagPersonalText,
  },
})
