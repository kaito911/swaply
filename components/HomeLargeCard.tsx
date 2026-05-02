// components/HomeLargeCard.tsx
import { colors, fontWeight, radius, shadow, spacing } from '@/constants/theme'
import { Card, computeTrustBadge } from '@/lib/types'
import { router } from 'expo-router'
import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { PrimaryCTA } from './PrimaryCTA'
import { TradeStats } from './TradeStats'
import { TrustBadge } from './TrustBadge'

interface HomeLargeCardProps {
  card: Card
  isOwn?: boolean
}

function getDiffLabel(card: Card): { text: string; bg: string; textColor: string } {
  if (!card.allows_adjustment) {
    return { text: '差額なし', bg: colors.tagGreen, textColor: colors.tagGreenText }
  }
  if (card.adjustment_max != null) {
    return {
      text: `¥${card.adjustment_max.toLocaleString()}`,
      bg: colors.tagBlue,
      textColor: colors.tagBlueText,
    }
  }
  return { text: '要相談', bg: colors.tagAmber, textColor: colors.tagAmberText }
}

export function HomeLargeCard({ card, isOwn = false }: HomeLargeCardProps) {
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
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={colors.border} />
            <Text style={styles.placeholderText}>写真なし</Text>
          </View>
        )}

        {/* TrustBadge: top-right overlay */}
        <View style={styles.trustOverlay}>
          <TrustBadge level={trustLevel} size="sm" />
        </View>

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
      </View>

      {/* Body */}
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
          <Text style={styles.want} numberOfLines={1}>
            求: {card.want_description}
          </Text>
        )}

        {owner != null && (
          <View style={styles.statsWrap}>
            <TradeStats
              tradeCount={owner.trade_count}
              shipRate={owner.ship_rate}
              replyMedianHours={owner.reply_median_hours}
              layout="grid"
            />
          </View>
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
    ...shadow.sm,
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
  trustOverlay: {
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
  name: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  want: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statsWrap: {
    marginTop: spacing.xs,
  },
  cta: {
    marginTop: spacing.sm,
  },
})
