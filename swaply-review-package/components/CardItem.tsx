// components/CardItem.tsx
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { TradeStats } from '@/components/TradeStats'
import { TradeTag } from '@/components/TradeTag'
import { TrustBadge } from '@/components/TrustBadge'
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme'
import { Card, computeTrustBadge, CONDITION_LABELS } from '@/lib/types'
import { router } from 'expo-router'
import React from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

interface CardItemProps {
  card: Card
  /** レーン2: "成立しやすい"ラベルを表示 */
  showMatchLabel?: boolean
  onPropose?: (card: Card) => void
}

const CARD_WIDTH = 204
const IMAGE_HEIGHT = 136

export function CardItem({ card, showMatchLabel = false, onPropose }: CardItemProps) {
  const owner = card.owner
  const trustLevel =
    owner != null
      ? computeTrustBadge({
          trade_count: owner.trade_count,
          ship_rate: owner.ship_rate,
          reply_median_hours: owner.reply_median_hours,
          trouble_count: owner.trouble_count,
        })
      : 'none'

  const handlePropose = () => {
    if (onPropose != null) {
      onPropose(card)
      return
    }
    router.push(`/offer/create?cardId=${card.id}` as never)
  }

  const handlePress = () => {
    router.push(`/listing/${card.id}` as never)
  }

  const categoryParts = [card.group_name, card.member_name, card.series].filter(
    (v): v is string => v != null && v.length > 0
  )

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.95}
    >
      {/* ─ 画像 ─ */}
      <View style={styles.imageWrap}>
        {card.image_url != null ? (
          <Image
            source={{ uri: card.image_url }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.placeholderIcon}>📷</Text>
          </View>
        )}
        {showMatchLabel && (
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeText}>✦ 成立しやすい</Text>
          </View>
        )}
        {card.condition != null && (
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionBadgeText}>
              {CONDITION_LABELS[card.condition]}
            </Text>
          </View>
        )}
      </View>

      {/* ─ コンテンツ ─ */}
      <View style={styles.content}>
        {/* 文化情報: グループ / メンバー / シリーズ */}
        {categoryParts.length > 0 && (
          <Text style={styles.category} numberOfLines={1}>
            {categoryParts.join(' · ')}
          </Text>
        )}

        {/* タイトル */}
        <Text style={styles.title} numberOfLines={2}>
          {card.name}
        </Text>

        {/* 出品者 + Trustバッジ */}
        {owner != null && (
          <View style={styles.ownerRow}>
            <TrustBadge level={trustLevel} size="sm" />
            <Text style={styles.ownerName} numberOfLines={1}>
              {owner.handle}
            </Text>
          </View>
        )}

        {/* Trust実績: 成立件数・発送率・返信速度 */}
        {owner != null && (
          <TradeStats
            tradeCount={owner.trade_count}
            shipRate={owner.ship_rate}
            replyMedianHours={owner.reply_median_hours}
            layout="row"
          />
        )}

        {/* 交換条件タグ */}
        <View style={styles.tagsRow}>
          {card.allows_mail && <TradeTag label="郵送可" variant="mail" />}
          {card.allows_handoff && <TradeTag label="手渡し可" variant="handoff" />}
          {card.allows_adjustment ? (
            <TradeTag label="調整金あり" variant="adjustment" />
          ) : (
            <TradeTag label="調整金なし" variant="no_adjustment" />
          )}
        </View>

        {/* 求条件 */}
        {card.want_description != null && (
          <Text style={styles.want} numberOfLines={1}>
            求: {card.want_description}
          </Text>
        )}

        {/* CTA */}
        <PrimaryCTA
          label="提案する"
          onPress={handlePropose}
          size="sm"
          style={styles.cta}
        />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageWrap: {
    position: 'relative',
    width: CARD_WIDTH,
    height: IMAGE_HEIGHT,
  },
  image: {
    width: CARD_WIDTH,
    height: IMAGE_HEIGHT,
  },
  imagePlaceholder: {
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 32,
  },
  matchBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  matchBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  conditionBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  conditionBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  category: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  ownerName: {
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  want: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cta: {
    marginTop: spacing.sm,
  },
})