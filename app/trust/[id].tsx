// app/trust/[id].tsx
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    FlatList,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CardItem } from '@/components/CardItem'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SectionHeader } from '@/components/SectionHeader'
import { TrustBadge } from '@/components/TrustBadge'
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme'
import { fetchProfile, fetchUserCards } from '@/lib/supabase'
import {
    Card,
    computeTrustBadge,
    formatLastActive,
    formatReplyTime,
    Profile,
    TrustBadgeLevel,
} from '@/lib/types'

// ─────────────────────────────────────────
// 統計ボックス
// ─────────────────────────────────────────

interface StatBoxProps {
  label: string
  value: string
  sub?: string
  accent?: string
}

function StatBox({ label, value, sub, accent }: StatBoxProps) {
  return (
    <View style={statStyles.box}>
      <Text
        style={[
          statStyles.value,
          accent != null ? { color: accent } : null,
        ]}
      >
        {value}
      </Text>
      <Text style={statStyles.label}>{label}</Text>
      {sub != null && <Text style={statStyles.sub}>{sub}</Text>}
    </View>
  )
}

const statStyles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  sub: {
    fontSize: 10,
    color: colors.textTertiary,
    textAlign: 'center',
  },
})

// ─────────────────────────────────────────
// メイン画面
// ─────────────────────────────────────────

export default function TrustProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id == null) return
    Promise.all([fetchProfile(id), fetchUserCards(id)]).then(([p, c]) => {
      setProfile(p)
      setCards(c)
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Trustプロフィール" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    )
  }

  if (profile == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Trustプロフィール" />
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>プロフィールが見つかりませんでした</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const trustLevel: TrustBadgeLevel = computeTrustBadge({
    trade_count: profile.trade_count,
    ship_rate: profile.ship_rate,
    reply_median_hours: profile.reply_median_hours,
    trouble_count: profile.trouble_count,
    last_active_at: profile.last_active_at,
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Trustプロフィール" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ─ プロフィールヘッダー ─ */}
        <View style={styles.profileHeader}>
          {profile.avatar_url != null ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {(profile.handle || profile.display_name || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}

          <Text style={styles.username}>{profile.handle}</Text>

          {profile.display_name != null && (
            <Text style={styles.displayName}>{profile.display_name}</Text>
          )}

          <View style={styles.badgeRow}>
            <TrustBadge level={trustLevel} size="md" />
          </View>

          <Text style={styles.lastActive}>
            最終アクティブ: {formatLastActive(profile.last_active_at)}
          </Text>
        </View>

        {/* ─ Trust実績（事実のみ・感情レビュー禁止）─ */}
        <View style={styles.statsSection}>
          <Text style={styles.statsSectionTitle}>Trust実績（事実のみ）</Text>

          {/* 行1: 成立件数・発送遵守率・返信中央値 */}
          <View style={styles.statsRow}>
            <StatBox
              label="成立件数"
              value={`${profile.trade_count}件`}
              accent={
                profile.trade_count >= 50
                  ? colors.trustGreen
                  : undefined
              }
            />
            <StatBox
              label="発送遵守率"
              value={`${profile.ship_rate}%`}
              accent={
                profile.ship_rate >= 95
                  ? colors.trustGreen
                  : profile.ship_rate < 90
                  ? colors.error
                  : undefined
              }
            />
            <StatBox
              label="返信中央値"
              value={formatReplyTime(profile.reply_median_hours)}
            />
          </View>

          {/* 行2: トラブル件数・調整金平均・調整金偏り */}
          <View style={styles.statsRow}>
            <StatBox
              label="トラブル件数"
              value={`${profile.trouble_count}件`}
              sub={profile.trouble_count === 0 ? '問題なし' : undefined}
              accent={
                profile.trouble_count > 0 ? colors.error : colors.trustGreen
              }
            />
            <StatBox
              label="調整金 平均"
              value={
                profile.adjustment_avg != null
                  ? `¥${profile.adjustment_avg}`
                  : '—'
              }
              sub="過去取引より"
            />
            {/* 暫定: adjustment_biasはβ後半で算出予定 */}
            <StatBox
              label="調整金 偏り"
              value={profile.adjustment_bias ?? '—'}
              sub="暫定: 未算出"
            />
          </View>
        </View>

        {/* ─ 出品中カード ─ */}
        <View style={styles.cardsSection}>
          <SectionHeader
            title="出品中のカード"
            subtitle={`${cards.length}件`}
          />
          {cards.length === 0 ? (
            <Text style={styles.emptyText}>
              現在出品中のカードはありません
            </Text>
          ) : (
            <FlatList
              horizontal
              data={cards}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <CardItem card={{ ...item, owner: profile }} />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardsList}
              ItemSeparatorComponent={() => (
                <View style={{ width: spacing.sm }} />
              )}
            />
          )}
        </View>

        {/* スクロール下余白 (固定CTA分) */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ─ 固定CTA: 提案ボタン ─ */}
      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label={
            cards.length > 0
              ? `${profile.handle || profile.display_name || '出品者'} に提案する`
              : '出品中のカードがありません'
          }
          onPress={() => {
            if (cards.length === 0) return
            // TODO: 暫定実装 — 正式には出品一覧からカードを選択して提案する導線が正しい
            router.push({
              pathname: '/offer/create',
              params: { cardId: cards[0].id },
            } as never)
          }}
          disabled={cards.length === 0}
          size="lg"
        />
      </View>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.base,
  },
  errorText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  backLink: {
    fontSize: fontSize.base,
    color: colors.primary,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },

  // ── プロフィールヘッダー
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: spacing.sm,
  },
  avatarPlaceholder: {
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
  },
  username: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  displayName: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  lastActive: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },

  // ── Trust実績
  statsSection: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statsSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  // ── 出品カード
  cardsSection: {
    marginBottom: spacing.xl,
  },
  cardsList: {
    paddingHorizontal: spacing.base,
  },
  emptyText: {
    paddingHorizontal: spacing.base,
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },

  // ── 固定CTA
  ctaWrap: {
    padding: spacing.base,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
})