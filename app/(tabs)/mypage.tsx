// app/(tabs)/mypage.tsx
//
// マイページ再設計 (2026-07): タブ廃止 → 縦1画面スクロール。
// セクション構成 (上から): ヒーロー / 信頼の記録 / 出品中 / 取引履歴 / 設定リンク群。
//   - 実績 (交換人数/取引回数/発送率/返信速度/直近活動) = 「信頼の記録」に5指標均等で集約。
//     数字はこの1箇所のみ (ヒーローや他セクションに再掲しない)。
//   - トラブル状態は「信頼の記録」に入れない (実績とは階層が違う信号のため)。
//     ヒーローに色サインとして表示。
//   - 商品棚 (顔2) は β1 スコープ外のため UI から除去 (2026-07-09)。設計は
//     docs/design_shelf_and_is_public.md に記録。density 到達後に復活予定。
import { FEATURE_FLAGS } from '@/constants/feature-flags'
import { HeaderActions } from '@/components/HeaderActions'
import { PioneerBadge } from '@/components/PioneerBadge'
import { ScreenHeader } from '@/components/ScreenHeader'
import {
  fetchDistinctPartnerCount,
  fetchMyOffers,
  fetchProfile,
  fetchUserCards,
  supabase,
} from '@/lib/supabase'
import {
  Card,
  computeTroubleStage,
  formatLastActive,
  Offer,
  Profile,
  TroubleStage,
} from '@/lib/types'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { SUPPORT_MAILTO, LEGAL_MAILTO } from '@/constants/contact'
import { BetaBadge } from '@/components/BetaBadge'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '@/providers/AuthProvider'
import { useBadge } from '@/providers/BadgeProvider'

// 各セクションのプレビュー表示上限 (超過分は「すべて見る」で専用画面へ)。
// 出品中は専用一覧画面が未整備のため上限を設けず全件横スクロール表示 (β1 は件数少)。
const HISTORY_PREVIEW_LIMIT = 5

// トラブル色サイン (文言なし)。実績バッジ (新規/お試し/安定/高信頼) の断定的ラベルは
// 烙印・序列化になるためマイページからは撤去し、無文言の色サインに置き換える。
//   0 = 通常 (全員デフォルト、緑=健全で静かに沈む)
//   1 = 一度トラブル (amber で surface) / 2 = 二度以上 (red で surface)
// 色は既存の状態色トークンを流用 (新規トークン不要)。
const TROUBLE_SIGN_COLOR: Record<TroubleStage, string> = {
  0: colors.success,
  1: colors.warning,
  2: colors.error,
}
// 色のみだと非表示情報になるため、a11y (画面読み上げ) 用の中立ラベルのみ添える。
// 視覚上は文言を出さない方針を維持しつつ、色覚・読み上げ利用者に状態を伝える。
const TROUBLE_SIGN_A11Y: Record<TroubleStage, string> = {
  0: '取引状態: 良好',
  1: '取引状態: 注意',
  2: '取引状態: 要確認',
}

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────

export default function MyPageScreen() {
  const { session } = useAuthContext()
  const { refreshBadge } = useBadge()
  const [logoutLoading, setLogoutLoading] = useState(false)

  const userId = useMemo(() => session?.user?.id ?? null, [session])

  const [profile, setProfile] = useState<Profile | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [historyOffers, setHistoryOffers] = useState<Offer[]>([])
  // 交換人数: get_distinct_partner_count RPC (INVOKER・引数なし)。
  // completed な trades / venue_trades の distinct 相手数。「信頼の記録」で表示。
  const [partnerCount, setPartnerCount] = useState(0)
  const [dataLoading, setDataLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      if (userId == null) return
      setDataLoading(true)
      Promise.all([
        fetchProfile(userId),
        fetchUserCards(userId, 'active'),
        fetchMyOffers(userId),
        // 交換人数 RPC。失敗しても他データ表示を止めないよう個別に握り潰す (0 fallback)。
        fetchDistinctPartnerCount().catch(() => 0),
      ]).then(([p, c, offers, partners]) => {
        if (p != null) setProfile(p)
        setCards(c)
        setPartnerCount(partners)
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

  const openMailto = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url)
      if (!supported) {
        Alert.alert(
          'メーラーが開けません',
          'メールアプリが見つかりませんでした。端末のメール設定をご確認ください。',
        )
        return
      }
      await Linking.openURL(url)
    } catch (err) {
      console.error('[MyPage][openMailto]', err)
      Alert.alert('エラー', 'メーラーの起動に失敗しました。')
    }
  }

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
  // トラブル色サイン用の暫定ステージ (0/1/2)。実績ランク文言は表示しない。
  const troubleStage: TroubleStage = profile != null ? computeTroubleStage(profile) : 0
  const tc = profile?.trade_count ?? 0
  const sr = profile?.ship_rate ?? 100
  const rh = profile?.reply_median_hours ?? 24
  const lastActiveText = formatLastActive(profile?.last_active_at ?? null)
  // 実績が1つでもあれば「信頼の記録」を数値表示。全くなければ「これから育つ場所」として提示。
  const hasTradeRecord = tc > 0 || partnerCount > 0

  const historyPreview = historyOffers.slice(0, HISTORY_PREVIEW_LIMIT)

  // ─────────────────────────────────────────
  // 信頼の記録 (5指標均等 or 空状態)
  // ─────────────────────────────────────────
  const renderTrustRecord = () => {
    if (!hasTradeRecord) {
      return (
        <View style={styles.trustEmpty}>
          <Text style={styles.trustEmptyTitle}>
            交換を重ねると、ここに信頼の記録が刻まれていきます
          </Text>
          <Text style={styles.trustEmptySub}>
            数字を後から盛ることはできない — だから信頼になる
          </Text>
        </View>
      )
    }
    const metrics = [
      { label: '交換', value: `${partnerCount}人` },
      { label: '取引', value: `${tc}回` },
      { label: '発送率', value: `${sr}%` },
      { label: '返信', value: rh < 999 ? `${rh}h` : '—' },
      { label: '直近', value: lastActiveText },
    ] as const
    return (
      <View style={styles.trustGrid}>
        {metrics.map((m, i, arr) => (
          <View
            key={m.label}
            style={[styles.trustCell, i < arr.length - 1 && styles.trustCellBorder]}
          >
            <Text style={styles.trustValue} numberOfLines={1} adjustsFontSizeToFit>
              {m.value}
            </Text>
            <Text style={styles.trustLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
    )
  }

  // ─────────────────────────────────────────
  // 出品中 (画像タイル横スクロール)
  // ─────────────────────────────────────────
  const renderListings = () => {
    if (dataLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.loader} />
    }
    if (cards.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>まだ出品がありません</Text>
          <Text style={styles.emptySub}>右下の「＋」からカードを出品できます</Text>
        </View>
      )
    }
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hScrollContent}
      >
        {cards.map((card) => (
          <Pressable
            key={card.id}
            style={styles.hCard}
            onPress={() => router.push({ pathname: '/listing/[id]', params: { id: card.id } } as never)}
          >
            {card.image_url != null ? (
              <Image source={{ uri: card.image_url }} style={styles.hCardImage} resizeMode="cover" />
            ) : (
              <View style={[styles.hCardImage, styles.hCardImageEmpty]} />
            )}
            <Text style={styles.hCardName} numberOfLines={1}>{card.name}</Text>
            {(card.series != null || card.member_name != null) && (
              <Text style={styles.hCardSub} numberOfLines={1}>
                {[card.series, card.member_name].filter(Boolean).join(' · ')}
              </Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    )
  }

  // ─────────────────────────────────────────
  // 取引履歴 (縦リスト、最新のみ)
  // ─────────────────────────────────────────
  const renderHistory = () => {
    if (dataLoading) {
      return <ActivityIndicator color={colors.primary} style={styles.loader} />
    }
    if (historyOffers.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>取引履歴はまだありません</Text>
          <Text style={styles.emptySub}>交換が成立すると、ここに記録されます</Text>
        </View>
      )
    }
    return (
      <View>
        {historyPreview.map((offer, i) => {
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
            colors.tagInfoBg

          return (
            <View
              key={offer.id}
              style={[styles.historyRow, i < historyPreview.length - 1 && styles.rowBorder]}
            >
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
        })}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader title="マイページ" showBackButton={false} rightActions={<HeaderActions />} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── β版表示 (Apple 審査向け期待値補正) ── */}
        <BetaBadge />

        {/* ── ヒーロー (アイデンティティ層) ──
            M3 でトラブル色サインをここに追加予定。M2 時点はアバター+名前+バッジのみ。 */}
        <View style={styles.hero}>
          <View style={styles.heroInner}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {avatarUrl != null ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.avatarText}>{avatarChar}</Text>
                )}
              </View>
              {/* トラブル色サイン (文言なし)。通常=緑(健全)で静かに沈み、問題時に amber/red で surface。
                  β1 は computeTroubleStage の暫定導出 (Phase 1.5 で trouble_stage 状態機械に置換)。 */}
              <View
                style={[styles.troubleDot, { backgroundColor: TROUBLE_SIGN_COLOR[troubleStage] }]}
                accessible
                accessibilityLabel={TROUBLE_SIGN_A11Y[troubleStage]}
              />
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.heroHandle}>{handle ?? displayName ?? 'ユーザー'}</Text>
              {/* Pioneer は早期参加者の事実称号 (実績ランク文言とは別物) のため維持。 */}
              {profile?.is_pioneer === true && (
                <View style={styles.heroBadgeRow}>
                  <PioneerBadge
                    pioneerNumber={profile.pioneer_number ?? null}
                    showNumber
                    size="sm"
                  />
                </View>
              )}
              {/* 将来の器 (β1 非表示): ここにフォロー/フォロワー行を追加できる。
                  dead な「0 フォロー」UI は「0を突きつけない」空状態方針に反するため
                  β1 では描画しない。構造 (heroMeta 内) だけ空けておく。 */}
            </View>
            <Pressable
              style={styles.settingsButton}
              onPress={() => router.push('/profile-edit' as never)}
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={22} color={colors.textTertiary} />
            </Pressable>
          </View>
        </View>

        {/* ── 信頼の記録 (5指標均等 / 空状態) ── */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>信頼の記録</Text>
          </View>
          {renderTrustRecord()}
        </View>

        {/* ── 出品中 ── */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              出品中{cards.length > 0 ? ` (${cards.length})` : ''}
            </Text>
          </View>
          {renderListings()}
        </View>

        {/* 商品棚 (顔2) は β1 スコープ外のため UI から除去 (2026-07-09)。
            設計は docs/design_shelf_and_is_public.md。density 到達後に復活予定。 */}

        {/* ── 取引履歴 ── */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>取引履歴</Text>
            {historyOffers.length > 0 && (
              <Pressable
                style={styles.seeAll}
                onPress={() => router.push('/(tabs)/trades' as never)}
                hitSlop={6}
              >
                <Text style={styles.seeAllText}>すべて見る</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </Pressable>
            )}
          </View>
          {renderHistory()}
        </View>

        {/* ── DEV セクション ──
            マイページ再設計 M2 (2026-07): LISTING_SINGLE_PAGE_PREVIEW 導線を除去。
            単品出品は Phase 1 で /listing/new/choose に本導線化済みのため dev preview 不要。
            残る dev 導線は DEV_FEATURES 限定 (production 非公開)。 */}
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
              style={[styles.devRow, styles.devRowLast]}
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

        {/* 設定リンク群 (アカウント関連)
            Phase A (2026-06): いいね (liked_cards) と求リスト (wanted_cards) は別概念のため
            mypage に明示的に並列リンクを置く。
            将来の器 (M3): サブスク (Swaply プラス) / 代理出品 は {label, path} を配列に
            足すだけで増やせる。β1 では課金・機能未実装のため出さない。 */}
        <View style={styles.settingsSection}>
          {([
            { label: 'プロフィール編集', path: '/profile-edit' },
            { label: '推し編集', path: '/oshi-edit' },
            { label: 'いいね', path: '/likes' },
            { label: '求リスト', path: '/wants' },
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

        {/* 法務・サポートリンク群 (App Store 審査必須項目) */}
        <View style={styles.settingsSection}>
          <Pressable
            style={[styles.settingRow, styles.rowBorder]}
            onPress={() => router.push('/legal/terms' as never)}
          >
            <Text style={styles.settingLabel}>利用規約</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
          <Pressable
            style={[styles.settingRow, styles.rowBorder]}
            onPress={() => router.push('/legal/privacy' as never)}
          >
            <Text style={styles.settingLabel}>プライバシーポリシー</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
          <Pressable
            style={[styles.settingRow, styles.rowBorder]}
            onPress={() => openMailto(SUPPORT_MAILTO)}
          >
            <Text style={styles.settingLabel}>お問い合わせ</Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </Pressable>
          <Pressable
            style={styles.settingRow}
            onPress={() => openMailto(LEGAL_MAILTO)}
          >
            <Text style={styles.settingLabel}>権利侵害の申立</Text>
            <Ionicons name="open-outline" size={16} color={colors.primary} />
          </Pressable>
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

        {/* アカウント削除 (Phase 0 PR-D、tertiary 小リンク、ログアウトの下) */}
        <Pressable
          style={styles.deleteAccountRow}
          onPress={() => router.push('/account-delete' as never)}
          hitSlop={6}
        >
          <Text style={styles.deleteAccountText}>アカウントを削除</Text>
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
  },
  avatarWrap: {
    width: 64,
    height: 64,
    flexShrink: 0,
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
  },
  // トラブル色サイン: アバター右下の status dot。白リングで縁を切り、どの写真上でも視認可能。
  troubleDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: colors.backgroundCard,
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
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
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

  // ── section (共通) ──
  sectionBlock: {
    backgroundColor: colors.backgroundCard,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  loader: {
    marginVertical: spacing.lg,
  },

  // ── 信頼の記録 ──
  trustGrid: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  trustCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: 2,
  },
  trustCellBorder: {
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
  },
  trustValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  trustLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 3,
  },
  trustEmpty: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  trustEmptyTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  trustEmptySub: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // ── 横スクロールカード (出品中) ──
  hScrollContent: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  hCard: {
    width: 108,
  },
  hCardImage: {
    width: 108,
    height: 108,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
  },
  hCardImageEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hCardName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  hCardSub: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 1,
  },

  // ── shared row ──
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  emptyBox: {
    paddingVertical: spacing.lg,
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

  // ── card meta (history) ──
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
  devRowLast: {
    borderBottomWidth: 0,
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
  // アカウント削除リンク (Phase 0 PR-D、控えめ tertiary、誤押し防止)
  deleteAccountRow: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  deleteAccountText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textDecorationLine: 'underline',
  },
})
