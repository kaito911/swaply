// app/venue/supply/[postId].tsx
//
// ⑥-2: 会場供給板カードの出品詳細 (確認 + 交換提案)。供給板 (app/venue/[id].tsx) の
//   画像/カード名の領域タップから到達する。会場は対面で会うため、相手の身元・Trust を
//   ここで確認できるようにする (供給板カード自体には Trust を出さず一覧性を保つ方針)。
//
// 前例: app/offer/preview/[cardId].tsx (画面骨格・loading/loadFailed・写真・Trust ブロック)。
//   相違点:
//     - データ源は fetchSupplyPostById (会場出品)。condition / 説明 / 裏面は存在しない。
//     - 求は formatStructuredWantFields (want_works に work_id 流用) で解決 (供給板と同シム)。
//     - ヘッダーに UserActionsMenu (通報・ブロック) を配線 (dm/[offerId] と同型)。
//     - 「交換を提案」ボタンを置く (会場はその場で急ぐため、戻らせない)。
//
// 出し分け:
//   - UserActionsMenu: tombstone (poster 無し) / 自分の出品 では出さない。
//   - 「交換を提案」: 自分の出品・active 以外 (withdrawn/held)・期限切れ では出さない。
//   - 「交換を提案」の遷移先/params は供給板の handleHoldRequest ([id].tsx:467-487) と同一。

import { ScreenHeader } from '@/components/ScreenHeader'
import { TroubleDot } from '@/components/TroubleDot'
import { TrustFactPanel } from '@/components/TrustFactPanel'
import { UserActionsMenu } from '@/components/UserActionsMenu'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { fetchSupplyPostById, fetchUserTrust, fetchVenue } from '@/lib/supabase'
import { formatStructuredWantFields, getWorkById } from '@/lib/master'
import { formatVenueTimeLeft, isVenueExpired } from '@/lib/venueExpiry'
import { getVenuePostWindow } from '@/lib/venueSearch'
import { VenueSupplyPost, UserTrust } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// 供給板 ([id].tsx:94-97) と同じ投稿者名の解決規約 (handle → display_name → 'ユーザー')。
function posterName(poster: VenueSupplyPost['poster']): string {
  if (poster == null) return 'ユーザー'
  return poster.handle ?? poster.display_name ?? 'ユーザー'
}

export default function VenueSupplyDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>()
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [post, setPost] = useState<VenueSupplyPost | null>(null)
  const [trust, setTrust] = useState<UserTrust | null>(null)
  // PR-3: 交換提案の D-7 ウィンドウ判定に会場の event_date が必要。
  //   supply_post は event_date を持たないため venue を別 fetch して保持する
  //   (expires_at からの逆算は本番データの生成規約が不一致のため採らない)。
  const [venueEventDate, setVenueEventDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // loadFailed = 取得エラー (再試行)。post==null (not-found) とは分けて表示する。
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    if (postId == null || postId === '') {
      setLoading(false)
      setLoadFailed(true)
      return
    }
    setLoading(true)
    setLoadFailed(false)
    try {
      const fetched = await fetchSupplyPostById(postId)
      if (fetched == null) {
        // 期限切れで消えた / 取り下げ済み / 削除済み / RLS 不可視 → not-found 表示。
        setPost(null)
        return
      }
      setPost(fetched)
      // PR-3: D-7 ウィンドウ判定用に会場の event_date を取得 (失敗時は null=提案不可側に倒す)。
      const v = await fetchVenue(fetched.venue_id).catch(() => null)
      setVenueEventDate(v?.event_date ?? null)
      // 出品者 Trust (失敗しても本体表示は止めない・null=「—」)。
      const t = await fetchUserTrust(fetched.user_id).catch(() => null)
      setTrust(t)
    } catch (error) {
      console.error('[VenueSupplyDetail][load]', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [postId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  // ── render ──

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="出品の詳細" />
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (loadFailed) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="出品の詳細" />
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>読み込みに失敗しました</Text>
          <Pressable style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryButtonText}>再試行</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  if (post == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="出品の詳細" />
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>この出品は見つかりませんでした</Text>
          <Text style={styles.emptyBody}>
            すでに交換が成立したか、取り下げ・期限切れになった可能性があります。
          </Text>
          <Pressable style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const hasImage = post.image_url != null && post.image_url !== ''
  // 群名: work_id から master 解決 (供給板 [id].tsx:956-959 と同一)。未解決は行ごと非表示。
  const groupLabel =
    post.work_id != null ? getWorkById(post.work_id)?.display_name_ja ?? '' : ''
  // 求: 供給板 [id].tsx:964-974 と同一シム (want_works に work_id 流用・null なら空配列)。
  const wantFields = formatStructuredWantFields({
    want_works: post.work_id != null ? [post.work_id] : [],
    want_characters: post.want_characters,
    want_item_types: post.want_item_types,
  })
  const wantLine =
    wantFields == null
      ? ''
      : [wantFields.member, wantFields.goods].filter((s) => s !== '').join(' ')

  const name = posterName(post.poster)
  const isTombstone = post.poster == null
  const isOwn = userId != null && post.user_id === userId
  const expired = isVenueExpired(post.expires_at)
  // 交換を提案: 自分以外 & active & 未期限切れ、かつ PR-3 の D-7 ウィンドウ内 (event_date-7〜当日) のみ。
  //   event_date 未取得 (venue fetch 失敗) は提案不可側に倒す (DB の create_venue_hold も同窓で拒否)。
  const canPropose =
    !isOwn &&
    post.status === 'active' &&
    !expired &&
    venueEventDate != null &&
    getVenuePostWindow(venueEventDate) === 'open'
  // 通報・ブロック: tombstone / 自分自身 では出さない。
  const showActions = !isTombstone && !isOwn

  const handlePropose = () => {
    router.push({
      pathname: '/venue/hold',
      params: {
        venueId: post.venue_id,
        postId: post.id,
        receiverId: post.user_id,
        cardName: post.card_name,
        posterName: name,
        wantDisplay: post.want_card ?? '',
        myCardPreset: '',
        workId: post.work_id ?? '',
      },
    } as never)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="出品の詳細"
        rightActions={
          showActions ? (
            <UserActionsMenu userId={post.user_id} userLabel={name} />
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 写真 (大・現物確認用)。会場出品は image_url 1 枚のみ (裏面なし)。 */}
        {hasImage ? (
          <Image
            source={{ uri: post.image_url as string }}
            style={styles.photo}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Ionicons name="image-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.photoEmptyText}>写真なし</Text>
          </View>
        )}

        {/* 譲: カード名 + グループ (未解決は非表示) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>譲</Text>
          <Text style={styles.name}>
            {post.card_name && post.card_name.trim().length > 0
              ? post.card_name
              : 'グッズ情報なし'}
          </Text>
          {groupLabel !== '' && (
            <Text style={styles.groupText}>{groupLabel}</Text>
          )}
        </View>

        {/* 求: 構造化解決した wantLine。空は「指定なし」 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>求</Text>
          <Text style={styles.sectionBody}>
            {wantLine !== '' ? wantLine : '指定なし'}
          </Text>
        </View>

        {/* PR-2: 求の詳細 (自由記述)。あるときのみ全文表示 (null/空は項目ごと非表示)。 */}
        {post.want_detail != null && post.want_detail.trim() !== '' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>求の詳細</Text>
            <Text style={styles.sectionBody}>{post.want_detail}</Text>
          </View>
        )}

        {/* 残り時間 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>有効期限</Text>
          <Text style={styles.sectionBody}>
            {formatVenueTimeLeft(post.expires_at)}
          </Text>
        </View>

        {/* 出品者 Trust (offer/preview と同じ TrustFactPanel 縦4行 + TroubleDot) */}
        <View style={styles.trustSection}>
          <View style={styles.ownerRow}>
            <Text style={styles.ownerName} numberOfLines={1}>
              {name}
            </Text>
            <TroubleDot stage={trust?.trouble_stage ?? 0} />
          </View>
          <TrustFactPanel trust={trust} />
        </View>

        {/* 交換を提案 (canPropose のみ)。遷移先/params は供給板と同一。 */}
        {canPropose ? (
          <Pressable
            style={({ pressed }) => [
              styles.proposeButton,
              pressed && styles.proposeButtonPressed,
            ]}
            onPress={handlePropose}
            accessibilityRole="button"
            accessibilityLabel="交換を提案"
          >
            <Text style={styles.proposeButtonText}>交換を提案</Text>
          </Pressable>
        ) : !isOwn ? (
          // 自分以外で提案不可 (取り下げ済み / held / 期限切れ) の理由を控えめに示す。
          <Text style={styles.unavailableHint}>
            この出品は現在交換を受け付けていません。
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
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
  content: { padding: spacing.base, paddingBottom: spacing['2xl'], gap: spacing.md },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
  },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  photoEmptyText: { fontSize: fontSize.sm, color: colors.textTertiary },
  section: { gap: 4 },
  sectionLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  sectionBody: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  name: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  groupText: { fontSize: fontSize.sm, color: colors.textTertiary },
  trustSection: {
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    padding: spacing.base,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  ownerName: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  proposeButton: {
    marginTop: spacing.sm,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proposeButtonPressed: { opacity: 0.7 },
  proposeButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  unavailableHint: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
})
