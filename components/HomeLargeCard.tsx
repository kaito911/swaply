// components/HomeLargeCard.tsx
// ホーム lane 1/3 (おすすめ / 新着) の大型カード。
// 3.5a (機能 H 真意): Trust 表示 (TrustBadge overlay + TradeStats) を完全削除、
// 求 (want_description) を「求: XXX」全体同サイズ太字で大強調、商品名は補助的に小さく。
// 写真右上に LikeButton (size=small) overlay。Trust は出品詳細画面で密度確保 (機能 H 戦略)。

import { LikeButton } from '@/components/LikeButton'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { Card } from '@/lib/types'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { PrimaryCTA } from './PrimaryCTA'

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

  const handlePress = () => {
    router.push({ pathname: '/listing/[id]', params: { id: card.id } })
  }

  return (
    <Pressable style={styles.card} onPress={handlePress}>
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

        {/* Diff label: bottom-left overlay */}
        <View style={[styles.diffOverlay, { backgroundColor: diff.bg }]}>
          <Text style={[styles.diffText, { color: diff.textColor }]}>{diff.text}</Text>
        </View>

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
      <View style={styles.body}>
        {card.group_name != null && (
          <Text style={styles.group} numberOfLines={1}>
            {card.group_name}
          </Text>
        )}

        <Text style={styles.name} numberOfLines={2}>
          {card.name}
        </Text>

        {card.want_description != null && (
          <Text style={styles.want} numberOfLines={2}>
            求: {card.want_description}
          </Text>
        )}

        <PrimaryCTA
          label={isOwn ? '自分の出品' : '提案する'}
          size="sm"
          onPress={handlePress}
          disabled={isOwn}
          style={styles.cta}
        />
      </View>
    </Pressable>
  )
}

const CARD_WIDTH = 204

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginRight: spacing.md,
  },
  imageWrap: {
    width: '100%',
    height: 220,
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
  group: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  // 商品名 (メイン情報): 通常見出しサイズ + 太字
  name: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  // 求 (補助情報): 商品名と同サイズ、太字控えめ、secondary 色
  want: {
    fontSize: 15,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  cta: {
    marginTop: spacing.md,
  },
})
