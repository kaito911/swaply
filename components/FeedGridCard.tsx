// components/FeedGridCard.tsx
//
// 「すべて見る」一覧 (app/list/[section].tsx) の 2 列グリッド用カード。
// 写真主役・提案ボタンなし (押しても写真押してもカード全体で詳細に飛ぶ = HomeLargeCard の
// 提案 CTA は独自機能がなく撤去した方針と同じ)。FlatList numColumns=2 のセルとして flex:1。
import { LikeButton } from '@/components/LikeButton'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { Card, formatCardTitle } from '@/lib/types'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface FeedGridCardProps {
  card: Card
  isOwn?: boolean
  isLiked?: boolean
  onToggleLike?: () => void
}

export function FeedGridCard({
  card,
  isOwn = false,
  isLiked = false,
  onToggleLike,
}: FeedGridCardProps) {
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
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={28} color={colors.border} />
          </View>
        )}

        {isOwn && (
          <View style={styles.ownBadge}>
            <Text style={styles.ownBadgeText}>自分の出品</Text>
          </View>
        )}
        {!isOwn && onToggleLike != null && (
          <LikeButton
            isLiked={isLiked}
            onToggle={onToggleLike}
            size="small"
            style={styles.likeOverlay}
          />
        )}
      </View>

      <FeedGridTitle card={card} />
    </Pressable>
  )
}

// 【譲】/【求】2行併記 (同サイズ・現場フォーマット準拠、求は card_wanted_links を正)。
function FeedGridTitle({ card }: { card: Card }) {
  const { give, want } = formatCardTitle(card)
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
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.backgroundMuted,
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  ownBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  likeOverlay: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  body: {
    padding: spacing.sm,
    gap: 3,
  },
  // 【譲】【求】は同サイズ (対等)。give=primary text, want=secondary で色のみ差。
  line: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: 18,
  },
})
