// app/venue/index.tsx
// 会場一覧画面
import { HeaderActions } from '@/components/HeaderActions'
import {
  checkInVenue,
  fetchMyCheckin,
  fetchVenueCheckinCount,
  fetchVenueSupplyCount,
  fetchVenues,
  isVenueLoadFailure,
} from '@/lib/supabase'
import { computeIgnition, VENUE_DARK, VENUE_LIGHT } from '@/lib/venueIgnition'
import { HeatRing } from '@/components/venue/HeatRing'
import { LightstickGalaxy } from '@/components/venue/LightstickGalaxy'
import { ShowtimeClock } from '@/components/venue/ShowtimeClock'
import { SwapMark } from '@/components/venue/SwapMark'
import { useVenueSupplyRealtime } from '@/hooks/useVenueSupplyRealtime'
import { Venue } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { LinearGradient } from 'expo-linear-gradient'
import { LiveBadge, VenueAvatarStack } from '@/components/venue/LiveElements'
import { StatusBar } from 'expo-status-bar'
import * as Haptics from 'expo-haptics'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// 会場モード「暗地×光源」v1 (VENUE IGNITION)。紫版は docs/venue_color_backup.md。
// 背景=ほぼ黒のディープネイビー (下地)。会場カードは白=「光の島」として暗地に浮かす。
const VENUE_BG_GRADIENT = [VENUE_DARK, '#0A0B14', '#070810'] as const
const VENUE_BG_LOCATIONS = [0, 0.5, 1] as const
// 上部から漏れる光源 (coral→orange→透明の縦グラデを上 ~35% に重ねる)。radial/blur 不使用。
const VENUE_GLOW_COLORS = ['rgba(255,107,139,0.20)', 'rgba(255,159,92,0.06)', 'transparent'] as const
const VENUE_GLOW_LOCATIONS = [0, 0.22, 0.42] as const

function formatEventDate(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (dateStr === today) return '今日'
  if (dateStr === tomorrow) return '明日'
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function VenueListScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [checkinCounts, setCheckinCounts] = useState<Record<string, number>>({})
  // 暗地×光源: 会場ごとの active 出品数 (熱量/点火の集計元)。RPC 未適用時は 0 でグレースフル。
  const [supplyCounts, setSupplyCounts] = useState<Record<string, number>>({})
  // 熱量リングの脈打ちトリガ (venue_id → カウンタ、Realtime で increment)。
  const [pulseSignals, setPulseSignals] = useState<Record<string, number>>({})
  const [myCheckins, setMyCheckins] = useState<Record<string, boolean>>({})
  const [checkingIn, setCheckingIn] = useState<string | null>(null)

  // SWAPLY LIVE SIGNAL: 会場タブを開いた瞬間の入場アニメ (マウント時1回・瞬間のみ)。
  const entrance = useRef(new Animated.Value(0)).current
  // 集約シグナルドットの脈打ち (Realtime の新着/Hold で一瞬だけ。平時静止)。
  const signalDot = useRef(new Animated.Value(0)).current
  const [signalTick, setSignalTick] = useState(0)

  // 会場一覧 (全会場) の supply Realtime を購読し、新出品/Hold で該当会場を脈打たせる。
  //   併せて上端の集約シグナル (signalDot) も一瞬脈打たせる (「いま動いた」)。
  useVenueSupplyRealtime({
    enabled: userId != null,
    onInsert: (row) => {
      setPulseSignals((prev) => ({ ...prev, [row.venue_id]: (prev[row.venue_id] ?? 0) + 1 }))
      setSupplyCounts((prev) => ({ ...prev, [row.venue_id]: (prev[row.venue_id] ?? 0) + 1 }))
      setSignalTick((t) => t + 1)
    },
    onHeld: (row) => {
      setPulseSignals((prev) => ({ ...prev, [row.venue_id]: (prev[row.venue_id] ?? 0) + 1 }))
      setSignalTick((t) => t + 1)
    },
  })
  // PR-V2: fetchVenues の VenueFetchTimeoutError を拾って失敗 UI を出すフラグ。
  //   初期 false、正常 fetch では false 維持。失敗時のみ true、再試行成功で false に戻す。
  //   付随 fetch (fetchVenueCheckinCount / fetchMyCheckin) の失敗は本フラグに影響させない
  //   (主要 fetch=fetchVenues が成功していれば画面全体は通常表示、付随は個別 fallback)。
  const [venuesLoadFailed, setVenuesLoadFailed] = useState(false)

  // PR-V2: load を useCallback 化して再試行ボタンから呼べるようにする。
  //   状態優先順位: loading > venuesLoadFailed > venues.length===0 > データ表示。
  //   冒頭で setVenuesLoadFailed(false) を呼び、再試行成功時に失敗フラグが残らないようにする。
  const load = useCallback(async () => {
    setLoading(true)
    setVenuesLoadFailed(false) // ★ 状態リセット (再試行成功で失敗フラグが残らない保証)
    try {
      const venueList = await fetchVenues()
      setVenues(venueList)

      if (userId != null) {
        const counts: Record<string, number> = {}
        const supplies: Record<string, number> = {}
        const checkins: Record<string, boolean> = {}
        // PR-V2: 付随 fetch の部分失敗を許容するため Promise.allSettled に変更。
        //   個別 venue で fetch が timeout しても全体は止めず、その venue だけ fallback で続行。
        //   暗地×光源: supply count も併せて取得 (熱量/点火の集計元、失敗時 0)。
        await Promise.allSettled(
          venueList.map(async (v) => {
            const [countResult, supplyResult, checkinResult] = await Promise.allSettled([
              fetchVenueCheckinCount(v.id),
              fetchVenueSupplyCount(v.id),
              fetchMyCheckin(v.id, userId),
            ])
            counts[v.id] = countResult.status === 'fulfilled' ? countResult.value : 0
            supplies[v.id] = supplyResult.status === 'fulfilled' ? supplyResult.value : 0
            checkins[v.id] =
              checkinResult.status === 'fulfilled' && checkinResult.value != null
          })
        )
        setCheckinCounts(counts)
        setSupplyCounts(supplies)
        setMyCheckins(checkins)
      }
    } catch (err) {
      // PR-V2-fix: タイムアウトに加え、機内モード/圏外で発生する
      //   TypeError: Network request failed もネットワーク起因として failed 扱いにする。
      //   想定外の本物のバグは re-throw で上位に伝播 (Sentry 等で検知)。
      if (isVenueLoadFailure(err)) {
        console.warn('[VenueList][load]', err instanceof Error ? err.message : String(err))
        setVenues([])
        setVenuesLoadFailed(true)
      } else {
        throw err
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const handleCheckin = async (venue: Venue) => {
    if (userId == null) {
      Alert.alert('エラー', 'ログインが必要です')
      return
    }

    try {
      setCheckingIn(venue.id)
      await checkInVenue(venue.id, userId)
      setMyCheckins((prev) => ({ ...prev, [venue.id]: true }))
      setCheckinCounts((prev) => ({ ...prev, [venue.id]: (prev[venue.id] ?? 0) + 1 }))
      router.push({ pathname: '/venue/[id]', params: { id: venue.id } } as never)
    } catch (error) {
      console.error('[VenueList][handleCheckin]', error)
      Alert.alert('エラー', 'チェックインに失敗しました')
    } finally {
      setCheckingIn(null)
    }
  }

  const handleEnter = (venue: Venue) => {
    // 暗地×光源 v1: 入場の「点火」触覚。Light・瞬間のみ (頻繁な出入りでうざくならない強度)。
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.push({ pathname: '/venue/[id]', params: { id: venue.id } } as never)
  }

  // B(a): 会場タブを開いた瞬間の入場アニメ (マウント時1回・以後静止)。
  useEffect(() => {
    const anim = Animated.timing(entrance, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    })
    anim.start()
    return () => anim.stop()
  }, [entrance])

  // C: 集約シグナルドット。Realtime の新着/Hold (signalTick) で一瞬脈打つ。初回は鳴らさない。
  const firstTick = useRef(true)
  useEffect(() => {
    if (firstTick.current) {
      firstTick.current = false
      return
    }
    signalDot.setValue(0)
    const anim = Animated.sequence([
      Animated.timing(signalDot, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(signalDot, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ])
    anim.start()
    return () => anim.stop()
  }, [signalTick, signalDot])

  // H2: 集約 density (open 会場のみ合計)。0 でも会場カードは消さず、集約行だけ促し文に。
  const density = useMemo(() => {
    let people = 0
    let supply = 0
    for (const v of venues) {
      if (v.status !== 'open') continue
      people += checkinCounts[v.id] ?? 0
      supply += supplyCounts[v.id] ?? 0
    }
    return { people, supply, active: people > 0 || supply > 0 }
  }, [venues, checkinCounts, supplyCounts])

  // 入場アニメの補間 (ヒーロー: opacity + 迫り上がり / 光源: opacity + 微 scale)。
  const heroRise = entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] })
  const glowScale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })

  // A(大宣言) + H2(集約density) の画面内ヒーローヘッダー。OS header 不使用 (iOS26 glass 回避)。
  //   densityNode を差し替えて loading/本体で共用。HeaderActions は右上に維持。
  const renderHero = (densityNode: React.ReactNode) => (
    <Animated.View
      style={[styles.hero, { opacity: entrance, transform: [{ translateY: heroRise }] }]}
    >
      <View style={styles.heroTopRow}>
        <View style={styles.flex}>
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle}>会場モード</Text>
            {/* Swapモーション: 入口の1箇所のみ。常時ゆっくり往復ループ (環境的な装飾)。 */}
            <SwapMark />
          </View>
          <Text style={styles.heroSub}>いま、交換が動く場所</Text>
        </View>
        <HeaderActions color="#FFFFFF" />
      </View>
      {densityNode}
    </Animated.View>
  )

  // 集約density 行: 動いている時は素直な事実、0 の時は素直な促し (煽らない・過疎表示しない)。
  const densityLine = (() => {
    if (!density.active) {
      return (
        <Text style={styles.densityPrompt}>
          まだ交換は出ていません。最初のグッズを出して口火を切りましょう。
        </Text>
      )
    }
    const parts: string[] = []
    if (density.people > 0) parts.push(`${density.people}人が交換中`)
    if (density.supply > 0) parts.push(`${density.supply}件出ています`)
    return (
      <View style={styles.densityRow}>
        <Animated.View
          style={[
            styles.signalDot,
            {
              opacity: signalDot.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
              transform: [
                { scale: signalDot.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) },
              ],
            },
          ]}
        />
        <Text style={styles.densityText}>いま {parts.join('・')}</Text>
      </View>
    )
  })()

  if (loading) {
    // item1: loading 中も白ヘッダーのフラッシュを避け、本体と同じ紫グラデ+透過ヘッダーに。
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={[...VENUE_BG_GRADIENT]}
          locations={[...VENUE_BG_LOCATIONS]}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: entrance, transform: [{ scale: glowScale }] }]}
        >
          <LinearGradient
            colors={[...VENUE_GLOW_COLORS]}
            locations={[...VENUE_GLOW_LOCATIONS]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <SafeAreaView style={styles.safeTransparent} edges={['top']}>
          <StatusBar style="light" />
          {renderHero(<Text style={styles.densityPrompt}>読み込み中…</Text>)}
          <View style={styles.centerBox}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        </SafeAreaView>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {/* 暗地×光源 v1: 暗地ベース + 上部 coral/orange 光源。白カードが光の島。 */}
      <LinearGradient
        colors={[...VENUE_BG_GRADIENT]}
        locations={[...VENUE_BG_LOCATIONS]}
        style={StyleSheet.absoluteFill}
      />
      {/* B(a): 上部光源は入場時に灯る (opacity + 微 scale)、以後静止。 */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: entrance, transform: [{ scale: glowScale }] }]}
      >
        <LinearGradient
          colors={[...VENUE_GLOW_COLORS]}
          locations={[...VENUE_GLOW_LOCATIONS]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {/* commit①: 光の海を会場一覧の下端にも (会場[id]と同形・下地レイヤ)。
          SafeAreaView(hero/カード/density) の前 = 背面。カード・テキストに光を重ねない。 */}
      <View pointerEvents="none" style={styles.galaxyBand}>
        <LightstickGalaxy count={44} color={VENUE_LIGHT.orange} />
      </View>
      <SafeAreaView style={styles.safeTransparent} edges={['top']}>
        <StatusBar style="light" />
        {/* A(大宣言「会場モード」) + H2(集約density) の画面内ヒーローヘッダー。 */}
        {renderHero(densityLine)}
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
        <Text style={styles.sectionLabel}>今日・近日の会場</Text>

        {/* PR-V2: 状態優先順位 loading > venuesLoadFailed > venues.length===0 > データ表示。
            loading は本 return より上の if (loading) で早期 return 済 (L101)、ここでは
            failed > empty > データ の 3 分岐のみ評価。 */}
        {venuesLoadFailed ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>うまく読み込めませんでした</Text>
            <Text style={styles.errorBody}>
              電波が混み合っているかもしれません。少し待って再試行してください。
            </Text>
            <Pressable
              style={[styles.retryButton, loading && styles.retryButtonDisabled]}
              onPress={() => {
                void load()
              }}
              disabled={loading}
              accessibilityLabel="再試行"
            >
              <Text style={styles.retryButtonText}>再試行</Text>
            </Pressable>
          </View>
        ) : venues.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              いま参加できる会場はありません。{'\n'}ライブやイベントの当日にまた覗いてみてください。
            </Text>
          </View>
        ) : (
          venues.map((venue) => {
            const isOpen = venue.status === 'open'
            const isCheckedIn = myCheckins[venue.id] ?? false
            const count = checkinCounts[venue.id] ?? 0
            const supply = supplyCounts[venue.id] ?? 0
            const isCheckingIn = checkingIn === venue.id
            // 暗地×光源: 点火状態 (checkin+supply)。open のみ熱量リング/点火ラベルを出す。
            const ig = computeIgnition(count, supply)
            const pulse = pulseSignals[venue.id] ?? 0

            return (
              <View key={venue.id} style={styles.venueCardWrap}>
                {/* #1 熱量リング (背面・open のみ)。平時静的グロー、Realtime で脈打つ。 */}
                {isOpen && (
                  <HeatRing intensity={ig.intensity} color={ig.glowColor} pulseSignal={pulse} radius={16} />
                )}
                <View style={[styles.venueCard, isOpen && styles.venueCardOpen]}>
                <View style={styles.venueTop}>
                  <View style={styles.venueMeta}>
                    <View style={styles.venueStatusRow}>
                      {isOpen ? (
                        // #2 点火は色/強度(熱量リング)で表現。テキストラベルは K 指定で撤去。
                        <LiveBadge />
                      ) : (
                        <View style={styles.statusBadgeUpcoming}>
                          <Text style={styles.statusBadgeUpcomingText}>
                            {formatEventDate(venue.event_date)}
                          </Text>
                        </View>
                      )}
                    </View>
                    {/* #5 開演前カウントダウン (upcoming + starts_at 有り時のみ表示)。 */}
                    {!isOpen && <ShowtimeClock startsAt={venue.starts_at} />}
                    <Text style={styles.venueTitle}>{venue.title}</Text>
                    <Text style={styles.venueName}>{venue.venue_name}</Text>
                  </View>

                  {isOpen && (
                    <View style={styles.venueStats}>
                      <VenueAvatarStack count={count} />
                      <Text style={styles.venueStatNum}>{count}</Text>
                      <Text style={styles.venueStatLabel}>参加中</Text>
                    </View>
                  )}
                </View>

                {isOpen && !isCheckedIn && (
                  <Pressable
                    style={[styles.checkinButton, isCheckingIn && styles.buttonDisabled]}
                    onPress={() => handleCheckin(venue)}
                    disabled={isCheckingIn}
                  >
                    {isCheckingIn ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.checkinButtonText}>チェックインして参加する</Text>
                    )}
                  </Pressable>
                )}

                {isOpen && isCheckedIn && (
                  <Pressable
                    style={styles.enterButton}
                    onPress={() => handleEnter(venue)}
                  >
                    <Text style={styles.enterButtonText}>✓ チェックイン済 → 会場に入る</Text>
                  </Pressable>
                )}

                {venue.status === 'upcoming' && (
                  <View style={styles.upcomingNote}>
                    <Text style={styles.upcomingNoteText}>
                      {formatEventDate(venue.event_date)}に開催予定
                    </Text>
                  </View>
                )}
                </View>
              </View>
            )
          })
        )}

        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  // 暗地×光源 v1: root は暗地の下地 (グラデ描画前 fallback)、SafeArea は透過。
  root: { flex: 1, backgroundColor: VENUE_DARK },
  safeTransparent: { flex: 1, backgroundColor: 'transparent' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  // commit①: 光の海の下端バンド (会場[id] と同形: bottom アンカー・height 190・背面装飾)。
  galaxyBand: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 190 },
  content: { padding: spacing.base, paddingBottom: 120, gap: spacing.md },
  // SWAPLY LIVE SIGNAL: 大宣言ヒーローヘッダー (画面内・暗地直置き)。
  hero: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroTitle: {
    fontSize: fontSize.hero,
    fontWeight: fontWeight.extrabold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroSub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  // H2 集約density 行。
  densityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: VENUE_LIGHT.coral },
  densityText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: 'rgba(255,255,255,0.92)',
  },
  densityPrompt: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)', lineHeight: 19 },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // item1: 白箱/ガラスをやめ、紫グラデ直置きの白文字 (世界観に溶かす)。
  banner: {
    gap: 2,
  },
  bannerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: '#FFD6E8',
  },
  bannerBody: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 19,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 20,
  },
  // PR-V2: 通信失敗時の「うまく読み込めませんでした [再試行]」表示。
  //   会場詳細画面の inline 実装と同形 (共通 component 化は V3 cleanup タスクで予定)。
  errorBox: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  errorBody: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  retryButtonDisabled: {
    opacity: 0.5,
  },
  retryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  // 暗地×光源: カードの背面に熱量リングを敷くための relative wrapper。
  venueCardWrap: { position: 'relative' },
  // 白島: 暗地の上に浮く白パネル (募集/会場情報の器)。写真/情報の視認性を担う。
  venueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
  },
  // #2 点火ラベルチップ (透明地 + 光源色の枠/文字)。
  ignitionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  ignitionChipText: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 0.5,
  },
  // 暗地×光源 v1: 開催中の白島から coral 光が滲む (発光)。暗地でカードが「点灯」して見える。
  venueCardOpen: {
    shadowColor: VENUE_LIGHT.coral,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 26,
    elevation: 12,
  },
  venueTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  venueMeta: { flex: 1, gap: 4 },
  venueStatusRow: { flexDirection: 'row' },
  statusBadgeOpen: {
    backgroundColor: '#ECFDF5',
    borderRadius: 99,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusBadgeOpenText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#059669',
  },
  statusBadgeUpcoming: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: 99,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBadgeUpcomingText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textTertiary,
  },
  venueTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  venueName: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  venueStats: { alignItems: 'center', marginLeft: spacing.sm },
  venueStatNum: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  venueStatLabel: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  checkinButton: {
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
  },
  checkinButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  // 会場に入る (操作 CTA)。色レイヤー: 操作=coral。
  enterButton: {
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
  },
  enterButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  buttonDisabled: { opacity: 0.6 },
  upcomingNote: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  upcomingNoteText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
})
