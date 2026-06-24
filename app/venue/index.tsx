// app/venue/index.tsx
// 会場一覧画面
import { HeaderActions } from '@/components/HeaderActions'
import { ScreenHeader } from '@/components/ScreenHeader'
import {
  checkInVenue,
  fetchMyCheckin,
  fetchVenueCheckinCount,
  fetchVenues,
  isVenueLoadFailure,
} from '@/lib/supabase'
import { Venue } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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
  const [myCheckins, setMyCheckins] = useState<Record<string, boolean>>({})
  const [checkingIn, setCheckingIn] = useState<string | null>(null)
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
        const checkins: Record<string, boolean> = {}
        // PR-V2: 付随 fetch の部分失敗を許容するため Promise.allSettled に変更。
        //   個別 venue で fetchVenueCheckinCount / fetchMyCheckin が timeout しても
        //   全体は止めず、その venue だけ count=0 / checkin=false の fallback で続行。
        await Promise.allSettled(
          venueList.map(async (v) => {
            const [countResult, checkinResult] = await Promise.allSettled([
              fetchVenueCheckinCount(v.id),
              fetchMyCheckin(v.id, userId),
            ])
            counts[v.id] = countResult.status === 'fulfilled' ? countResult.value : 0
            checkins[v.id] =
              checkinResult.status === 'fulfilled' && checkinResult.value != null
          })
        )
        setCheckinCounts(counts)
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
    router.push({ pathname: '/venue/[id]', params: { id: venue.id } } as never)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="会場" showBackButton={false} rightActions={<HeaderActions />} />
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="会場" showBackButton={false} rightActions={<HeaderActions />} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 説明バナー */}
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>会場交換モード</Text>
          <Text style={styles.bannerBody}>
            ライブ会場でのダブりカード交換に特化したモード。{'\n'}
            当日供給板・会場商品棚を中心に、会場での交換を探せます。{'\n'}
            <Text style={styles.bannerAccent}>即手渡し・Venue Holdで交換を固定。</Text>{'\n'}
            その場で交換できる相手を見つけましょう。
          </Text>
        </View>

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
            <Text style={styles.emptyText}>現在開催予定の会場はありません</Text>
          </View>
        ) : (
          venues.map((venue) => {
            const isOpen = venue.status === 'open'
            const isCheckedIn = myCheckins[venue.id] ?? false
            const count = checkinCounts[venue.id] ?? 0
            const isCheckingIn = checkingIn === venue.id

            return (
              <View
                key={venue.id}
                style={[styles.venueCard, isOpen && styles.venueCardOpen]}
              >
                <View style={styles.venueTop}>
                  <View style={styles.venueMeta}>
                    <View style={styles.venueStatusRow}>
                      {isOpen ? (
                        <View style={styles.statusBadgeOpen}>
                          <Text style={styles.statusBadgeOpenText}>● 開催中</Text>
                        </View>
                      ) : (
                        <View style={styles.statusBadgeUpcoming}>
                          <Text style={styles.statusBadgeUpcomingText}>
                            {formatEventDate(venue.event_date)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.venueTitle}>{venue.title}</Text>
                    <Text style={styles.venueName}>{venue.venue_name}</Text>
                  </View>

                  {isOpen && (
                    <View style={styles.venueStats}>
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
            )
          })
        )}

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.base, paddingBottom: 120, gap: spacing.md },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  banner: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  bannerTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  bannerBody: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  bannerAccent: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
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
    color: colors.textPrimary,
  },
  errorBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
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
  venueCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  venueCardOpen: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
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
  },
  checkinButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  enterButton: {
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
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
