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
  clearPersistedAuth,
  fetchMyOffers,
  fetchProfile,
  fetchUserCards,
  fetchUserTrust,
  isOperator,
  supabase,
} from '@/lib/supabase'
import { Card, Offer, Profile, trustDisplayStrings, UserTrust } from '@/lib/types'
import { TroubleDot } from '@/components/TroubleDot'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { SUPPORT_MAILTO, LEGAL_MAILTO } from '@/constants/contact'
import { isSentryDsnConfigured, sendSentrySmokeTest } from '@/lib/sentry'
import { Ionicons } from '@expo/vector-icons'
import * as Application from 'expo-application'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useRef, useState } from 'react'
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

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────

export default function MyPageScreen() {
  const { session } = useAuthContext()
  const { refreshBadge } = useBadge()
  const [logoutLoading, setLogoutLoading] = useState(false)

  const userId = useMemo(() => session?.user?.id ?? null, [session])

  // ── Sentry smoke test ──
  // バージョン表記を 7 回タップで発火。本番 build でしかイベントが飛ばないため、
  // 「DSN が届いていない」状態と「エラーが 0 件」状態を区別する動作確認用。
  // ★DSN の値そのものは表示しない (真偽のみ)。__DEV__ 限定にしない (本番で動く)。
  // ★公開後も残して問題ない実装 (単なる version 表記 + 隠しタップ)。
  const smokeTapCount = useRef(0)
  const handleVersionTap = () => {
    smokeTapCount.current += 1
    if (smokeTapCount.current >= 7) {
      smokeTapCount.current = 0
      sendSentrySmokeTest(`smoke build ${Application.nativeBuildVersion ?? '?'}`)
      Alert.alert(
        'Sentry smoke test',
        `DSN設定済み: ${isSentryDsnConfigured() ? 'true' : 'false'}`,
      )
    }
  }

  const [profile, setProfile] = useState<Profile | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [historyOffers, setHistoryOffers] = useState<Offer[]>([])
  // 自分の Trust 数値: get_user_trust RPC (profiles の死列を使わず都度算出)。
  // partner_count / trade_count / ship_median_hours / last_active_at / trouble_stage。
  const [trust, setTrust] = useState<UserTrust | null>(null)
  // 運営(operator)のみ「通報管理」リンクを出すための判定。既定 false (一般ユーザーには出さない)。
  const [operator, setOperator] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  // A1: 読み込み失敗フラグ。★core 3 fetch(profile/cards/offers) が1つでも失敗したら
  //   ページ単位で error 表示に倒す (false-empty 是正・理由は報告参照)。Trust/operator は
  //   個別 soft-fail (null/false) のままページを落とさない。
  const [loadFailed, setLoadFailed] = useState(false)

  const loadData = useCallback(() => {
    if (userId == null) return
    setDataLoading(true)
    setLoadFailed(false)
    Promise.all([
      fetchProfile(userId),
      fetchUserCards(userId, 'active'),
      fetchMyOffers(userId),
      // Trust 数値 RPC。失敗しても他データ表示を止めないよう個別に握り潰す (null fallback)。
      fetchUserTrust(userId).catch(() => null),
      // 運営判定。失敗時は false (安全側=リンクを出さない)。
      isOperator().catch(() => false),
    ]).then(([p, c, offers, t, op]) => {
      if (p != null) setProfile(p)
      setCards(c)
      setTrust(t)
      setOperator(op)
      setHistoryOffers(
        offers.filter(
          (o) =>
            o.status === 'accepted' ||
            o.status === 'declined' ||
            (o.trade != null && o.trade.status != null)
        )
      )
      refreshBadge()
    }).catch((e) => {
      // ★core fetch のいずれか失敗 → 「まだ出品がありません」等の嘘の空表示にせず error 化。
      console.error('[MyPage][loadData]', e)
      setLoadFailed(true)
    }).finally(() => setDataLoading(false))
  }, [userId, refreshBadge])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
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
          setLogoutLoading(true)
          // ★① 書き戻す主体 (autoRefresh ticker) を最初に止める。これを止めないと
          //   signOut 失敗で in-memory セッションが残った場合に _saveSession でトークンが
          //   書き戻される。①〜③はいずれも throw せず console.error のみで続行する。
          try {
            await supabase.auth.stopAutoRefresh()
          } catch (err) {
            console.error('[MyPage][handleLogout] stopAutoRefresh', err)
          }
          // ② scope:'local' で端末トークン削除を確実化 (成功で in-memory + storage 削除、
          //   失敗しても続行)。
          try {
            const { error } = await supabase.auth.signOut({ scope: 'local' })
            if (error) console.error('[MyPage][handleLogout] signOut', error)
          } catch (err) {
            console.error('[MyPage][handleLogout] signOut', err)
          }
          // ③ 保険: signOut の成否に依らず永続トークンを明示削除 (内部で throw しない)。
          await clearPersistedAuth()
          setLogoutLoading(false)
          // ④ 常に遷移 (ローカルは消えている)。
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  // ── derive ──
  const handle = profile?.handle ?? null
  const displayName = profile?.display_name ?? null
  const avatarChar = ((handle || displayName || 'U').slice(0, 1)).toUpperCase()
  const avatarUrl = profile?.avatar_url ?? null

  // ── Trust 数値 (get_user_trust 由来・都度算出) ──
  // ★0/null でも枠は必ず出し、値は「—」(trustDisplayStrings が整形)。率(%)は出さない。
  const tv = trustDisplayStrings(trust)
  // トラブル色サイン: DB 算出の trouble_stage をそのまま使う (クライアント判定なし)。
  const troubleStage = trust?.trouble_stage ?? 0

  const historyPreview = historyOffers.slice(0, HISTORY_PREVIEW_LIMIT)

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
            offer.status === 'declined' ? '辞退' :
            offer.status === 'pending' ? '返答待ち' :
            // 修正G: 未知の status でも生の英単語を出さない
            '—'

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

  if (loadFailed) {
    // ★取得失敗: ヘッダーは残しつつ本体を error 表示に。嘘の空表示 (0件) を出さない。
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title="マイページ" showBackButton={false} rightActions={<HeaderActions />} />
        <View style={styles.errorBox}>
          <Text style={styles.retryText}>読み込みに失敗しました</Text>
          <Pressable style={styles.retryButton} onPress={() => loadData()}>
            <Text style={styles.retryButtonText}>再試行</Text>
          </Pressable>
        </View>
      </SafeAreaView>
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
                {/* トラブル色サイン (数字なし・色のみ・0は非表示)。共通 TroubleDot。 */}
                <TroubleDot stage={troubleStage} />
              </View>
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

        {/* ── Trust (横並び4枠グリッド・0/nullは「—」・率は出さない・常に全枠表示) ── */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Trust</Text>
          </View>
          <View style={styles.trustGrid}>
            {[
              { value: tv.partner, label: '交換' },
              { value: tv.trade, label: '取引' },
              { value: tv.ship, label: '発送まで' },
              { value: tv.last, label: '直近' },
            ].map((cell, i, arr) => (
              <View
                key={cell.label}
                style={[styles.trustCell, i < arr.length - 1 && styles.trustCellBorder]}
              >
                <Text style={styles.trustCellValue} numberOfLines={1} adjustsFontSizeToFit>
                  {cell.value}
                </Text>
                <Text style={styles.trustCellLabel}>{cell.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 出品中 ── */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              出品中{cards.length > 0 ? ` (${cards.length})` : ''}
            </Text>
            {cards.length > 0 && (
              <Pressable
                style={styles.seeAll}
                onPress={() =>
                  router.push({ pathname: '/list/[section]', params: { section: 'my-listings' } } as never)
                }
                hitSlop={6}
              >
                <Text style={styles.seeAllText}>すべて見る</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </Pressable>
            )}
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
                onPress={() => router.push('/trade/history' as never)}
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
            { label: 'Swaplyの使い方', path: '/how-to-use' },
            { label: 'プロフィール編集', path: '/profile-edit' },
            { label: '推し編集', path: '/oshi-edit' },
            { label: 'いいね', path: '/likes' },
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

        {/* 運営専用リンク: operator (operator_accounts 登録者) のときだけ表示。
            一般ユーザーには一切出さない。実権限は operator RPC 側で二重に担保。 */}
        {operator && (
          <View style={styles.settingsSection}>
            <Pressable
              style={styles.settingRow}
              onPress={() => router.push('/operator/reports' as never)}
            >
              <Text style={styles.settingLabel}>通報管理</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          </View>
        )}

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

        {/* バージョン表記 (7 回タップで Sentry smoke test)。
            通常はただの version フッター。公開後も残す。 */}
        <Pressable style={styles.versionRow} onPress={handleVersionTap} hitSlop={6}>
          <Text style={styles.versionText}>
            Swaply v{Application.nativeApplicationVersion ?? '—'} (
            {Application.nativeBuildVersion ?? '—'})
          </Text>
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
  // item6: ホームと同じく下駄 120 は過大。ブリージング分のみ残して圧縮。
  scrollContent: { paddingBottom: 40 },

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

  // ── 自分の Trust 数値 (一文形式・複数行を1枠に) ──
  // ── Trust (横並び4枠グリッド) ──
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
  trustCellValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  trustCellLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 3,
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
  // A1: 読み込み失敗時の再試行UI (home/wants と同一トークン)。
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.base,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  retryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
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
  // バージョン表記 (7 回タップで smoke test)。控えめな tertiary。
  versionRow: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  versionText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
})
