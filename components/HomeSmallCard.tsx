// components/HomeSmallCard.tsx
import { colors, fontWeight, radius, shadow, spacing } from '@/constants/theme'
import { Card, computeTrustBadge } from '@/lib/types'
import { router } from 'expo-router'
import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { TrustBadge } from './TrustBadge'

interface HomeSmallCardProps {
  card: Card
  isOwn?: boolean
  isWantMatched?: boolean
  matchReasonLabel?: string | null
}

export function HomeSmallCard({ card, isOwn = false, isWantMatched = false, matchReasonLabel }: HomeSmallCardProps) {
  const owner = card.owner
  const trustLevel = owner
    ? computeTrustBadge({
        trade_count: owner.trade_count,
        ship_rate: owner.ship_rate,
        reply_median_hours: owner.reply_median_hours,
        trouble_count: owner.trouble_count,
        last_active_at: owner.last_active_at,
      })
    : 'green'

  const handlePress = () => {
    router.push({ pathname: '/listing/[id]', params: { id: card.id } })
  }

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

        {/* TrustBadge: top-right overlay */}
        <View style={styles.trustOverlay}>
          <TrustBadge level={trustLevel} size="sm" />
        </View>

        {/* 差額なしタグ: bottom-left overlay（Lane 2 の責務を視覚的に伝える） */}
        {!card.allows_adjustment && (
          <View style={styles.diffOverlay}>
            <Text style={styles.diffText}>差額なし</Text>
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
      </View>

      <View style={styles.body}>
        {card.group_name != null && (
          <Text style={styles.group} numberOfLines={1}>
            {card.group_name}
          </Text>
        )}

        <Text style={styles.name} numberOfLines={2}>
          {card.name}
        </Text>

        {matchReasonLabel != null && (
          <Text style={styles.matchReason} numberOfLines={1}>
            {matchReasonLabel}
          </Text>
        )}
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
    ...shadow.sm,
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
  trustOverlay: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  diffOverlay: {
    position: 'absolute',
    bottom: spacing.xs,
    left: spacing.xs,
    backgroundColor: colors.tagGreen,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  diffText: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    color: colors.tagGreenText,
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
  group: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  name: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
  matchReason: {
    fontSize: 10, // ★ updated: 9 → 10 (可読性向上)
    lineHeight: 13,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginTop: 3,
  },
  wantMatchOverlay: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    backgroundColor: colors.tagPurple,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  wantMatchOverlayText: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    color: colors.tagPurpleText,
  },
})
