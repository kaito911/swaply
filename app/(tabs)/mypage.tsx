// app/(tabs)/mypage.tsx
import { FEATURE_FLAGS } from '@/constants/feature-flags'
import {
  fetchMyOffers,
  fetchProfile,
  fetchShelfItems,
  fetchUserCards,
  supabase,
} from '@/lib/supabase'
import {
  Card,
  computeTrustBadge,
  formatLastActive,
  Offer,
  Profile,
  ShelfItem,
  TrustBadgeLevel,
} from '@/lib/types'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '@/providers/AuthProvider'
import { useBadge } from '@/providers/BadgeProvider'
import { TabHeader } from '@/components/TabHeader'
import { TrustBadge } from '@/components/TrustBadge'

// ─────────────────────────────────────────
// タブ定義
// ─────────────────────────────────────────

type MainTab = 'overview' | 'cards' | 'trust' | 'history'
type CardToggle = 'listings' | 'shelf'

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: 'overview', label: '概要' },
  { key: 'cards', label: 'カード' },
  { key: 'trust', label: 'Trust' },
  { key: 'history', label: '履歴' },
]

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────

export default function MyPageScreen() {
  const { session } = useAuthContext()
  const { refreshBadge } = useBadge()
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<MainTab>('overview')
  const [cardToggle, setCardToggle] = useState<CardToggle>('listings')

  const userId = useMemo(() => session?.user?.id ?? null, [session])

  const [profile, setProfile] = useState<Profile | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [shelfItems, setShelfItems] = useState<ShelfItem[]>([])
  const [historyOffers, setHistoryOffers] = useState<Offer[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      if (userId == null) return
      setDataLoading(true)
      Promise.all([
        fetchProfile(userId),
        fetchUserCards(userId, 'active'),
        fetchShelfItems(userId),
        fetchMyOffers(userId),
      ]).then(([p, c, s, offers]) => {
        if (p != null) setProfile(p)
        setCards(c)
        setShelfItems(s)
        setHistoryOffers(
          offers.filter(
            (o) =>
              o.status === 'accepted' ||
              o.status === 'declined' ||
              (o.trade != null && o.trade.status != null)
          )
        )
        refreshBadge()
      }).finally(() => setDataLoading(false))
    }, [userId, refreshBadge])
  )

  const handleLogout = () => {
    Alert.alert('ログアウトしますか？', '', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          try {
            setLogoutLoading(true)
            const { error } = await supabase.auth.signOut()
            if (error) throw error
            router.replace('/(auth)/login')
          } catch (err) {
            console.error('[MyPage][handleLogout]', err)
            Alert.alert('エラー', 'ログアウトに失敗しました')
          } finally {
            setLogoutLoading(false)
          }
        },
      },
    ])
  }

  // ── derive ──
  const handle = profile?.handle ?? null
  const displayName = profile?.display_name ?? null
  const avatarChar = ((handle || displayName || 'U').slice(0, 1)).toUpperCase()
  const avatarUrl = profile?.avatar_url ?? null
  const trustLevel: TrustBadgeLevel = profile != null ? computeTrustBadge(profile) : 'green'
  const tc = profile?.trade_count ?? 0
  const sr = profile?.ship_rate ?? 100
  const rh = profile?.reply_median_hours ?? 24
  const trouble = profile?.trouble_count ?? 0

  // ─────────────────────────────────────────
  // タブコンテンツ
  // ─────────────────────────────────────────

  const renderOverview = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>行動データ（確定事実のみ）</Text>
      <View style={styles.dataCard}>
        {([
          { label: '成立回数', value: `${tc}回`, color: colors.primary },
          { label: '発送遵守率', value: `${sr}%`, color: colors.success },
          { label: '返信速度', value: rh < 999 ? `${rh}h` : '—', color: '#0891B2' },
          { label: 'トラブル', value: `${trouble}件`, color: trouble === 0 ? colors.success : colors.error },
          { label: '調整金平均', value: profile?.adjustment_avg != null ? `¥${profile.adjustment_avg}` : '—', color: '#D97706' },
        ] as const).map((item, i, arr) => (
          <View key={item.label} style={[styles.dataRow, i < arr.length - 1 && styles.dataRowBorder]}>
            <Text style={styles.dataLabel}>{item.label}</Text>
            <Text style={[styles.dataValue, { color: item.color }]}>{item.value}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.noteText}>※ 感情レビュー・星評価・ランキングは使用しません</Text>
    </View>
  )

  const renderCards = () => (
    <View style={styles.tabContent}>
      {/* ピル型トグル */}
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.togglePill, cardToggle === 'listings' && styles.togglePillActive]}
          onPress={() => setCardToggle('listings')}
        >
          <Text style={[styles.toggleText, cardToggle === 'listings' && styles.toggleTextActive]}>
            出品中 {cards.length > 0 ? `(${cards.length})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.togglePill, cardToggle === 'shelf' && styles.togglePillActive]}
          onPress={() => setCardToggle('shelf')}
        >
          <Text style={[styles.toggleText, cardToggle === 'shelf' && styles.toggleTextActive]}>
            商品棚 {shelfItems.length > 0 ? `(${shelfItems.length})` : ''}
          </Text>
        </Pressable>
      </View>

      {dataLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : cardToggle === 'listings' ? (
        cards.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>出品中のカードはありません</Text>
            <Text style={styles.emptySub}>「出品」タブからカードを出品してみましょう</Text>
          </View>
        ) : (
          cards.map((card, i) => (
            <Pressable
              key={card.id}
              style={[styles.cardRow, i < cards.length - 1 && styles.rowBorder]}
              onPress={() => router.push({ pathname: '/listing/[id]', params: { id: card.id } } as never)}
            >
              {card.image_url != null ? (
                <Image source={{ uri: card.image_url }} style={styles.cardThumb} resizeMode="cover" />
              ) : (
                <View style={[styles.cardThumb, styles.cardThumbEmpty]} />
              )}
              <View style={styles.cardMeta}>
                {(card.series != null || card.member_name != null) && (
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {[card.series, card.member_name].filter(Boolean).join(' · ')}
                  </Text>
                )}
                <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
                {card.want_description != null && (
                  <Text style={styles.cardWant} numberOfLines={1}>求: {card.want_description}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          ))
        )
      ) : (
        shelfItems.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>商品棚にカードが登録されていません</Text>
            <Pressable onPress={() => router.push('/shelf' as never)}>
              <Text style={styles.emptyLink}>＋ カードを登録する</Text>
            </Pressable>
          </View>
        ) : (
          shelfItems.map((item, i) => (
            <View key={item.id} style={[styles.shelfRow, i < shelfItems.length - 1 && styles.rowBorder]}>
              <View style={styles.cardMeta}>
                {(item.group_name != null || item.member_name != null) && (
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {[item.group_name, item.member_name].filter(Boolean).join(' · ')}
                  </Text>
                )}
                <Text style={styles.cardName} numberOfLines={1}>{item.card_name}</Text>
                {item.series != null && (
                  <Text style={styles.cardSub} numberOfLines={1}>{item.series}</Text>
                )}
              </View>
            </View>
          ))
        )
      )}
    </View>
  )

  const renderTrust = () => {
    const lastActiveText = formatLastActive(profile?.last_active_at ?? null)

    return (
      <View style={styles.tabContent}>
        <View style={styles.trustHeaderRow}>
          <Text style={styles.trustHeaderLabel}>現在のバッジ</Text>
          <TrustBadge level={trustLevel} size="md" />
        </View>

        <Text style={styles.sectionTitle}>あなたの取引履歴</Text>
        <View style={styles.dataCard}>
          {([
            { label: '取引件数', value: `${tc}件` },
            { label: '発送遵守率', value: `${sr}%` },
            { label: '返信中央値', value: rh < 999 ? `${rh}時間` : '—' },
            { label: 'トラブル件数', value: `${trouble}件` },
            { label: '直近活動', value: lastActiveText },
          ] as const).map((item, i, arr) => (
            <View
              key={item.label}
              style={[styles.dataRow, i < arr.length - 1 && styles.dataRowBorder]}
            >
              <Text style={styles.dataLabel}>{item.label}</Text>
              <Text style={[styles.dataValue, { color: colors.textPrimary }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.noteText}>
          バッジは優遇権ではなく信頼証明です。発送順・露出順には影響しません。
        </Text>
      </View>
    )
  }

  const renderHistory = () => (
    <View style={styles.tabContent}>
      {dataLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : historyOffers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>取引履歴はまだありません</Text>
        </View>
      ) : (
        historyOffers.map((offer, i) => {
          const isProposer = offer.proposer_user_id === userId
          const counterHandle = isProposer
            ? (offer.target_card?.owner?.handle ?? '相手')
            : (offer.proposer?.handle ?? '相手')

          const tradeStatus = offer.trade?.status
          const statusLabel =
            tradeStatus === 'completed' ? '完了' :
            tradeStatus === 'cancelled' ? 'キャンセル' :
            offer.status === 'accepted' ? '進行中' :
            offer.status === 'declined' ? '辞退' : offer.status

          const statusColor =
            statusLabel === '完了' ? colors.success :
            statusLabel === 'キャンセル' || statusLabel === '辞退' ? colors.error :
            colors.primary

          const statusBg =
            statusLabel === '完了' ? colors.successBg :
            statusLabel === 'キャンセル' || statusLabel === '辞退' ? colors.errorBg :
            '#EEF2FF'

          return (
            <View key={offer.id} style={[styles.historyRow, i < historyOffers.length - 1 && styles.rowBorder]}>
              <View style={styles.cardMeta}>
                <Text style={styles.cardSub}>
                  {new Date(offer.created_at).toLocaleDateString('ja-JP')}
                </Text>
                <Text style={styles.cardName}>@{counterHandle}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
              </View>
            </View>
          )
        })
      )}
    </View>
  )

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview': return renderOverview()
      case 'cards': return renderCards()
      case 'trust': return renderTrust()
      case 'history': return renderHistory()
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <TabHeader title="マイページ" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ヒーロー ── */}
        <View style={styles.hero}>
          <View style={styles.heroInner}>
            {/* アバター */}
            <View style={styles.avatar}>
              {avatarUrl != null ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.avatarText}>{avatarChar}</Text>
              )}
            </View>
            {/* 名前・バッジ */}
            <View style={styles.heroMeta}>
              <Text style={styles.heroHandle}>{handle ?? displayName ?? 'ユーザー'}</Text>
              <TrustBadge level={trustLevel} size="sm" />
            </View>
            {/* 設定ボタン */}
            <Pressable
              style={styles.settingsButton}
              onPress={() => router.push('/profile-edit' as never)}
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={22} color={colors.textTertiary} />
            </Pressable>
          </View>

          {/* 統計グリッド */}
          <View style={styles.statsGrid}>
            {([
              { label: '取引', value: `${tc}回`, color: colors.primary },
              { label: '発送率', value: `${sr}%`, color: colors.success },
              { label: '返信', value: rh < 999 ? `${rh}h` : '—', color: '#0891B2' },
              { label: '出品中', value: `${cards.length}件`, color: '#D97706' },
            ] as const).map((stat, i, arr) => (
              <View key={stat.label} style={[styles.statsCell, i < arr.length - 1 && styles.statsCellBorder]}>
                <Text style={[styles.statsValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={styles.statsLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── タブバー（アンダーライン型） ── */}
        <View style={styles.tabBar}>
          {MAIN_TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── タブコンテンツ ── */}
        <View style={styles.contentCard}>
          {renderTabContent()}
        </View>

        {/* ── DEV + ログアウト ── */}
        {FEATURE_FLAGS.DEV_FEATURES && (
          <View style={styles.devSection}>
            <Pressable
              style={styles.devRow}
              onPress={() => router.push('/offer-insights' as never)}
            >
              <Text style={styles.devLabel}>成立ログ [dev]</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
            </Pressable>
            <Pressable
              style={styles.devRow}
              onPress={async () => {
                const { resetOnboardingForDebug } = await import('../onboarding')
                await resetOnboardingForDebug()
                Alert.alert('リセット完了', 'アプリを再起動してください')
              }}
            >
              <Text style={styles.devLabel}>オンボーディングリセット [dev]</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
            </Pressable>
          </View>
        )}

        {/* 設定リンク群 */}
        <View style={styles.settingsSection}>
          {([
            { label: 'プロフィール編集', path: '/profile-edit' },
            { label: '推し編集', path: '/oshi-edit' },
            { label: 'ほしいカード', path: '/wants' },
            { label: '配送情報', path: '/shipping' },
          ] as const).map((item, i, arr) => (
            <Pressable
              key={item.path}
              style={[styles.settingRow, i < arr.length - 1 && styles.rowBorder]}
              onPress={() => router.push(item.path as never)}
            >
              <Text style={styles.settingLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.logoutButton, logoutLoading && styles.buttonDisabled]}
          onPress={handleLogout}
          disabled={logoutLoading}
        >
          {logoutLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.logoutText}>ログアウト</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // ── hero ──
  hero: {
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    paddingBottom: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    flexShrink: 0,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  heroMeta: {
    flex: 1,
    gap: spacing.xs,
  },
  heroHandle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  settingsButton: {
    padding: spacing.xs,
    flexShrink: 0,
  },

  // ── stats grid ──
  statsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statsCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statsCellBorder: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  statsValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  statsLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // ── tab bar (underline) ──
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: colors.primary,
  },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textTertiary,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },

  // ── content card ──
  contentCard: {
    backgroundColor: colors.backgroundCard,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tabContent: {
    padding: spacing.base,
  },
  loader: {
    marginVertical: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  // ── overview ──
  dataCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  dataRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dataLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  dataValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  noteText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    lineHeight: 18,
    marginTop: spacing.sm,
  },

  // ── card toggle (pill) ──
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing.md,
  },
  togglePill: {
    flex: 1,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePillActive: {
    backgroundColor: colors.backgroundCard,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textTertiary,
  },
  toggleTextActive: {
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },

  // ── shared row ──
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  emptyBox: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  emptySub: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  emptyLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },

  // ── card rows ──
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  cardThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    flexShrink: 0,
  },
  cardThumbEmpty: {
    backgroundColor: colors.backgroundMuted,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardSub: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  cardName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardWant: {
    fontSize: fontSize.xs,
    color: colors.primary,
  },

  // ── shelf row ──
  shelfRow: {
    paddingVertical: spacing.sm,
  },

  // ── trust ──
  trustHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trustHeaderLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },

  // ── history ──
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },

  // ── settings section ──
  settingsSection: {
    backgroundColor: colors.backgroundCard,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    justifyContent: 'space-between',
  },
  settingLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },

  // ── dev section ──
  devSection: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  devLabel: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },

  // ── logout ──
  logoutButton: {
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
  },
  logoutText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
