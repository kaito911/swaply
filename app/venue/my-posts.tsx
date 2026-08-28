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
  reactivateSupplyPost,
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
// PR: 会場リモート画像を expo-image 化 (ダウンサンプリング + memory-disk キャッシュ、依存追加なし)。
import { Image } from 'expo-image'

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
  // A1: 主 fetch 失敗時の再試行フラグ。失敗を「0件(空)」に倒さず再試行UIを出す (holds/home と同手法)。
  const [loadFailed, setLoadFailed] = useState(false)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  // ② 再出品中の postId (二重押下抑止)。withdraw と別 flag (別ボタンで同時表示されうる)。
  const [reactivating, setReactivating] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (venueId == null || userId == null) return
    // A1: 主 fetch を try/catch/finally で包み、失敗時は「0件」ではなく再試行UIに倒す
    //   (holds.tsx と同手法。失敗を false-empty にしない)。
    setLoading(true)
    setLoadFailed(false)
    try {
      const fresh = await fetchMySupplyPosts(venueId, userId)
      setPosts(fresh)

      // Hold 件数は自分の post id のみを渡す (補正 4 遵守)
      const myPostIds = fresh.map((p) => p.id)
      const counts = await fetchHoldCountsForSupplyPosts(myPostIds, userId)
      setHoldCounts(counts)
    } catch (error) {
      console.error('[VenueMyPosts][reload]', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
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

  // ② 再出品 (withdrawn → active)。可逆操作なので確認ダイアログは出さない (通常側と統一)。
  //   期限切れは呼出前にガード済 (ボタン自体を出さず理由テキストを表示)。楽観更新 + 失敗時 revert。
  const handleReactivate = async (postId: string) => {
    const prev = posts
    setReactivating(postId)
    // 楽観更新: 先に active へ反映し、押下が即座に画面へ出るようにする。
    setPosts((cur) =>
      cur.map((p) =>
        p.id === postId
          ? ({ ...p, status: 'active' as SupplyPostStatus } as VenueSupplyPost)
          : p
      )
    )
    try {
      await reactivateSupplyPost(postId)
    } catch (error) {
      console.error('[VenueMyPosts][handleReactivate]', error)
      setPosts(prev) // 失敗したら元の状態に戻す
      Alert.alert('エラー', '再出品に失敗しました')
    } finally {
      setReactivating(null)
    }
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

  if (loadFailed) {
    // ★取得失敗: 「まだ投稿がありません」(0件) を出さず、固まらせず再試行 (holds/home と同手法)。
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>読み込みに失敗しました</Text>
          <Pressable style={styles.retryButton} onPress={() => void reload()}>
            <Text style={styles.retryButtonText}>再試行</Text>
          </Pressable>
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
              会場ホームの「この会場で出す」から投稿できます
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
            // ② 再出品: withdrawn のみ対象。期限切れは復活しても板に出ないため不可
            //   (ボタンを出さず理由テキストを表示・通常側と統一)。
            const isReactivating = reactivating === post.id
            const canReactivate =
              post.status === 'withdrawn' && !isVenueExpired(post.expires_at)
            const reactivateBlocked =
              post.status === 'withdrawn' && isVenueExpired(post.expires_at)

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

                {/* 一覧性優先: 画像ありは横型 (左サムネ + 右テキスト) で
                    カード縦幅を圧縮。商品名は画像と同じ高さでまとまりよく見えるよう
                    フォント拡大。画像なしは既存の縦並びを温存。 */}
                {post.image_url != null ? (
                  <View style={styles.postBodyRow}>
                    <Image
                      source={{ uri: post.image_url }}
                      style={styles.postThumb}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    {/* 右詳細: venue/[id].tsx 当日供給板と同じ思想で「譲：name →
                        group → 求：want」順に並べる。自分の投稿一覧なので Hold
                        申請ボタンは無く、下段 holdCountRow + withdrawButton で管理。 */}
                    <View style={styles.postBodyText}>
                      <Text style={styles.cardNameInline} numberOfLines={2}>
                        譲：{post.card_name}
                      </Text>
                      {post.group_name != null && (
                        <Text style={styles.subText} numberOfLines={1}>
                          {post.group_name}
                        </Text>
                      )}
                      {post.want_card != null && (
                        <Text
                          style={[styles.wantText, styles.wantTextInline]}
                          numberOfLines={2}
                        >
                          求：{post.want_card}
                        </Text>
                      )}
                      {/* PR-2: 求の詳細 (自由記述)。編集UIが無いため自分の管理画面でも確認できるよう表示。 */}
                      {post.want_detail != null && post.want_detail.trim() !== '' && (
                        <Text style={styles.subText} numberOfLines={2}>
                          求の詳細：{post.want_detail}
                        </Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.cardName}>{post.card_name}</Text>
                    {post.group_name != null && (
                      <Text style={styles.subText}>{post.group_name}</Text>
                    )}
                    {post.want_card != null && (
                      <Text style={styles.wantText}>求: {post.want_card}</Text>
                    )}
                    {/* PR-2: 求の詳細 (自由記述)。編集UIが無いため自分の管理画面でも確認できるよう表示。 */}
                    {post.want_detail != null && post.want_detail.trim() !== '' && (
                      <Text style={styles.subText} numberOfLines={2}>
                        求の詳細: {post.want_detail}
                      </Text>
                    )}
                  </>
                )}

                {count > 0 && (
                  <Pressable
                    style={styles.holdCountRow}
                    onPress={handleOpenReceivedHolds}
                  >
                    <Text style={styles.holdCountText}>
                      🔔 届いた提案: {count} 件
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

                {canReactivate && (
                  <Pressable
                    style={[
                      styles.withdrawButton,
                      isReactivating && styles.buttonDisabled,
                    ]}
                    onPress={() => handleReactivate(post.id)}
                    disabled={isReactivating}
                  >
                    {isReactivating ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.textSecondary}
                      />
                    ) : (
                      <Text style={styles.withdrawButtonText}>再出品する</Text>
                    )}
                  </Pressable>
                )}

                {reactivateBlocked && (
                  <Text style={styles.reactivateBlockedText}>
                    期限切れのため再出品できません
                  </Text>
                )}
                {/* PR-3: held は取り下げボタンを出さない (canWithdraw=false) ため、理由を明示する。 */}
                {status === 'held' && (
                  <Text style={styles.reactivateBlockedText}>
                    交換が成立しているため取り下げできません
                  </Text>
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
  // A1: 再試行UI (holds.tsx と同一トークン)。
  retryButton: {
    marginTop: spacing.md,
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
  // 旧 postImage は image-only branch を分岐化したため未使用、後方互換のため残置。
  postImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    marginVertical: spacing.xs,
  },
  // 画像あり投稿の横型レイアウト (左サムネ + 右テキスト)。一覧で縦幅を抑える。
  postBodyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginVertical: spacing.xs,
  },
  // 画像サイズは venue/[id].tsx の supplyCardThumb と揃える (88 × 117)。
  postThumb: {
    width: 88,
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  // 行間 gap も venue/[id].tsx supplyCardTextStack と揃える (6)。
  // my-posts は Hold 申請ボタンを右カラム内に持たないため、テキスト stack の
  // 自然サイズで上に詰まり、画像が下に少し残る視覚 (acceptable)。
  postBodyText: {
    flex: 1,
    gap: 6,
  },
  // 画像あり時の商品名はフォント拡大して情報の核として強調。
  // 求 (wantTextInline) と同じ size / weight で対の関係を保つ。
  cardNameInline: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  // 画像あり時の求 (wantTextInline) は譲 (cardNameInline) と同じ視覚レベルに揃え、
  // primary 色で交換情報の対として読みやすくする。image-less 経路は wantText 既定値。
  wantTextInline: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    lineHeight: 22,
  },
  cardName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  // 画像あり時の右詳細で可読性を上げるため font 拡大 (画像なし時にも適用、
  // 既存縦並びでも自然に読める範囲)。
  subText: { fontSize: fontSize.sm, color: colors.textTertiary },
  wantText: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.semibold },
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
  // ② 再出品不可 (期限切れ) の理由テキスト (控えめ・非押下)。
  reactivateBlockedText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
})
