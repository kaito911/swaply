// app/venue/index.tsx
// 会場一覧画面
import { TabHeader } from '@/components/TabHeader'
import { checkInVenue, fetchMyCheckin, fetchVenueCheckinCount, fetchVenues } from '@/lib/supabase'
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

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      const load = async () => {
        setLoading(true)
        const venueList = await fetchVenues()
        if (!isActive) return
        setVenues(venueList)

        if (userId != null) {
          const counts: Record<string, number> = {}
          const checkins: Record<string, boolean> = {}
          await Promise.all(
            venueList.map(async (v) => {
              const [count, myCheckin] = await Promise.all([
                fetchVenueCheckinCount(v.id),
                fetchMyCheckin(v.id, userId),
              ])
              counts[v.id] = count
              checkins[v.id] = myCheckin != null
            })
          )
          if (!isActive) return
          setCheckinCounts(counts)
          setMyCheckins(checkins)
        }

        setLoading(false)
      }

      load()
      return () => { isActive = false }
    }, [userId])
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
        <TabHeader title="会場" />
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TabHeader title="会場" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 説明バナー */}
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>会場交換モード</Text>
          <Text style={styles.bannerBody}>
            ライブ会場でのダブりカード交換に特化したモード。{'\n'}
            当日供給板・会場商品棚を中心に、会場での交換を探せます。{'\n'}
            <Text style={styles.bannerAccent}>調整金なし・即手渡し・Venue Holdで交換を固定。</Text>{'\n'}
            その場で交換できる相手を見つけましょう。
          </Text>
        </View>

        <Text style={styles.sectionLabel}>今日・近日の会場</Text>

        {venues.length === 0 ? (
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

        {/* Bootstrap説明 */}
        <View style={styles.bootstrapCard}>
          <Text style={styles.bootstrapTitle}>Bootstrap Venue Mode（初回会場）</Text>
          <Text style={styles.bootstrapBody}>
            初回会場はTrustゼロで参加できる特別モード。{'\n'}
            調整金なし・即手渡しのみが条件。{'\n'}
            成立するとTrustが自動生成されます。
          </Text>
        </View>
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
  bootstrapCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  bootstrapTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#92400E',
    marginBottom: spacing.xs,
  },
  bootstrapBody: {
    fontSize: fontSize.xs,
    color: '#78350F',
    lineHeight: 18,
  },
})
