// app/venue/[id].tsx
// 会場ホーム画面（3レーン: 成立候補・当日供給板・会場商品棚）
import {
  addSupplyPost,
  fetchSupplyPosts,
  fetchVenueHolds,
  withdrawSupplyPost,
} from '@/lib/supabase'
import { computeTrustBadge, VenueHold, VenueSupplyPost } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { TrustBadge } from '@/components/TrustBadge'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Lane = 'smart' | 'supply' | 'shelf'

function timeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return '期限切れ'
  const mins = Math.floor(diff / 60000)
  return `あと${mins}分`
}

function getDisplayName(poster: VenueSupplyPost['poster']): string {
  if (poster == null) return 'ユーザー'
  return poster.handle ?? poster.display_name ?? 'ユーザー'
}

export default function VenueHomeScreen() {
  const { id: venueId } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [lane, setLane] = useState<Lane>('smart')
  const [supplyPosts, setSupplyPosts] = useState<VenueSupplyPost[]>([])
  const [myHolds, setMyHolds] = useState<VenueHold[]>([])
  const [loadingSupply, setLoadingSupply] = useState(false)

  // 供給板投稿フォーム
  const [showPostForm, setShowPostForm] = useState(false)
  const [postCard, setPostCard] = useState('')
  const [postGroup, setPostGroup] = useState('')
  const [postWant, setPostWant] = useState('')
  const [posting, setPosting] = useState(false)

  // Hold申請モーダル
  const [holdTarget, setHoldTarget] = useState<{
    post: VenueSupplyPost
    myCard: string
  } | null>(null)
  const [myCardInput, setMyCardInput] = useState('')
  const [holdAgreed, setHoldAgreed] = useState(false)
  const [holdSent, setHoldSent] = useState(false)
  const [submittingHold, setSubmittingHold] = useState(false)

  const loadSupply = async () => {
    if (venueId == null) return
    setLoadingSupply(true)
    const posts = await fetchSupplyPosts(venueId)
    setSupplyPosts(posts)
    setLoadingSupply(false)
  }

  const loadHolds = async () => {
    if (venueId == null || userId == null) return
    const holds = await fetchVenueHolds(venueId, userId)
    setMyHolds(holds)
  }

  useEffect(() => {
    loadSupply()
    loadHolds()
  }, [venueId, userId])

  const handleSubmitPost = async () => {
    if (postCard.trim() === '' || userId == null || venueId == null) return
    try {
      setPosting(true)
      const post = await addSupplyPost({
        venueId,
        userId,
        cardName: postCard.trim(),
        groupName: postGroup.trim() !== '' ? postGroup.trim() : null,
        wantCard: postWant.trim() !== '' ? postWant.trim() : null,
      })
      setSupplyPosts((prev) => [post, ...prev])
      setPostCard('')
      setPostGroup('')
      setPostWant('')
      setShowPostForm(false)
    } catch (error) {
      console.error('[VenueHome][handleSubmitPost]', error)
      Alert.alert('エラー', '投稿に失敗しました')
    } finally {
      setPosting(false)
    }
  }

  const handleWithdraw = async (postId: string) => {
    Alert.alert('取り下げますか？', '', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '取り下げる',
        style: 'destructive',
        onPress: async () => {
          try {
            await withdrawSupplyPost(postId)
            setSupplyPosts((prev) => prev.filter((p) => p.id !== postId))
          } catch (error) {
            Alert.alert('エラー', '取り下げに失敗しました')
          }
        },
      },
    ])
  }

  const handleHoldRequest = (post: VenueSupplyPost) => {
    setHoldTarget({ post, myCard: '' })
    setMyCardInput('')
    setHoldAgreed(false)
    setHoldSent(false)
  }

  const handleSubmitHold = async () => {
    if (
      holdTarget == null ||
      myCardInput.trim() === '' ||
      userId == null ||
      venueId == null ||
      !holdAgreed
    ) return

    try {
      setSubmittingHold(true)
      const { createVenueHold } = await import('@/lib/supabase')
      await createVenueHold({
        venueId,
        proposerId: userId,
        receiverId: holdTarget.post.user_id,
        proposerCard: myCardInput.trim(),
        receiverCard: holdTarget.post.card_name,
        supplyPostId: holdTarget.post.id,
      })
      setHoldSent(true)
    } catch (error) {
      console.error('[VenueHome][handleSubmitHold]', error)
      Alert.alert('エラー', 'Hold申請に失敗しました')
    } finally {
      setSubmittingHold(false)
    }
  }

  const LANE_TABS: { key: Lane; label: string }[] = [
    { key: 'smart', label: '成立候補' },
    { key: 'supply', label: '当日供給板' },
    { key: 'shelf', label: '会場商品棚' },
  ]

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* レーンタブ */}
      <View style={styles.laneTabs}>
        {LANE_TABS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.laneTab, lane === t.key && styles.laneTabActive]}
            onPress={() => setLane(t.key)}
          >
            <Text style={[styles.laneTabText, lane === t.key && styles.laneTabTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* ── レーン1: 成立候補 ── */}
          {/* TODO(Phase 2): Smart レーン本実装 — 同会場 / Trust / 差額量による
              候補スコアリング。現状はプレースホルダー表示のみで Supply レーンへ
              誘導している。詳細は docs/phase2-backlog.md を参照。 */}
          {lane === 'smart' && (
            <View style={styles.emptyBox}>
              <Ionicons name="construct-outline" size={36} color={colors.border} />
              <Text style={styles.emptyTitle}>準備中</Text>
              <Text style={styles.emptyBody}>
                成立候補の自動提案は今後追加予定です。{'\n'}
                今は当日供給板で交換相手を探してください。
              </Text>
              <Pressable
                style={styles.smartLaneCta}
                onPress={() => setLane('supply')}
              >
                <Text style={styles.smartLaneCtaText}>当日供給板を見る</Text>
              </Pressable>
            </View>
          )}

          {/* ── レーン2: 当日供給板 ── */}
          {lane === 'supply' && (
            <>
              <View style={styles.supplyHeader}>
                <View>
                  <Text style={styles.supplyTitle}>当日供給板</Text>
                  <Text style={styles.supplySub}>不要カードの短命投稿・自動失効あり</Text>
                </View>
                <Pressable
                  style={[styles.postButton, showPostForm && styles.postButtonActive]}
                  onPress={() => setShowPostForm((f) => !f)}
                >
                  <Text style={styles.postButtonText}>
                    {showPostForm ? '✕ 閉じる' : '＋ 不要カードを投稿'}
                  </Text>
                </Pressable>
              </View>

              {showPostForm && (
                <View style={styles.formCard}>
                  <Text style={styles.formTitle}>不要カードを投稿する（30分で自動失効）</Text>
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>不要カード名 *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="例：ジュンギュ A ver."
                      value={postCard}
                      onChangeText={setPostCard}
                      autoCorrect={false}
                    />
                  </View>
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>グループ</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="例：TREASURE"
                      value={postGroup}
                      onChangeText={setPostGroup}
                      autoCorrect={false}
                    />
                  </View>
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>希望カード</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="例：ヨシ unit（なんでも可）"
                      value={postWant}
                      onChangeText={setPostWant}
                      autoCorrect={false}
                    />
                  </View>
                  <Pressable
                    style={[styles.submitButton, (postCard.trim() === '' || posting) && styles.buttonDisabled]}
                    onPress={handleSubmitPost}
                    disabled={postCard.trim() === '' || posting}
                  >
                    {posting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>投稿する</Text>
                    )}
                  </Pressable>
                </View>
              )}

              {loadingSupply ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
              ) : supplyPosts.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>まだ投稿がありません</Text>
                  <Text style={styles.emptyBody}>不要カードを投稿して交換相手を探しましょう</Text>
                </View>
              ) : (
                supplyPosts.map((post) => (
                  <View key={post.id} style={styles.supplyCard}>
                    <View style={styles.supplyCardTop}>
                      <View style={styles.posterInfo}>
                        <Text style={styles.posterHandle}>@{getDisplayName(post.poster)}</Text>
                        {post.poster != null && (
                          <TrustBadge
                            level={computeTrustBadge({
                              trade_count: post.poster.trade_count,
                              ship_rate: post.poster.ship_rate,
                              reply_median_hours: 24,
                              trouble_count: post.poster.trouble_count,
                              last_active_at: null,
                            })}
                          />
                        )}
                      </View>
                      <Text style={styles.expiresText}>{timeLeft(post.expires_at)}</Text>
                    </View>
                    <Text style={styles.supplyCardName}>{post.card_name}</Text>
                    {post.group_name != null && (
                      <Text style={styles.supplyCardGroup}>{post.group_name}</Text>
                    )}
                    {post.want_card != null && (
                      <Text style={styles.supplyWant}>求: {post.want_card}</Text>
                    )}
                    <View style={styles.supplyCardActions}>
                      {post.user_id === userId ? (
                        <Pressable
                          style={styles.withdrawButton}
                          onPress={() => handleWithdraw(post.id)}
                        >
                          <Text style={styles.withdrawButtonText}>取り下げ</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={styles.holdButton}
                          onPress={() => handleHoldRequest(post)}
                        >
                          <Text style={styles.holdButtonText}>Hold申請 →</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ── レーン3: 会場商品棚 ── */}
          {lane === 'shelf' && (
            <>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  参加者の商品棚を閲覧できます。気になるカードがあればHold申請しましょう。
                </Text>
              </View>
              <View style={styles.emptyBox}>
                <Ionicons name="albums-outline" size={36} color={colors.border} />
                <Text style={styles.emptyTitle}>会場商品棚</Text>
                <Text style={styles.emptyBody}>
                  参加者が増えると商品棚が表示されます。
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Hold申請モーダル */}
      <Modal
        visible={holdTarget != null}
        transparent
        animationType="slide"
        onRequestClose={() => setHoldTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {holdSent ? (
              <>
                <Text style={styles.modalSentIcon}>🎉</Text>
                <Text style={styles.modalSentTitle}>Hold申請を送りました</Text>
                <Text style={styles.modalSentBody}>
                  相手の承認待ちです。{'\n'}
                  承認されるとHold確定（30分有効）になります。{'\n'}
                  その後、手渡し場所を決めて交換完了してください。
                </Text>
                <View style={styles.holdInfoBox}>
                  <Text style={styles.holdInfoText}>
                    Venue Holdは30分で自動失効します。無断失効はTrustに記録されます。
                  </Text>
                </View>
                <Pressable
                  style={styles.submitButton}
                  onPress={() => {
                    setHoldTarget(null)
                    router.push({ pathname: '/venue/holds', params: { venueId } } as never)
                  }}
                >
                  <Text style={styles.submitButtonText}>Hold一覧を見る →</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Venue Hold申請</Text>
                  <Pressable onPress={() => setHoldTarget(null)} style={styles.modalClose}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </Pressable>
                </View>

                {holdTarget != null && (
                  <View style={styles.holdTargetBox}>
                    <Text style={styles.holdTargetLabel}>供給板からのHold</Text>
                    <Text style={styles.holdTargetCard}>{holdTarget.post.card_name}</Text>
                    <Text style={styles.holdTargetPoster}>
                      投稿者: @{getDisplayName(holdTarget.post.poster)}
                      {holdTarget.post.want_card != null ? ` · 求: ${holdTarget.post.want_card}` : ''}
                    </Text>
                  </View>
                )}

                <View style={styles.holdInfoBox}>
                  <Text style={styles.holdInfoText}>
                    申請 → 相手承認 → 30分以内に手渡し で完了。無断失効はTrustに記録されます。
                  </Text>
                </View>

                <View style={styles.bootstrapNote}>
                  <Text style={styles.bootstrapNoteText}>
                    Bootstrap Mode: 差額なし・即手渡し限定
                  </Text>
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>あなたが出すカード *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="例：ハルト A ver."
                    value={myCardInput}
                    onChangeText={setMyCardInput}
                    autoCorrect={false}
                    autoFocus
                  />
                </View>

                <Pressable
                  style={styles.agreeRow}
                  onPress={() => setHoldAgreed((v) => !v)}
                >
                  <View style={[styles.checkbox, holdAgreed && styles.checkboxChecked]}>
                    {holdAgreed && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.agreeText}>
                    会場内での即手渡し・差額なしの条件でHold申請します。承認後は時間内に必ず交換します。
                  </Text>
                </Pressable>

                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelButton} onPress={() => setHoldTarget(null)}>
                    <Text style={styles.cancelButtonText}>キャンセル</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.holdSubmitButton,
                      (!holdAgreed || myCardInput.trim() === '' || submittingHold) && styles.buttonDisabled,
                    ]}
                    onPress={handleSubmitHold}
                    disabled={!holdAgreed || myCardInput.trim() === '' || submittingHold}
                  >
                    {submittingHold ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.holdSubmitButtonText}>Hold申請を送る</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  laneTabs: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.base,
  },
  laneTab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  laneTabActive: { borderBottomColor: colors.primary },
  laneTabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textTertiary,
  },
  laneTabTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  content: { padding: spacing.base, paddingBottom: 120, gap: spacing.md },
  infoBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  infoText: { fontSize: fontSize.xs, color: '#3730A3', lineHeight: 18 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary },
  emptyBody: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  smartLaneCta: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  smartLaneCtaText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  supplyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  supplyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary },
  supplySub: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  postButton: {
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  postButtonActive: { backgroundColor: colors.backgroundMuted, borderColor: colors.border },
  postButtonText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#92400E' },
  formCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: spacing.sm,
  },
  formTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#92400E' },
  fieldBlock: { gap: 4 },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  submitButton: {
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#FFFFFF' },
  buttonDisabled: { opacity: 0.5 },
  supplyCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  supplyCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  posterInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  posterHandle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  expiresText: { fontSize: fontSize.xs, color: colors.textTertiary },
  supplyCardName: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary },
  supplyCardGroup: { fontSize: fontSize.xs, color: colors.textTertiary },
  supplyWant: { fontSize: fontSize.sm, color: colors.primary },
  supplyCardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs },
  holdButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  holdButtonText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#FFFFFF' },
  withdrawButton: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  withdrawButtonText: { fontSize: fontSize.xs, color: colors.textTertiary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 40,
    gap: spacing.md,
  },
  modalSentIcon: { fontSize: 44, textAlign: 'center' },
  modalSentTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: 'center' },
  modalSentBody: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  modalClose: { padding: spacing.xs },
  modalCloseText: { fontSize: fontSize.base, color: colors.textTertiary },
  holdTargetBox: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  holdTargetLabel: { fontSize: fontSize.xs, color: colors.textTertiary },
  holdTargetCard: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary },
  holdTargetPoster: { fontSize: fontSize.xs, color: colors.textSecondary },
  holdInfoBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  holdInfoText: { fontSize: fontSize.xs, color: '#3730A3', lineHeight: 18 },
  bootstrapNote: {
    backgroundColor: '#FFFBEB',
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bootstrapNoteText: { fontSize: fontSize.xs, color: '#92400E' },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { fontSize: 12, color: '#FFFFFF', fontWeight: fontWeight.bold },
  agreeText: { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: { fontSize: fontSize.sm, color: colors.textSecondary },
  holdSubmitButton: {
    flex: 2,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdSubmitButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#FFFFFF' },
})
