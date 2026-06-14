// app/venue/[id].tsx
// 会場ホーム画面（3レーン: 成立候補・当日供給板・会場商品棚）
//
// PR2 (feat/venue-hold-inbox) 追加:
//   - 最上部「届いた Hold (n)」CTA (件数 > 0 時のみ表示、当該 venue 限定)
//   - 当日供給板レーンに「自分の会場投稿を管理 →」リンク → /venue/my-posts
import {
  addSupplyPost,
  fetchReceivedHoldCount,
  fetchSupplyPosts,
  uploadCardImage,
} from '@/lib/supabase'
import { computeTrustBadge, VenueSupplyPost } from '@/lib/types'
import { formatVenueTimeLeft } from '@/lib/venueExpiry'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { TrustBadge } from '@/components/TrustBadge'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
  const [receivedHoldCount, setReceivedHoldCount] = useState(0)
  const [loadingSupply, setLoadingSupply] = useState(false)

  // 供給板投稿フォーム
  const [showPostForm, setShowPostForm] = useState(false)
  const [postCard, setPostCard] = useState('')
  const [postGroup, setPostGroup] = useState('')
  const [postWant, setPostWant] = useState('')
  const [postImageUri, setPostImageUri] = useState<string | null>(null)
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
  // Hold 申請時に「自分が出す商品」へ添付する画像 (任意)。会場現地交換で
  // 取り違えを減らすため、申請段階で画像を見せられるようにする。
  // 画像なしでも従来通り申請できる (DB 列は nullable、RPC は jsonb_strip_nulls)。
  const [holdImageUri, setHoldImageUri] = useState<string | null>(null)

  const loadSupply = useCallback(async () => {
    if (venueId == null) return
    setLoadingSupply(true)
    // 当日掲示板は他人の post のみ表示。自分の post は /venue/my-posts に集約。
    const posts = await fetchSupplyPosts(venueId, userId)
    setSupplyPosts(posts)
    setLoadingSupply(false)
  }, [venueId, userId])

  const loadHoldCount = useCallback(async () => {
    if (venueId == null || userId == null) {
      setReceivedHoldCount(0)
      return
    }
    const count = await fetchReceivedHoldCount(userId, venueId)
    setReceivedHoldCount(count)
  }, [venueId, userId])

  // 画面 focus 時に再取得 (Hold 承認 / 拒否後に戻ったときの最新化)
  useFocusEffect(
    useCallback(() => {
      loadSupply()
      loadHoldCount()
    }, [loadSupply, loadHoldCount])
  )

  const handlePickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        '権限が必要です',
        '写真ライブラリへのアクセスを許可してください。'
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (asset?.uri != null) {
      setPostImageUri(asset.uri)
    }
  }

  const handleClearImage = () => {
    setPostImageUri(null)
  }

  const handleSubmitPost = async () => {
    if (postCard.trim() === '' || userId == null || venueId == null) return
    try {
      setPosting(true)

      // PR3: 画像があれば先に upload して publicUrl を得る。upload 失敗時は
      // DB insert をせず、入力は残して再試行できるようにする。
      let uploadedUrl: string | null = null
      if (postImageUri != null) {
        try {
          const ext =
            postImageUri.split('.').pop()?.split('?')[0] ?? 'jpg'
          uploadedUrl = await uploadCardImage({
            userId,
            imageUri: postImageUri,
            // path 規約: ${userId}/venue-supply/${ts}.${ext}
            // (storage INSERT policy で第 1 階層 = userId が強制されるため、
            //  fileName は 'venue-supply/...' 相対 path とする)
            fileName: `venue-supply/${Date.now()}.${ext}`,
          })
        } catch (uploadErr) {
          console.error('[VenueHome][handleSubmitPost][upload]', uploadErr)
          Alert.alert('エラー', '画像のアップロードに失敗しました')
          return
        }
      }

      const post = await addSupplyPost({
        venueId,
        userId,
        cardName: postCard.trim(),
        groupName: postGroup.trim() !== '' ? postGroup.trim() : null,
        wantCard: postWant.trim() !== '' ? postWant.trim() : null,
        imageUrl: uploadedUrl,
      })
      // 当日掲示板は他人 post のみ表示 (PR #30) のため、自分の新規 post は
      // ローカル一覧に追加しない。代わりに /venue/my-posts で確認可能。
      // ただし投稿者本人へのフィードバックとして form は閉じてリセット。
      // 既に他人 post が見えている画面上で post 数の見た目は変わらない。
      setPostCard('')
      setPostGroup('')
      setPostWant('')
      setPostImageUri(null)
      setShowPostForm(false)
      Alert.alert(
        '投稿しました',
        '自分の会場投稿は「自分の会場投稿を管理」から確認できます。'
      )
      // 後方互換: 既存呼出側で setSupplyPosts に依存している箇所はないため変更なし
      void post
    } catch (error) {
      console.error('[VenueHome][handleSubmitPost]', error)
      Alert.alert('エラー', '投稿に失敗しました')
    } finally {
      setPosting(false)
    }
  }

  const handleHoldRequest = (post: VenueSupplyPost) => {
    setHoldTarget({ post, myCard: '' })
    setMyCardInput('')
    setHoldAgreed(false)
    setHoldSent(false)
    setHoldImageUri(null)
  }

  // Hold 申請モーダル内の画像 picker (PR3 の handlePickImage と同じ仕様、
  // 状態のみ holdImageUri にする)
  const handlePickHoldImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        '権限が必要です',
        '写真ライブラリへのアクセスを許可してください。'
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (asset?.uri != null) {
      setHoldImageUri(asset.uri)
    }
  }

  const handleClearHoldImage = () => {
    setHoldImageUri(null)
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

      // 画像が選択されていれば先に upload して publicUrl を得る。
      // upload 失敗時は DB insert をせず、入力は残して再試行できるようにする
      // (PR3 supply post upload と同じ方針)。
      let uploadedUrl: string | null = null
      if (holdImageUri != null) {
        try {
          const ext = holdImageUri.split('.').pop()?.split('?')[0] ?? 'jpg'
          uploadedUrl = await uploadCardImage({
            userId,
            imageUri: holdImageUri,
            // path 規約: ${userId}/venue-hold/${ts}.${ext}
            // (storage INSERT policy で第 1 階層 = userId が強制されるため、
            //  fileName は 'venue-hold/...' 相対 path とする)
            fileName: `venue-hold/${Date.now()}.${ext}`,
          })
        } catch (uploadErr) {
          console.error('[VenueHome][handleSubmitHold][upload]', uploadErr)
          Alert.alert('エラー', '画像のアップロードに失敗しました')
          return
        }
      }

      const { createVenueHold } = await import('@/lib/supabase')
      await createVenueHold({
        venueId,
        proposerId: userId,
        receiverId: holdTarget.post.user_id,
        proposerCard: myCardInput.trim(),
        receiverCard: holdTarget.post.card_name,
        supplyPostId: holdTarget.post.id,
        proposerImageUrl: uploadedUrl,
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
      {/* 「届いたHold(n)」CTA: 当該 venue 限定の受信 pending Hold が 1 件以上ある時のみ表示 */}
      {receivedHoldCount > 0 && (
        <Pressable
          style={styles.holdBanner}
          onPress={() =>
            router.push({
              pathname: '/venue/holds',
              params: { venueId: venueId ?? '', tab: 'received' },
            } as never)
          }
        >
          <Ionicons name="notifications" size={18} color="#FFFFFF" />
          <Text style={styles.holdBannerText}>
            届いた Hold が {receivedHoldCount} 件あります
          </Text>
          <Text style={styles.holdBannerArrow}>→</Text>
        </Pressable>
      )}

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

      {/* 常設クイックリンク: 受信 Hold 0 件でも Hold 一覧 / 自分の投稿に到達可能。
          全レーンで表示。届いた Hold が 1 件以上ある場合は上部 holdBanner が優先強調。 */}
      <View style={styles.quickLinksRow}>
        <Pressable
          style={styles.quickLink}
          onPress={() =>
            router.push({
              pathname: '/venue/my-posts',
              params: { venueId: venueId ?? '' },
            } as never)
          }
        >
          <Ionicons
            name="person-circle-outline"
            size={16}
            color={colors.primary}
          />
          <Text style={styles.quickLinkText}>自分の会場投稿を管理</Text>
          <Text style={styles.quickLinkArrow}>→</Text>
        </Pressable>
        <Pressable
          style={styles.quickLink}
          onPress={() =>
            router.push({
              pathname: '/venue/holds',
              params: { venueId: venueId ?? '', tab: 'received' },
            } as never)
          }
        >
          <Ionicons name="list-outline" size={16} color={colors.primary} />
          <Text style={styles.quickLinkText}>送受信のHoldを見る</Text>
          <Text style={styles.quickLinkArrow}>→</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                  <Text style={styles.supplySub}>イベント当日23:59まで有効</Text>
                </View>
                <Pressable
                  style={[styles.postButton, showPostForm && styles.postButtonActive]}
                  onPress={() => setShowPostForm((f) => !f)}
                >
                  <Text style={styles.postButtonText}>
                    {showPostForm ? '✕ 閉じる' : '＋ 会場で交換に出す'}
                  </Text>
                </Pressable>
              </View>


              {showPostForm && (
                <View style={styles.formCard}>
                  <Text style={styles.formTitle}>会場で交換に出す（イベント当日23:59まで有効）</Text>

                  {/* PR3: 画像追加 UI (任意) */}
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>画像（任意）</Text>
                    {postImageUri != null ? (
                      <View style={styles.imagePreviewWrap}>
                        <Image
                          source={{ uri: postImageUri }}
                          style={styles.imagePreview}
                          resizeMode="cover"
                        />
                        <View style={styles.imageActions}>
                          <Pressable
                            style={styles.imageActionButton}
                            onPress={handlePickImage}
                          >
                            <Text style={styles.imageActionText}>変更</Text>
                          </Pressable>
                          <Pressable
                            style={styles.imageActionButton}
                            onPress={handleClearImage}
                          >
                            <Text style={styles.imageActionText}>削除</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.imagePickerButton}
                        onPress={handlePickImage}
                      >
                        <Ionicons
                          name="image-outline"
                          size={20}
                          color={colors.primary}
                        />
                        <Text style={styles.imagePickerText}>画像を選択</Text>
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>譲商品名 *</Text>
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
                    <Text style={styles.fieldLabel}>求商品</Text>
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
                  <Text style={styles.emptyBody}>会場で譲商品を投稿して、相手を探しましょう</Text>
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
                      <Text style={styles.expiresText}>{formatVenueTimeLeft(post.expires_at)}</Text>
                    </View>
                    {/* 一覧性優先: 画像ありは横型 (左サムネ + 右テキスト + 右下に
                        Hold 申請ボタン) でカード縦幅を圧縮。情報の塊として
                        見えるよう、Hold ボタンも右詳細内に含めて画像と縦位置を揃える。
                        画像なしは既存の縦並びを温存、Hold ボタンは下段 supplyCardActions。 */}
                    {post.image_url != null ? (
                      <View style={styles.supplyCardBodyRow}>
                        <Image
                          source={{ uri: post.image_url }}
                          style={styles.supplyCardThumb}
                          resizeMode="cover"
                        />
                        {/* 右詳細: 上から「譲：name → group → 求：want → Hold申請」
                            の 4 行構成。会場では一瞬で譲・求を読み取れることを優先、
                            Hold 申請は右カラム幅いっぱいの主要 CTA として下に配置。 */}
                        <View style={styles.supplyCardBodyText}>
                          <View style={styles.supplyCardTextStack}>
                            <Text
                              style={styles.supplyCardNameInline}
                              numberOfLines={2}
                            >
                              譲：{post.card_name}
                            </Text>
                            {post.group_name != null && (
                              <Text style={styles.supplyCardGroup} numberOfLines={1}>
                                {post.group_name}
                              </Text>
                            )}
                            {post.want_card != null && (
                              <Text
                                style={[styles.supplyWant, styles.supplyWantInline]}
                                numberOfLines={2}
                              >
                                求：{post.want_card}
                              </Text>
                            )}
                          </View>
                          <Pressable
                            style={[styles.holdButton, styles.holdButtonInline]}
                            onPress={() => handleHoldRequest(post)}
                          >
                            <Text
                              style={[
                                styles.holdButtonText,
                                styles.holdButtonInlineText,
                              ]}
                            >
                              Hold申請
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.supplyCardName}>{post.card_name}</Text>
                        {post.group_name != null && (
                          <Text style={styles.supplyCardGroup}>{post.group_name}</Text>
                        )}
                        {post.want_card != null && (
                          <Text style={styles.supplyWant}>求: {post.want_card}</Text>
                        )}
                      </>
                    )}
                    {/* PR feat/venue-supply-board-exclude-own-posts:
                        当日掲示板は他人の post のみ表示するため、Hold 申請のみ常設。
                        自分の post 管理は /venue/my-posts に集約。
                        画像ありの場合は上の右詳細内ボタンを表示するため、ここは画像なし時のみ。 */}
                    {post.image_url == null && (
                      <View style={styles.supplyCardActions}>
                        <Pressable
                          style={styles.holdButton}
                          onPress={() => handleHoldRequest(post)}
                        >
                          <Text style={styles.holdButtonText}>Hold申請 →</Text>
                        </Pressable>
                      </View>
                    )}
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
        {/* Modal 内 KeyboardAvoidingView: TextInput focus 時に modalSheet を
            キーボード上に押し上げる。ページレベル (line 353 周辺) と同じ behavior
            パターンを mirror。 */}
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            {holdSent ? (
              <>
                <Text style={styles.modalSentIcon}>🎉</Text>
                <Text style={styles.modalSentTitle}>Hold申請を送りました</Text>
                <Text style={styles.modalSentBody}>
                  相手の承認待ちです。{'\n'}
                  承認されるとHoldが確定します。{'\n'}
                  イベント当日中に手渡し場所を決めて交換完了してください。
                </Text>
                <View style={styles.holdInfoBox}>
                  <Text style={styles.holdInfoText}>
                    Venue Holdはイベント当日23:59まで有効です。
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
              // ScrollView: フォーム高さ > 利用可能領域 (キーボード表示時) の
              // ケースをカバー。keyboardShouldPersistTaps='handled' で image picker /
              // 同意 checkbox / 送信ボタン tap 時にキーボードが先に閉じない。
              <ScrollView
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
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
                    申請 → 相手承認 → イベント当日中に手渡し で完了。
                  </Text>
                </View>

                {/* 画像 (任意): 現地交換での取り違え防止のため、申請者側商品の
                    写真を相手に見せられるようにする。画像なしでも送信可能。
                    upload は handleSubmitHold で送信時にまとめて実行する。 */}
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>画像（任意）</Text>
                  {holdImageUri != null ? (
                    <View style={styles.imagePreviewWrap}>
                      <Image
                        source={{ uri: holdImageUri }}
                        style={styles.imagePreview}
                        resizeMode="cover"
                      />
                      <View style={styles.imageActions}>
                        <Pressable
                          style={styles.imageActionButton}
                          onPress={handlePickHoldImage}
                        >
                          <Text style={styles.imageActionText}>変更</Text>
                        </Pressable>
                        <Pressable
                          style={styles.imageActionButton}
                          onPress={handleClearHoldImage}
                        >
                          <Text style={styles.imageActionText}>削除</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.imagePickerButton}
                      onPress={handlePickHoldImage}
                    >
                      <Ionicons
                        name="image-outline"
                        size={20}
                        color={colors.primary}
                      />
                      <Text style={styles.imagePickerText}>画像を選択</Text>
                    </Pressable>
                  )}
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>あなたが出すグッズ *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="例：ハルト A ver."
                    value={myCardInput}
                    onChangeText={setMyCardInput}
                    autoCorrect={false}
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
                    会場内での即手渡し条件でHold申請します。承認後は時間内に必ず交換します。
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
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  holdBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#D97706',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  holdBannerText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  holdBannerArrow: {
    fontSize: fontSize.base,
    color: '#FFFFFF',
    fontWeight: fontWeight.bold,
  },
  quickLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  quickLinkText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  quickLinkArrow: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
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
  // PR3: 画像 picker / preview
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.background,
    alignSelf: 'flex-start',
  },
  imagePickerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  imagePreviewWrap: { gap: spacing.xs },
  imagePreview: {
    width: '60%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  imageActions: { flexDirection: 'row', gap: spacing.sm },
  imageActionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageActionText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
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
  // 旧 supplyCardImage は image-only branch を分岐化したため未使用、後方互換のため残置。
  supplyCardImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    marginVertical: spacing.xs,
  },
  // 画像あり投稿の横型レイアウト (左サムネ + 右詳細 + 右下に Hold ボタン)。
  // alignItems='stretch' で右 column を画像高さに合わせて伸ばし、
  // supplyCardBodyText の justifyContent='space-between' で stack を上端、
  // Hold ボタンを下端に anchor。残り空間を 1 箇所 (stack と button の間) に
  // 集約することで「Hold の下にも余白」状態を防ぎ、左右が 1 つの塊に見える。
  supplyCardBodyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
    marginVertical: spacing.xs,
  },
  supplyCardThumb: {
    width: 88,
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  // 右詳細 column。flex:1 で残り全幅を確保。justifyContent='space-between' で
  // stack を上端 / button を下端に分配。残り空間は 1 箇所のみに出る (求とボタンの間)。
  supplyCardBodyText: {
    flex: 1,
    justifyContent: 'space-between',
  },
  // テキスト stack は自然な縦サイズで上端に配置。行間 gap は 6 で息継ぎを確保。
  supplyCardTextStack: {
    gap: 6,
  },
  // 画像あり時の商品名はフォント拡大して情報の核として強調。
  // 求 (supplyWantInline) と同じ size / weight で対の関係を保つ。
  supplyCardNameInline: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  // 画像あり時の求 (supplyWantInline) は譲 (supplyCardNameInline) と同じ
  // 視覚レベル (lg + bold + lineHeight 22) に揃え、primary 色で交換情報の
  // 対として読みやすくする。image-less 経路は供給 supplyWant を従来通り使用。
  supplyWantInline: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    lineHeight: 22,
  },
  // 画像あり時の Hold ボタンを右詳細 column 内の 4 行目として stretch 配置。
  // 押しやすさは維持しつつ縦 padding を spacing.sm (8) に揃え総高さを整える。
  // marginTop は不要 (column の justifyContent='space-between' が下端 anchor を担当)。
  holdButtonInline: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  holdButtonInlineText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  supplyCardName: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary },
  // 画像あり時のグループ名 / 求は font 拡大して右詳細の余白を埋め、可読性を上げる。
  supplyCardGroup: { fontSize: fontSize.sm, color: colors.textTertiary },
  supplyWant: { fontSize: fontSize.base, color: colors.primary, fontWeight: fontWeight.semibold },
  supplyCardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs },
  holdButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  holdButtonText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#FFFFFF' },
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
    // キーボード表示時に ScrollView 内部を縦スクロール可能領域に制限する。
    // KeyboardAvoidingView と組み合わせて、長いフォームでも全フィールドに
    // 到達できるようにする (image preview + テキスト入力 + 同意 + 送信ボタン)。
    maxHeight: '90%',
  },
  // Hold 申請モーダル内 ScrollView 用 contentContainer。
  // modalSheet 自体の gap は holdSent 成功表示用に温存、scroll 側にも同じ gap を与える。
  modalScrollContent: {
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
