// app/venue/my-posts.tsx
// 自分の会場投稿一覧（PR2 feat/venue-hold-inbox 新規画面）
//
// 表示内容:
//   - 自分が当該 venue に出した supply_post をすべて (status / expires_at 不問)
//   - active / withdrawn / 期限切れ (lazy) を status 別表示
//   - 各 post に対する pending Hold 件数 (受信、自分宛、未失効のみ)
//   - active かつ未失効の投稿は取り下げボタンで withdrawn 化
//
// データ取得は fetchMySupplyPosts + fetchHoldCountsForSupplyPosts に統一。
// 後者は呼出規約として「自分の post id のみ渡す」が前提で、RLS でも当事者外
// の Hold は数えられない (二重防御)。
import {
  fetchHoldCountsForSupplyPosts,
  fetchMySupplyPosts,
  withdrawSupplyPost,
} from '@/lib/supabase'
import { SupplyPostStatus, VenueSupplyPost } from '@/lib/types'
import { formatVenueTimeLeft, isVenueExpired } from '@/lib/venueExpiry'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
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

type DisplayStatus = 'active' | 'withdrawn' | 'held' | 'expired'

function displayStatus(post: VenueSupplyPost): DisplayStatus {
  if (post.status === 'withdrawn') return 'withdrawn'
  if (post.status === 'held') return 'held'
  if (isVenueExpired(post.expires_at)) return 'expired'
  return 'active'
}

const STATUS_LABELS: Record<DisplayStatus, string> = {
  active: '公開中',
  withdrawn: '取り下げ済',
  held: '成立済',
  expired: '期限切れ',
}

const STATUS_COLORS: Record<DisplayStatus, string> = {
  active: '#059669',
  withdrawn: '#6B7280',
  held: '#4F46E5',
  expired: '#6B7280',
}

export default function VenueMyPostsScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>()
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [posts, setPosts] = useState<VenueSupplyPost[]>([])
  const [holdCounts, setHoldCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (venueId == null || userId == null) return
    setLoading(true)
    const fresh = await fetchMySupplyPosts(venueId, userId)
    setPosts(fresh)

    // Hold 件数は自分の post id のみを渡す (補正 4 遵守)
    const myPostIds = fresh.map((p) => p.id)
    const counts = await fetchHoldCountsForSupplyPosts(myPostIds, userId)
    setHoldCounts(counts)

    setLoading(false)
  }, [venueId, userId])

  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload])
  )

  const handleWithdraw = (postId: string) => {
    Alert.alert('取り下げますか？', '取り下げた投稿は供給板から消えます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '取り下げる',
        style: 'destructive',
        onPress: async () => {
          try {
            setWithdrawing(postId)
            await withdrawSupplyPost(postId)
            setPosts((prev) =>
              prev.map((p) =>
                p.id === postId
                  ? ({ ...p, status: 'withdrawn' as SupplyPostStatus } as VenueSupplyPost)
                  : p
              )
            )
          } catch (error) {
            console.error('[VenueMyPosts][handleWithdraw]', error)
            Alert.alert('エラー', '取り下げに失敗しました')
          } finally {
            setWithdrawing(null)
          }
        },
      },
    ])
  }

  const handleOpenReceivedHolds = () => {
    if (venueId == null) return
    router.push({
      pathname: '/venue/holds',
      params: { venueId, tab: 'received' },
    } as never)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {posts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>まだ投稿がありません</Text>
            <Text style={styles.emptyBody}>
              会場ホームの「＋ 会場で交換に出す」から投稿できます
            </Text>
          </View>
        ) : (
          posts.map((post) => {
            const status = displayStatus(post)
            const label = STATUS_LABELS[status]
            const color = STATUS_COLORS[status]
            const count = holdCounts[post.id] ?? 0
            const isWithdrawing = withdrawing === post.id
            const canWithdraw = status === 'active'

            return (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: color + '18' },
                    ]}
                  >
                    <Text style={[styles.statusText, { color }]}>{label}</Text>
                  </View>
                  {status === 'active' && (
                    <Text style={styles.timeLeft}>
                      {formatVenueTimeLeft(post.expires_at)}
                    </Text>
                  )}
                </View>

                <Text style={styles.cardName}>{post.card_name}</Text>
                {post.group_name != null && (
                  <Text style={styles.subText}>{post.group_name}</Text>
                )}
                {post.want_card != null && (
                  <Text style={styles.wantText}>求: {post.want_card}</Text>
                )}

                {count > 0 && (
                  <Pressable
                    style={styles.holdCountRow}
                    onPress={handleOpenReceivedHolds}
                  >
                    <Text style={styles.holdCountText}>
                      🔔 受信中の Hold: {count} 件
                    </Text>
                    <Text style={styles.holdCountArrow}>→</Text>
                  </Pressable>
                )}

                {canWithdraw && (
                  <Pressable
                    style={[
                      styles.withdrawButton,
                      isWithdrawing && styles.buttonDisabled,
                    ]}
                    onPress={() => handleWithdraw(post.id)}
                    disabled={isWithdrawing}
                  >
                    {isWithdrawing ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.textSecondary}
                      />
                    ) : (
                      <Text style={styles.withdrawButtonText}>取り下げる</Text>
                    )}
                  </Pressable>
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
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  postCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  timeLeft: { fontSize: fontSize.xs, color: colors.textTertiary },
  cardName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subText: { fontSize: fontSize.xs, color: colors.textTertiary },
  wantText: { fontSize: fontSize.sm, color: colors.primary },
  holdCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  holdCountText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#92400E',
  },
  holdCountArrow: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: '#92400E',
  },
  withdrawButton: {
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  withdrawButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  buttonDisabled: { opacity: 0.6 },
})
