// app/venue/[id].tsx
// 会場ホーム画面（β1: 当日供給板を主画面として常時表示）
//
// β1 方針 (本 PR で確定):
//   - 主画面 = 当日供給板。会場に入ったらまず「いま出ている募集」が見える。
//   - 「成立候補」「会場商品棚」レーンは β1 では非表示。
//     機能未実装 placeholder で UX 混乱を生まないため。
//     Hidden from the primary venue surface until the P1 implementation is ready.
//   - P1 follow-up (UI を別 PR で復活させる、優先度は P1):
//     * 会場商品棚レーン (P1-top follow-up): 参加者の棚を会場文脈で閲覧 (要 RLS 設計)
//     * 成立候補レーン (P1 follow-up): 同会場 / Trust / 差額量で自動提案 (要 RPC 設計)
//
// 上部 CTA / quickLinks 構成は維持:
//   - 最上部「届いた Hold (n)」CTA (件数 > 0 時のみ、当該 venue 限定)
//   - quickLinks: 「自分の会場投稿を管理」「送受信のHoldを見る」(常設)
//
// 投稿カード: 写真 / 譲 / 求 / 投稿者 + Trust + 残り時間 + 「Holdする」CTA
// FAB「この会場で出す」: brand #4B3BD6 (β1 主 CTA、SubmitFab に backgroundColor で渡す)
import {
  addSupplyPost,
  fetchReceivedHoldCount,
  fetchSupplyPosts,
  fetchVenue,
  fetchVenueCheckinCount,
  uploadCardImage,
} from '@/lib/supabase'
import { computeTrustBadge, Venue, VenueSupplyPost } from '@/lib/types'
import type { MasterCharacter, MasterItemType } from '@/lib/types'
import {
  getCharacterSuggestions,
  getCharacterSuggestionsAcrossWorks,
  getItemTypeSuggestions,
  recordListingKeyword,
} from '@/lib/master'
import { formatVenueTimeLeft } from '@/lib/venueExpiry'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import { SubmitFab } from '@/components/SubmitFab'
import { TrustBadge } from '@/components/TrustBadge'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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

// β1 会場ホーム ローカル color palette。
// 主 CTA は brand purple、コーラルは「◎一致」「残り僅か」「未読/緊急」に限定、
// グリーンは Trust 良 / 完了 / 開催中 に限定 (主 CTA には使わない)。
// 全体テーマ (constants/theme.ts) は別途 PR で統一予定。本 PR ではこの 1 画面のみ。
const VENUE_COLORS = {
  brand: '#4B3BD6',
  brandTint: '#ECEAFB',
  brandBorder: '#DBD6F7',
  accent: '#FF3E6C',
  accentTint: '#FFE6EC',
  trustGreen: '#15A05A',
  background: '#F7F8FA',
  card: '#FFFFFF',
  border: '#E7E9EF',
  headline: '#15161E',
  body: '#5A5D6B',
  hint: '#9CA0AD',
} as const

function getDisplayName(poster: VenueSupplyPost['poster']): string {
  if (poster == null) return 'ユーザー'
  return poster.handle ?? poster.display_name ?? 'ユーザー'
}

// PR-3.6b: 出品 form の MultiSelectAutocomplete 配下に freeText 追加分を別行で表示する
// 小さな chip リスト。通常出品 (app/listing/new/characters.tsx) の同等セクションを
// インライン化したもの (会場 form は inline 完結 = 別画面遷移なしの即時性優先のため)。
function FreeTextChipsRow({
  items,
  onRemove,
}: {
  items: string[]
  onRemove: (text: string) => void
}) {
  return (
    <View style={freeTextChipsStyles.row}>
      {items.map((t) => (
        <View key={t} style={freeTextChipsStyles.chip}>
          <Text style={freeTextChipsStyles.label}>{t}</Text>
          <Pressable
            onPress={() => onRemove(t)}
            hitSlop={8}
            style={freeTextChipsStyles.clear}
          >
            <Ionicons name="close" size={12} color={colors.primary} />
          </Pressable>
        </View>
      ))}
    </View>
  )
}

const freeTextChipsStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    paddingVertical: 3,
    backgroundColor: colors.background,
  },
  label: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  clear: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

// PR-2: 会場文脈ヘッダー用の和式日付フォーマット。event_date は date 型 ('YYYY-MM-DD')。
// JST 00:00 として解釈し、曜日 (日〜土) を付ける。例: '2026年6月20日(土)'。
const JA_WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const
function formatJaEventDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = JA_WEEKDAYS[d.getDay()]
  return `${y}年${m}月${day}日(${dow})`
}

export default function VenueHomeScreen() {
  const { id: venueId } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  // β1: レーンタブ廃止、当日供給板を常時表示するため lane state は不要。
  const [supplyPosts, setSupplyPosts] = useState<VenueSupplyPost[]>([])
  const [receivedHoldCount, setReceivedHoldCount] = useState(0)
  const [loadingSupply, setLoadingSupply] = useState(false)

  // PR-2: 会場文脈ヘッダー用。venues は RLS 上 SELECT 全員可。
  // fetch 失敗時 (venue=null) はヘッダー非表示にフォールバック。
  const [venue, setVenue] = useState<Venue | null>(null)
  const [checkinCount, setCheckinCount] = useState(0)

  // 供給板投稿フォーム
  const [showPostForm, setShowPostForm] = useState(false)
  const [postCard, setPostCard] = useState('')
  // PR-3.6c: 商品名は譲セクション (メンバー / キャラ + 種別) から自動生成する。
  // ユーザーが手で 1 度でも触ったら dirty=true にして以後自動同期を止め、
  // 手書きで足したシリーズ名等 (例: '2024') を保持する。
  // フォームリセット時 (submit 成功 / form 閉じる) で false に戻して次回再開可能。
  const [postCardDirty, setPostCardDirty] = useState(false)
  const [postImageUri, setPostImageUri] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  // PR-3.6b: 通常出品と同じ master 構造化入力 (master ID + freeText 混在の string[])。
  //   譲側 (characters / item_types): venue.work_id がある場合は作品で絞り込み、
  //     NULL なら作品横断 fallback。
  //   求側 (want_characters / want_item_types): 常に作品横断。
  //   freeText は別 state に分離して chip 表示するパターン (通常出品 characters.tsx と同形)。
  const [postCharacters, setPostCharacters] = useState<MasterCharacter[]>([])
  const [postCharacterFreeTexts, setPostCharacterFreeTexts] = useState<string[]>([])
  const [postItemTypes, setPostItemTypes] = useState<MasterItemType[]>([])
  const [postItemTypeFreeTexts, setPostItemTypeFreeTexts] = useState<string[]>([])
  const [postWantCharacters, setPostWantCharacters] = useState<MasterCharacter[]>([])
  const [postWantCharacterFreeTexts, setPostWantCharacterFreeTexts] = useState<string[]>([])
  const [postWantItemTypes, setPostWantItemTypes] = useState<MasterItemType[]>([])
  const [postWantItemTypeFreeTexts, setPostWantItemTypeFreeTexts] = useState<string[]>([])

  // PR-3.6c: 譲セクション (メンバー / キャラ + 種別) の選択から商品名を自動生成。
  //   形式: '<キャラ表示名> <キャラ表示名> ... <種別表示名> <種別表示名> ...' (半角スペース連結)
  //   - master 選択は display_name_ja (slug ではなく人間可読の表示名) を使う。
  //   - freeText は生文字列 (postCharacterFreeTexts) をそのまま連結。
  //   - postCardDirty===true (= ユーザーが手で触った) のときは上書きしない。
  //   - 全部未選択なら空文字 → 必須バリデーション (postCard.trim()==='') で投稿無効が維持される。
  useEffect(() => {
    if (postCardDirty) return
    const chars = [
      ...postCharacters.map((c) => c.display_name_ja),
      ...postCharacterFreeTexts,
    ]
    const items = postItemTypes.map((t) => t.display_name_ja)
    const derived = [...chars, ...items].join(' ')
    setPostCard(derived)
  }, [postCardDirty, postCharacters, postCharacterFreeTexts, postItemTypes])

  // PR-3.6d-fix: bottom sheet の ScrollView + 4 つの MSA wrap View に ref を持たせ、
  // MSA focus 時にキーボード展開後 (300ms 待ち) でその MSA を可視位置までスクロール。
  // measureLayout を使って当該 MSA View の y 座標を ScrollView 座標系で取得し、
  // 16px の余白を残してその位置に scrollTo する (16 = sheetScrollContent の paddingVertical 相当)。
  const sheetScrollRef = useRef<ScrollView>(null)
  const offerCharRef = useRef<View>(null)
  const offerItemRef = useRef<View>(null)
  const wantCharRef = useRef<View>(null)
  const wantItemRef = useRef<View>(null)
  const scrollToMsa = useCallback((msaRef: React.RefObject<View | null>) => {
    setTimeout(() => {
      msaRef.current?.measureLayout(
        sheetScrollRef.current as unknown as React.ElementRef<typeof View>,
        (_x, y) => {
          sheetScrollRef.current?.scrollTo({ y: y - 16, animated: true })
        },
        () => {},
      )
    }, 300)
  }, [])

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

  // PR-2: venue 行 + チェックイン数を並列取得。失敗時 (venue=null) は
  // 文脈ヘッダー非表示にフォールバック。
  const loadVenueContext = useCallback(async () => {
    if (venueId == null) return
    const [v, c] = await Promise.all([
      fetchVenue(venueId),
      fetchVenueCheckinCount(venueId),
    ])
    setVenue(v)
    setCheckinCount(c)
  }, [venueId])

  // PR-2.1: 「開催中」LIVE ピル内ドットの opacity パルス。
  // 仕様: 1 → 0.4 → 1、duration 1200ms 全周期 (600ms ずつ)、Easing.inOut。
  // status === 'open' のときのみ動作。useNativeDriver=true で軽量化。
  const liveDotOpacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (venue?.status !== 'open') {
      liveDotOpacity.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotOpacity, {
          toValue: 0.4,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(liveDotOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => {
      loop.stop()
    }
  }, [venue?.status, liveDotOpacity])

  // 画面 focus 時に再取得 (Hold 承認 / 拒否後に戻ったときの最新化)
  useFocusEffect(
    useCallback(() => {
      loadSupply()
      loadHoldCount()
      loadVenueContext()
    }, [loadSupply, loadHoldCount, loadVenueContext])
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

      // PR-3.6b: 通常出品 cards と同じく master ID + freeText を合成した string[] で送る。
      // 会場の work_id を出品行にも継承する (NULL 会場は NULL のまま送出)。
      const charactersPayload = [
        ...postCharacters.map((c) => c.id),
        ...postCharacterFreeTexts,
      ]
      const itemTypesPayload = [
        ...postItemTypes.map((t) => t.id),
        ...postItemTypeFreeTexts,
      ]
      const wantCharactersPayload = [
        ...postWantCharacters.map((c) => c.id),
        ...postWantCharacterFreeTexts,
      ]
      const wantItemTypesPayload = [
        ...postWantItemTypes.map((t) => t.id),
        ...postWantItemTypeFreeTexts,
      ]

      // PR-3.6b: group_name / want_card 純テキスト列は後方互換のため DB 上は残すが、
      // フォームからの入力は廃止 (キャラ / 種別の master 構造化に置換)。
      // 既存 supply_post 表示 (group_name 行 / want_card 「指定なし」フォールバック) は
      // PR-4 で characters[] / want_characters[] 表示に置き換わる予定。
      const post = await addSupplyPost({
        venueId,
        userId,
        cardName: postCard.trim(),
        groupName: null,
        wantCard: null,
        imageUrl: uploadedUrl,
        workId: venue?.work_id ?? null,
        characters: charactersPayload,
        itemTypes: itemTypesPayload,
        wantCharacters: wantCharactersPayload,
        wantItemTypes: wantItemTypesPayload,
      })
      // 当日掲示板は他人 post のみ表示 (PR #30) のため、自分の新規 post は
      // ローカル一覧に追加しない。代わりに /venue/my-posts で確認可能。
      // ただし投稿者本人へのフィードバックとして form は閉じてリセット。
      // 既に他人 post が見えている画面上で post 数の見た目は変わらない。
      setPostCard('')
      // PR-3.6c: 次回フォーム開きでも自動派生を再開できるよう dirty を戻す。
      setPostCardDirty(false)
      setPostImageUri(null)
      setPostCharacters([])
      setPostCharacterFreeTexts([])
      setPostItemTypes([])
      setPostItemTypeFreeTexts([])
      setPostWantCharacters([])
      setPostWantCharacterFreeTexts([])
      setPostWantItemTypes([])
      setPostWantItemTypeFreeTexts([])
      setShowPostForm(false)
      // PR-3.6d: Alert を廃止し、シート close アニメーション + 板の即時リロードで
      // 「投稿した感」を出す。自分の post は fetchSupplyPosts(venueId, excludeUserId=me) で
      // 元から除外されるので板自体には現れないが、再取得で他者 post の最新化と
      // loading インジケータの一瞬の明滅により完了フィードバックが伝わる。
      void loadSupply()
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

  // 右下 FAB「この会場で出す」押下時: 出品 form を開く。
  // β1 では当日供給板を常時表示するため、レーン切替は不要。
  const handleOpenVenuePostForm = () => {
    setShowPostForm(true)
  }

  // PR-3.6b: MultiSelectAutocomplete の fetchSuggestions 用 helper。
  //   譲側キャラ: venue.work_id があれば作品で絞り込み (TREASURE 会場で「ハル」→ TREASURE のハルトのみ)、
  //     NULL なら作品横断 fallback (マイナーアーティスト会場でクラッシュ回避)。
  //   求側キャラ: 常に作品横断 (会場の作品 ≠ 求めるグッズの作品の状況を許容)。
  //   種別: 譲 / 求とも作品縛りなし、master_item_types 全体から候補表示。
  const fetchOfferCharacterSuggestions = useCallback(
    (input: string): MasterCharacter[] => {
      const workId = venue?.work_id ?? null
      if (workId == null) {
        return getCharacterSuggestionsAcrossWorks(input)
      }
      return getCharacterSuggestions(input, { workId })
    },
    [venue?.work_id],
  )
  const fetchWantCharacterSuggestions = useCallback(
    (input: string): MasterCharacter[] => getCharacterSuggestionsAcrossWorks(input),
    [],
  )
  const fetchItemTypeSuggestions = useCallback(
    (input: string): MasterItemType[] => getItemTypeSuggestions(input),
    [],
  )

  // PR-3.6b: freeText fallback handler。通常出品 (app/listing/new/characters.tsx) と
  // 同じパターン: dedup + append + recordListingKeyword で運営側に master 追加判断を渡す。
  const makeAddFreeText = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => (text: string) => {
    const trimmed = text.trim()
    if (trimmed === '') return
    setter((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
    if (userId != null) {
      void recordListingKeyword(userId, trimmed)
    }
  }
  const handleAddOfferCharacterFreeText = makeAddFreeText(setPostCharacterFreeTexts)
  const handleAddOfferItemTypeFreeText = makeAddFreeText(setPostItemTypeFreeTexts)
  const handleAddWantCharacterFreeText = makeAddFreeText(setPostWantCharacterFreeTexts)
  const handleAddWantItemTypeFreeText = makeAddFreeText(setPostWantItemTypeFreeTexts)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* PR-2: 会場文脈ヘッダー — どの会場にいるかを示し、開催中状態と参加人数で
          現在地＋臨場感を与える。venue 取得失敗時は非表示 (フォールバック)。
          ナビゲーションバーの Stack title ('会場モード' 固定) は本 PR では触らず、
          画面内ヘッダーで文脈を出す方針。 */}
      {venue != null && (
        <View style={styles.venueContextHeader}>
          <Text style={styles.venueContextTitle} numberOfLines={2}>
            {venue.title}
          </Text>
          <Text style={styles.venueContextSubtitle} numberOfLines={1}>
            {venue.venue_name} · {formatJaEventDate(venue.event_date)}
          </Text>
          <View style={styles.venueContextStatusRow}>
            {venue.status === 'open' ? (
              <>
                {/* PR-2.1: 緑 LIVE ピル (薄緑背景 + 緑文字 + パルスドット)。
                    背景 brand のベタ塗りは禁止 (主 CTA 専用)。緑は
                    status='open' の本ピルのみで使用。 */}
                <View style={styles.venueContextLivePill}>
                  <Animated.View
                    style={[
                      styles.venueContextLiveDot,
                      { opacity: liveDotOpacity },
                    ]}
                  />
                  <Text style={styles.venueContextLiveText}>開催中</Text>
                </View>
                <Text style={styles.venueContextCheckin}>
                  · {checkinCount}人参加中
                </Text>
              </>
            ) : venue.status === 'upcoming' ? (
              <Text style={styles.venueContextHint}>まもなく開催</Text>
            ) : (
              <Text style={styles.venueContextHint}>終了</Text>
            )}
          </View>
        </View>
      )}

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

      {/* β1: レーンタブ廃止。当日供給板を常時主表示。 */}

      {/* 常設クイックリンク: 受信 Hold 0 件でも Hold 一覧 / 自分の投稿に到達可能。
          届いた Hold が 1 件以上ある場合は上部 holdBanner が優先強調。 */}
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

          {/* P1 follow-up (本 PR では UI 非表示、優先度は P1 として残す):
              Hidden from the primary venue surface until the P1 implementation is ready.
                - 会場商品棚レーン (P1-top follow-up): 参加者の棚を会場文脈で閲覧 (要 RLS 設計)
                - 成立候補レーン (P1 follow-up): 同会場 / Trust / 差額量で自動提案 (要 RPC 設計)
              復活時はレーンタブ + 各 lane content を別 PR で追加する。 */}

          {/* ── 当日供給板 (β1 主画面) ── */}
          <View style={styles.supplyHeader}>
            <View style={styles.supplyHeaderText}>
              <Text style={styles.supplyTitle}>いま出ている募集</Text>
              <Text style={styles.supplySub}>
                {loadingSupply
                  ? '読み込み中…'
                  : supplyPosts.length > 0
                  ? `${supplyPosts.length} 件 · 本日中有効`
                  : '本日中有効'}
              </Text>
            </View>
            {/* PR-3.6d: 出品フォームは bottom sheet Modal に分離 (板とフォームの混線解消)。
                以前ここにあった「✕ 閉じる」はシート内 × ボタンに役割を統合した。 */}
          </View>

          {/* PR-3.6d: 出品フォームの inline JSX (画像 / 譲セクション / 求セクション /
              投稿ボタン) は本 PR で bottom sheet Modal (file 末尾) に移植・除去済。
              ScrollView 内には供給板リストのみが残る (板とフォームの混線を解消)。 */}

          {loadingSupply ? (
            <ActivityIndicator color={VENUE_COLORS.brand} style={{ marginTop: 24 }} />
          ) : supplyPosts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>まだ募集がありません</Text>
              <Text style={styles.emptyBody}>
                右下の「この会場で出す」から最初の出品を投稿できます。
              </Text>
            </View>
          ) : (
            supplyPosts.map((post) => {
              // β1 投稿カード:
              //  - 画像 or brand-tint placeholder
              //  - 譲 / グループ / 求
              //  - 投稿者 + TrustBadge + 事実 Trust チップ (取引数 / 発送率)
              //  - 残り時間
              //  - 主 CTA「Holdする」(brand 色)
              const trustLevel =
                post.poster != null
                  ? computeTrustBadge({
                      trade_count: post.poster.trade_count,
                      ship_rate: post.poster.ship_rate,
                      reply_median_hours: 24,
                      trouble_count: post.poster.trouble_count,
                      last_active_at: null,
                    })
                  : null
              return (
                <View key={post.id} style={styles.supplyCard}>
                  <View style={styles.supplyCardRow}>
                    {post.image_url != null ? (
                      <Image
                        source={{ uri: post.image_url }}
                        style={styles.supplyCardThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.supplyCardThumb,
                          styles.supplyCardThumbPlaceholder,
                        ]}
                      >
                        <Ionicons
                          name="image-outline"
                          size={28}
                          color={VENUE_COLORS.brand}
                        />
                      </View>
                    )}

                    <View style={styles.supplyCardDetails}>
                      <Text style={styles.supplyCardFieldLabel}>譲</Text>
                      <Text style={styles.supplyCardName} numberOfLines={2}>
                        {post.card_name}
                      </Text>
                      {post.group_name != null && (
                        <Text style={styles.supplyCardGroup} numberOfLines={1}>
                          {post.group_name}
                        </Text>
                      )}
                      {/* PR-3: 求は常時表示 (Swaply は譲・求両面が価値)。
                          want_card が null の場合は「指定なし」を hint 色で表示。 */}
                      <Text
                        style={[
                          styles.supplyCardFieldLabel,
                          styles.supplyCardFieldLabelSpacer,
                        ]}
                      >
                        求
                      </Text>
                      {post.want_card != null ? (
                        <Text style={styles.supplyCardWant} numberOfLines={1}>
                          {post.want_card}
                        </Text>
                      ) : (
                        <Text
                          style={styles.supplyCardWantNone}
                          numberOfLines={1}
                        >
                          指定なし
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* meta: 投稿者 + Trust チップ + 残り時間 */}
                  <View style={styles.supplyCardMetaRow}>
                    <View style={styles.supplyCardPosterCol}>
                      <View style={styles.supplyCardPosterLine}>
                        <Text style={styles.supplyCardPoster}>
                          @{getDisplayName(post.poster)}
                        </Text>
                        {trustLevel != null && <TrustBadge level={trustLevel} />}
                      </View>
                      {post.poster != null && (
                        <View style={styles.supplyCardTrustChips}>
                          <View style={styles.supplyCardChip}>
                            <Text style={styles.supplyCardChipText}>
                              取引 {post.poster.trade_count}
                            </Text>
                          </View>
                          <View style={styles.supplyCardChip}>
                            <Text style={styles.supplyCardChipText}>
                              発送 {post.poster.ship_rate}%
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                    <Text style={styles.supplyCardTimeLeft}>
                      {formatVenueTimeLeft(post.expires_at)}
                    </Text>
                  </View>

                  {/* β1 主 CTA: brand 色「Holdする」 */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.holdCta,
                      pressed && styles.holdCtaPressed,
                    ]}
                    onPress={() => handleHoldRequest(post)}
                    accessibilityRole="button"
                    accessibilityLabel="Holdする"
                  >
                    <Text style={styles.holdCtaText}>Holdする</Text>
                  </Pressable>
                </View>
              )
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 右下 FAB「この会場で出す」(β1 主 CTA、brand 色 #4B3BD6):
          会場詳細は (tabs) の外で通常 FAB が表示されないため本画面専用に配置。
          β1: 出品 form を開く動線はこの FAB のみに一本化 (inline 「＋」ボタンは廃止)。
          表示条件:
            - Hold 申請モーダル open 中は非表示 (overlay 競合防止)
            - 出品シート open 中は非表示 (PR-3.6d: シート overlay と二重表示防止) */}
      {holdTarget == null && !showPostForm && (
        <SubmitFab
          label="この会場で出す"
          onPress={handleOpenVenuePostForm}
          hasTabBar={false}
          backgroundColor={VENUE_COLORS.brand}
          accessibilityLabel="この会場の当日供給板に出品"
        />
      )}

      {/* PR-3.6d: 出品ボトムシート (Modal slide-up)。
          板 (ScrollView) とフォームを物理分離して以下を解決:
            (1) フォーム表示中に板を見にいけてしまう混線
            (2) キーボードで入力欄が隠れる問題 (KeyboardAvoidingView + 内部 ScrollView)
            (3) フィードバックループの遅さ (Alert → close+reload に置換、handleSubmitPost で実装) */}
      <Modal
        visible={showPostForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPostForm(false)}
      >
        <View style={styles.sheetOverlay}>
          {/* オーバーレイ tap → close。
              本 Pressable は absoluteFill で背面を埋め、シート本体 (後段 child) より
              下のレイヤーに描画されるため、シート上 tap はシートが受け取る (RN の child 順 = z 順)。 */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowPostForm(false)}
            accessibilityLabel="シートを閉じる"
          />

          <KeyboardAvoidingView
            style={styles.sheetContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.sheetCard}>
              {/* drag indicator (視覚のみ、実 drag gesture は本 PR スコープ外) */}
              <View style={styles.sheetHandle} />

              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetTitle}>出品する</Text>
                <Pressable
                  style={styles.sheetClose}
                  onPress={() => setShowPostForm(false)}
                  hitSlop={12}
                  accessibilityLabel="閉じる"
                >
                  <Ionicons name="close" size={24} color={VENUE_COLORS.body} />
                </Pressable>
              </View>

              <ScrollView
                ref={sheetScrollRef}
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* 画像 picker (既存) */}
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

                {/* 譲セクション (PR-3.6b: master 構造化、会場の work_id で絞り込み) */}
                <Text style={styles.sectionLabel}>譲グッズ</Text>

                <View ref={offerCharRef} style={styles.fieldBlock} collapsable={false}>
                  <Text style={styles.fieldLabel}>メンバー / キャラ（任意）</Text>
                  <MultiSelectAutocomplete<MasterCharacter>
                    selected={postCharacters}
                    onChange={setPostCharacters}
                    fetchSuggestions={fetchOfferCharacterSuggestions}
                    getKey={(c) => c.id}
                    renderOption={(c) => (
                      <View>
                        <Text style={styles.msaOptionMain}>{c.display_name_ja}</Text>
                        {c.display_name_en != null && c.display_name_en !== '' && (
                          <Text style={styles.msaOptionSub}>{c.display_name_en}</Text>
                        )}
                      </View>
                    )}
                    renderChip={(c) => (
                      <Text style={styles.msaChipLabel}>{c.display_name_ja}</Text>
                    )}
                    placeholder="例: ハルト, ヨシ"
                    minInputChars={2}
                    softLimit={10}
                    freeTextEnabled
                    onFreeText={handleAddOfferCharacterFreeText}
                    freeTextModalTitle="フリーテキストで追加"
                    freeTextModalBody="マスタにないキャラを追加できます。運営が確認次第マスタに追加されると、検索でヒットしやすくなります。"
                    onFocus={() => scrollToMsa(offerCharRef)}
                  />
                  {postCharacterFreeTexts.length > 0 && (
                    <FreeTextChipsRow
                      items={postCharacterFreeTexts}
                      onRemove={(t) =>
                        setPostCharacterFreeTexts((prev) => prev.filter((x) => x !== t))
                      }
                    />
                  )}
                </View>

                <View ref={offerItemRef} style={styles.fieldBlock} collapsable={false}>
                  <Text style={styles.fieldLabel}>種別（任意）</Text>
                  <MultiSelectAutocomplete<MasterItemType>
                    selected={postItemTypes}
                    onChange={setPostItemTypes}
                    fetchSuggestions={fetchItemTypeSuggestions}
                    getKey={(t) => t.id}
                    renderOption={(t) => (
                      <View>
                        <Text style={styles.msaOptionMain}>{t.display_name_ja}</Text>
                        {t.display_name_en != null && t.display_name_en !== '' && (
                          <Text style={styles.msaOptionSub}>{t.display_name_en}</Text>
                        )}
                      </View>
                    )}
                    renderChip={(t) => (
                      <Text style={styles.msaChipLabel}>{t.display_name_ja}</Text>
                    )}
                    placeholder="例: トレカ, 缶バッジ"
                    minInputChars={2}
                    softLimit={10}
                    freeTextEnabled
                    onFreeText={handleAddOfferItemTypeFreeText}
                    freeTextModalTitle="フリーテキストで追加"
                    freeTextModalBody="マスタにない種別を追加できます。運営が確認次第マスタに追加されます。"
                    onFocus={() => scrollToMsa(offerItemRef)}
                  />
                  {postItemTypeFreeTexts.length > 0 && (
                    <FreeTextChipsRow
                      items={postItemTypeFreeTexts}
                      onRemove={(t) =>
                        setPostItemTypeFreeTexts((prev) => prev.filter((x) => x !== t))
                      }
                    />
                  )}
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>商品名 *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="例：ハルト A ver. トレカ"
                    value={postCard}
                    // PR-3.6c: ユーザー操作で dirty=true にしてから値を反映。
                    // 以後は譲セクション変更があっても自動同期されず、手書きの追記
                    // (例: 'ハルト トレカ 2024') が保持される。
                    onChangeText={(text) => {
                      if (!postCardDirty) setPostCardDirty(true)
                      setPostCard(text)
                    }}
                    autoCorrect={false}
                  />
                </View>

                {/* 求セクション (PR-3.6b: 作品横断、複数候補 OK、空でも出品可) */}
                <Text style={styles.sectionLabel}>求グッズ</Text>

                <View ref={wantCharRef} style={styles.fieldBlock} collapsable={false}>
                  <Text style={styles.fieldLabel}>メンバー / キャラ（任意・作品横断）</Text>
                  <MultiSelectAutocomplete<MasterCharacter>
                    selected={postWantCharacters}
                    onChange={setPostWantCharacters}
                    fetchSuggestions={fetchWantCharacterSuggestions}
                    getKey={(c) => c.id}
                    renderOption={(c) => (
                      <View>
                        <Text style={styles.msaOptionMain}>{c.display_name_ja}</Text>
                        {c.display_name_en != null && c.display_name_en !== '' && (
                          <Text style={styles.msaOptionSub}>{c.display_name_en}</Text>
                        )}
                      </View>
                    )}
                    renderChip={(c) => (
                      <Text style={styles.msaChipLabel}>{c.display_name_ja}</Text>
                    )}
                    placeholder="例: ジヒョン, ハルト"
                    minInputChars={2}
                    softLimit={10}
                    freeTextEnabled
                    onFreeText={handleAddWantCharacterFreeText}
                    freeTextModalTitle="フリーテキストで追加"
                    freeTextModalBody="マスタにないキャラを追加できます。運営が確認次第マスタに追加されます。"
                    onFocus={() => scrollToMsa(wantCharRef)}
                  />
                  {postWantCharacterFreeTexts.length > 0 && (
                    <FreeTextChipsRow
                      items={postWantCharacterFreeTexts}
                      onRemove={(t) =>
                        setPostWantCharacterFreeTexts((prev) =>
                          prev.filter((x) => x !== t),
                        )
                      }
                    />
                  )}
                </View>

                <View ref={wantItemRef} style={styles.fieldBlock} collapsable={false}>
                  <Text style={styles.fieldLabel}>種別（任意）</Text>
                  <MultiSelectAutocomplete<MasterItemType>
                    selected={postWantItemTypes}
                    onChange={setPostWantItemTypes}
                    fetchSuggestions={fetchItemTypeSuggestions}
                    getKey={(t) => t.id}
                    renderOption={(t) => (
                      <View>
                        <Text style={styles.msaOptionMain}>{t.display_name_ja}</Text>
                        {t.display_name_en != null && t.display_name_en !== '' && (
                          <Text style={styles.msaOptionSub}>{t.display_name_en}</Text>
                        )}
                      </View>
                    )}
                    renderChip={(t) => (
                      <Text style={styles.msaChipLabel}>{t.display_name_ja}</Text>
                    )}
                    placeholder="例: トレカ, アクスタ"
                    minInputChars={2}
                    softLimit={10}
                    freeTextEnabled
                    onFreeText={handleAddWantItemTypeFreeText}
                    freeTextModalTitle="フリーテキストで追加"
                    freeTextModalBody="マスタにない種別を追加できます。運営が確認次第マスタに追加されます。"
                    onFocus={() => scrollToMsa(wantItemRef)}
                  />
                  {postWantItemTypeFreeTexts.length > 0 && (
                    <FreeTextChipsRow
                      items={postWantItemTypeFreeTexts}
                      onRemove={(t) =>
                        setPostWantItemTypeFreeTexts((prev) =>
                          prev.filter((x) => x !== t),
                        )
                      }
                    />
                  )}
                </View>

                {/* PR-3.6d: 投稿ボタン (coral / アクション系 CTA、brand 紫は primary CTA 専用)。
                    既存 disabled 条件 (postCard 必須 + posting flag) は維持。 */}
                <Pressable
                  style={[
                    styles.sheetSubmitButton,
                    (postCard.trim() === '' || posting) && styles.sheetSubmitButtonDisabled,
                  ]}
                  onPress={handleSubmitPost}
                  disabled={postCard.trim() === '' || posting}
                >
                  {posting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.sheetSubmitButtonText}>出品する</Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

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
  // PR-2.1: 会場文脈ヘッダー (画面内ヘッダー、最上部)
  // 帯背景を brand tint、境界線を brand border に変えて「会場ゾーン」識別性を出す。
  // brand ベタ塗りはしない (主 CTA 専用)、緑は status='open' のピルのみで使用。
  venueContextHeader: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: VENUE_COLORS.brandTint,
    borderBottomWidth: 1,
    borderBottomColor: VENUE_COLORS.brandBorder,
    gap: 4,
  },
  venueContextTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: VENUE_COLORS.headline,
    lineHeight: 22,
  },
  venueContextSubtitle: {
    fontSize: fontSize.sm,
    color: VENUE_COLORS.body,
  },
  venueContextStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  // PR-2.1: 「開催中」LIVE ピル。proto --green-tint:#E4F5EC を背景に。
  // ※ #E4F5EC は VENUE_COLORS に未定義 (trustGreen tint 系)。本 PR スコープでは
  //   VENUE_COLORS 定義変更不可のため inline で使用。後続 PR で
  //   VENUE_COLORS.trustGreenTint として promote する想定。
  venueContextLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E4F5EC',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  venueContextLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: VENUE_COLORS.trustGreen,
  },
  venueContextLiveText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    color: VENUE_COLORS.trustGreen,
  },
  venueContextCheckin: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: VENUE_COLORS.body,
  },
  venueContextHint: {
    fontSize: fontSize.xs,
    color: VENUE_COLORS.hint,
  },
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
  content: { padding: spacing.base, paddingBottom: 120, gap: spacing.md },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: VENUE_COLORS.headline,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    color: VENUE_COLORS.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  // β1 当日供給板の見出し: 「いま出ている募集」+ {n} 件 · 本日中有効
  supplyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  supplyHeaderText: { gap: 2 },
  supplyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: VENUE_COLORS.headline,
  },
  supplySub: { fontSize: fontSize.xs, color: VENUE_COLORS.hint },
  // β1: form open 時のみ表示する「✕ 閉じる」用。form を開く動線は FAB に一本化したため neutral 配色。
  postButton: {
    backgroundColor: VENUE_COLORS.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: VENUE_COLORS.border,
  },
  // 旧 form-open style は廃止 (showPostForm 時しか表示しないため active 状態は不要)
  postButtonActive: {},
  postButtonText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: VENUE_COLORS.body,
  },
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
  // PR-3.6b: 出品 form の「譲グッズ」「求グッズ」セクション区切りラベル。
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: VENUE_COLORS.brand,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  // PR-3.6b: MultiSelectAutocomplete の renderOption / renderChip 内テキスト用。
  // 通常出品 (app/listing/new/characters.tsx) の同名 style を移植。
  msaOptionMain: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  msaOptionSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  msaChipLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
  },
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
  // ─────────────────────────────────────────
  // PR-3.6d: 出品 bottom sheet Modal
  // ─────────────────────────────────────────
  // 全画面 overlay (半透明黒) — 下端寄せでシートを 75% の高さに置く。
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  // KeyboardAvoidingView をこのコンテナで包む。height: '75%' で画面下から
  // 75% せり上がる構成 (flex: 0.75 相当)。
  sheetContainer: {
    height: '75%',
  },
  // シート本体: 上端角丸の白パネル、上 8px / 水平 16px パディング (spec)。
  sheetCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
    // 軽い上方向 shadow (iOS) / elevation (Android)、せり上がりの「浮遊感」用
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 12,
  },
  // 上端 drag indicator (40x4、丸、#D1D5DB、中央)。視覚のみ (gesture 未配線)。
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 8,
  },
  // ヘッダー行: 中央タイトル + 右上 × ボタン。× は absolute で右に固定。
  sheetTitleRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E7E9EF',
  },
  sheetTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: VENUE_COLORS.headline,
  },
  sheetClose: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // シート本体内 ScrollView (KeyboardAvoidingView → sheetCard → ScrollView)
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingVertical: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  // 出品ボタン (coral / アクション系 CTA、brand 紫は primary CTA 専用)。
  sheetSubmitButton: {
    marginTop: spacing.sm,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: VENUE_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSubmitButtonDisabled: {
    opacity: 0.4,
  },
  sheetSubmitButtonText: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
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
  // β1 投稿カード: 写真 + 譲/求 + 投稿者 + Trust + 残り時間 + Holdする CTA
  supplyCard: {
    backgroundColor: VENUE_COLORS.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: VENUE_COLORS.border,
    gap: spacing.sm,
  },
  // 画像 (or placeholder) + 右詳細 の横型 row。
  supplyCardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  // PR-3: 固定 96x96 正方形 + resizeMode='cover' で全カードのサムネ寸法・形を揃える。
  // 元画像のアスペクト依存を排除し、右テキスト列の高さも安定。
  supplyCardThumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: VENUE_COLORS.background,
  },
  // 画像なし時の placeholder (brand tint + icon)。サムネと同サイズで
  // カード全体のレイアウトを崩さない。
  supplyCardThumbPlaceholder: {
    backgroundColor: VENUE_COLORS.brandTint,
    borderWidth: 1,
    borderColor: VENUE_COLORS.brandBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplyCardDetails: { flex: 1, gap: 2 },
  // 「譲」「求」ラベル: 小さく hint 色で前置きしてから商品名を強調。
  supplyCardFieldLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: VENUE_COLORS.hint,
    letterSpacing: 0.5,
  },
  supplyCardFieldLabelSpacer: { marginTop: spacing.xs },
  supplyCardName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: VENUE_COLORS.headline,
    lineHeight: 22,
  },
  supplyCardGroup: {
    fontSize: fontSize.sm,
    color: VENUE_COLORS.hint,
  },
  // PR-3: 求 want_card は ink (headline) で表示。
  // brand 色は主アクション専用 (CTA / FAB) のためテキストには使わない。
  // 一致強調 (◎一致) はコーラルリボンを別 PR で別途乗せる方針。
  supplyCardWant: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: VENUE_COLORS.headline,
    lineHeight: 20,
  },
  // PR-3: want_card が null 時の「指定なし」placeholder。hint 色 + regular weight で控えめに。
  supplyCardWantNone: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    color: VENUE_COLORS.hint,
    lineHeight: 20,
  },
  // meta 行: 投稿者 + Trust チップ / 残り時間
  supplyCardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: VENUE_COLORS.border,
  },
  supplyCardPosterCol: { flex: 1, gap: 4 },
  supplyCardPosterLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  supplyCardPoster: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: VENUE_COLORS.body,
  },
  // Trust 事実チップ (取引数 / 発送率)。星・レビューは禁止 (Swaply 原則)。
  supplyCardTrustChips: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  supplyCardChip: {
    backgroundColor: VENUE_COLORS.background,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: VENUE_COLORS.border,
  },
  supplyCardChipText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: VENUE_COLORS.body,
  },
  supplyCardTimeLeft: {
    fontSize: fontSize.xs,
    color: VENUE_COLORS.hint,
  },
  // β1 投稿カード主 CTA「Holdする」(brand 色 #4B3BD6)
  holdCta: {
    marginTop: spacing.xs,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: VENUE_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdCtaPressed: { opacity: 0.9 },
  holdCtaText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
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
