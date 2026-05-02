// components/BestTradeCandidateCard.tsx
// ①レーン: 最も成立しやすい交換候補を1件提示する「答え」UIブロック
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, radius, shadow, spacing } from '@/constants/theme'
import { router } from 'expo-router'
import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'

// ─────────────────────────────────────────
// RPC レスポンス型（get_best_trade_candidate）
// ─────────────────────────────────────────
export type BestTradeCandidateData = {
  cta: string
  label: 'likely' | 'almost_confirmed'
  score: number
  title: string
  my_card: { id: string; name: string; image_url: string | null }
  target_card: { id: string; name: string; image_url: string | null }
  target_user: { id: string; display_name: string }
  reasons: string[]
}

// ─────────────────────────────────────────
// ラベル表示マッピング
// ─────────────────────────────────────────
const LABEL_TEXT: Record<BestTradeCandidateData['label'], string> = {
  almost_confirmed: 'ほぼ確定',
  likely: '成立しやすい',
}

const LABEL_STYLE: Record<
  BestTradeCandidateData['label'],
  { bg: string; text: string }
> = {
  almost_confirmed: { bg: colors.tagGreen, text: colors.tagGreenText },
  likely: { bg: colors.tagPurple, text: colors.tagPurpleText },
}

// ─────────────────────────────────────────
// component
// ─────────────────────────────────────────
interface BestTradeCandidateCardProps {
  data: BestTradeCandidateData
}

export function BestTradeCandidateCard({ data }: BestTradeCandidateCardProps) {
  const labelText = LABEL_TEXT[data.label]
  const labelColor = LABEL_STYLE[data.label]
  // reasons: max 3
  const reasons = data.reasons.slice(0, 3)

  const handleCTA = () => {
    router.push({
      pathname: '/offer/create',
      params: { cardId: data.target_card.id, myCardId: data.my_card.id },
    })
  }

  const handleSubCTA = () => {
    // TODO: 専用候補一覧画面が実装されたらそちらへ遷移
    router.push('/(tabs)/search')
  }

  return (
    <View style={styles.card}>
      {/* Image */}
      {data.target_card.image_url ? (
        <Image
          source={{ uri: data.target_card.image_url }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.imagePlaceholder} />
      )}

      <View style={styles.body}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>{data.title}</Text>
          <View style={[styles.labelBadge, { backgroundColor: labelColor.bg }]}>
            <Text style={[styles.labelText, { color: labelColor.text }]}>
              {labelText}
            </Text>
          </View>
        </View>

        {/* Card name */}
        <Text style={styles.cardName} numberOfLines={2}>
          {data.target_card.name}
        </Text>

        {/* User name */}
        <Text style={styles.userName}>{data.target_user.display_name}</Text>

        {/* Reasons */}
        {reasons.length > 0 && (
          <View style={styles.reasonsWrap}>
            {reasons.map((reason, i) => (
              <View key={i} style={styles.reasonRow}>
                <Text style={styles.reasonBullet}>✓</Text>
                <Text style={styles.reasonText}>{reason}</Text>
              </View>
            ))}
          </View>
        )}

        {/* My card */}
        <Text style={styles.myCardLine}>
          あなたのカード: {data.my_card.name}
        </Text>

        {/* Primary CTA */}
        <PrimaryCTA
          label={data.cta}
          onPress={handleCTA}
          size="lg"
          style={styles.cta}
        />

        {/* Sub CTA */}
        <PrimaryCTA
          label="ほかの候補を見る"
          onPress={handleSubCTA}
          variant="ghost"
          size="sm"
          style={styles.subCta}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.md,
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: colors.backgroundMuted,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: colors.backgroundMuted,
  },
  body: {
    padding: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textTertiary,
    letterSpacing: 0.4,
    marginRight: spacing.sm,
  },
  labelBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  labelText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
  },
  cardName: {
    fontSize: 15,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  userName: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.md,
  },
  reasonsWrap: {
    marginBottom: spacing.md,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  reasonBullet: {
    fontSize: 13,
    color: colors.success,
    fontWeight: fontWeight.bold,
    marginRight: spacing.xs,
    width: 18,
  },
  reasonText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  myCardLine: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  cta: {
    marginBottom: spacing.xs,
  },
  subCta: {
    marginTop: spacing.xs,
  },
})
