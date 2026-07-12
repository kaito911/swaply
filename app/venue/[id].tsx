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
  fetchMySupplyPosts,
  fetchReceivedHoldCount,
  fetchSupplyPosts,
  fetchVenue,
  fetchVenueCheckinCount,
  isVenueLoadFailure,
} from '@/lib/supabase'
import { computeTrustBadge, Venue, VenueSupplyPost } from '@/lib/types'
import type { MasterCharacter } from '@/lib/types'
import {
  getCharacterSuggestionsAcrossWorks,
  getItemTypeById,
} from '@/lib/master'
import { formatVenueTimeLeft } from '@/lib/venueExpiry'
import { LinearGradient } from 'expo-linear-gradient'
import { LiveBadge, VenueAvatarStack } from '@/components/venue/LiveElements'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import { SubmitFab } from '@/components/SubmitFab'
import { TrustBadge } from '@/components/TrustBadge'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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

// 段階3-B: 会場の中の背景グラデ (上=非日常の紫 → 下=供給板の白)。プロト実数値。
// 上部ステージ看板を紫に沈め、下の供給板 (白カード) を #F6F0FA の淡い床に乗せる。
const VENUE_ROOM_GRADIENT = ['#3B1E6E', '#6B2E96', '#F6F0FA', '#F6F0FA'] as const
const VENUE_ROOM_LOCATIONS = [0, 0.22, 0.55, 1] as const

function getDisplayName(poster: VenueSupplyPost['poster']): string {
  if (poster == null) return 'ユーザー'
  return poster.handle ?? poster.display_name ?? 'ユーザー'
}

// PR-6: 双方向マッチペア (自分の出品 myPost ⇄ 相手の出品 theirPost) のデータ型。
// レーン UI のカードキー + Hold モーダル open 時の preset 値ソース。
// matchedOfferSlugs / matchedWantSlugs は将来サブラベルやデバッグ用 (本 PR では未表示)。
type MutualMatchPair = {
  myPost: VenueSupplyPost
  theirPost: VenueSupplyPost
  matchedOfferSlugs: string[]
  matchedWantSlugs: string[]
}

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
  // PR-4: 自分の会場出品 (fetchMySupplyPosts) を保持。マッチ計算 (リボン表示) の
  // データソースになる。fetchSupplyPosts は自分の post を除外するため別 fetch が必要。
  const [mySupplyPosts, setMySupplyPosts] = useState<VenueSupplyPost[]>([])

  // PR-2: 会場文脈ヘッダー用。venues は RLS 上 SELECT 全員可。
  // fetch 失敗時 (venue=null) はヘッダー非表示にフォールバック。
  const [venue, setVenue] = useState<Venue | null>(null)
  const [checkinCount, setCheckinCount] = useState(0)
  // PR-V1: checkinCount だけ「取得失敗」と「0 件」を区別したい (venue 取得は成功し
  // 会場名は出ているのに、人数だけ取れなかった状態を「— 人参加中」で表現)。
  // venue 自体の失敗判定は既存の venue==null fallback で代用 (V2 で venueFailed 追加余地)。
  const [checkinCountFailed, setCheckinCountFailed] = useState(false)
  // PR-V2: 当日供給板 (fetchSupplyPosts) の失敗フラグ。
  //   初期 false、正常 fetch で false 維持、VenueFetchTimeoutError 時のみ true。
  //   状態優先順位: loadingSupply > supplyLoadFailed > 検索 0 件 > 全件 0 件 > データ表示。
  //   再試行成功時に false に戻すため、loadSupply の冒頭で setSupplyLoadFailed(false) を呼ぶ。
  const [supplyLoadFailed, setSupplyLoadFailed] = useState(false)

  // PR-3.5: 会場内検索 (クライアントフィルタ、DB クエリ追加なし)。
  //   検索バーは bottom sheet の外、メイン供給板エリアの ScrollView 内にあるため、
  //   focus 時に scroll させたい対象は mainScrollRef (sheetScrollRef ではない)。
  //   scrollToMsa と同じ measureLayout パターンを mainScrollRef 上で再利用。
  const [searchCharacters, setSearchCharacters] = useState<MasterCharacter[]>([])
  const mainScrollRef = useRef<ScrollView>(null)
  const searchBarRef = useRef<View>(null)
  const scrollToSearch = useCallback(() => {
    setTimeout(() => {
      searchBarRef.current?.measureLayout(
        mainScrollRef.current as unknown as React.ElementRef<typeof View>,
        (_x, y) => {
          mainScrollRef.current?.scrollTo({ y: y - 16, animated: true })
        },
        () => {},
      )
    }, 300)
  }, [])

  // PR-3.5: 会場内検索フィルタ (クライアントサイド、DB クエリ追加なし)。
  //   - searchCharacters が空なら全件返す。
  //   - master slug overlap: characters[] / want_characters[] のいずれかに含まれる post を採用
  //     (PR-3.6b 以降に作成された structured post 用)。
  //   - legacy fallback: card_name / want_card のテキスト部分一致
  //     (PR-3.6b 以前の post、または freeText のみで投稿された post 用)。
  //   - 比較は display_name_ja の lowerCase で行う (英表記との混在は本 PR 範囲外)。
  // PR-4: マッチリボン用の自分側 slug 集合 (exact slug overlap、fuzzy 不使用)。
  //   会場 wanted_cards テーブルは β1 では使わず、会場出品 (mySupplyPosts) の
  //   want_characters / characters / want_item_types を「会場マッチの原点」として扱う。
  const myWantSlugs = useMemo(
    () => mySupplyPosts.flatMap((p) => p.want_characters ?? []),
    [mySupplyPosts],
  )
  const myOfferSlugs = useMemo(
    () => mySupplyPosts.flatMap((p) => p.characters ?? []),
    [mySupplyPosts],
  )
  const myWantItemTypes = useMemo(
    () => mySupplyPosts.flatMap((p) => p.want_item_types ?? []),
    [mySupplyPosts],
  )

  // PR-6: 双方向マッチペア (自分の出品 X ⇄ 相手の出品 Y) を全件列挙。
  //   ペア条件:
  //     - 相手の譲 (theirOffer) ∩ 自分の求 (myWant) が 1 件以上
  //     - 自分の譲 (myOffer) ∩ 相手の求 (theirWant) が 1 件以上
  //   両方成立した組合せのみ採用 (片方向マッチはレーン非表示、PR-4 のリボンが拾う)。
  //   dedup しない (同じ相手 post に自分の複数 post でマッチしたら別カードとして並ぶ)。
  //   検索フィルタは無視して supplyPosts 全件を母集合にする (検索中でもマッチは表示)。
  const mutualPairs = useMemo<MutualMatchPair[]>(() => {
    const pairs: MutualMatchPair[] = []
    for (const myPost of mySupplyPosts) {
      const myOffer = myPost.characters ?? []
      const myWant = myPost.want_characters ?? []
      if (myOffer.length === 0 && myWant.length === 0) continue
      for (const theirPost of supplyPosts) {
        const theirOffer = theirPost.characters ?? []
        const theirWant = theirPost.want_characters ?? []
        const matchedWant = theirOffer.filter((s) => myWant.includes(s))
        const matchedOffer = theirWant.filter((s) => myOffer.includes(s))
        if (matchedWant.length > 0 && matchedOffer.length > 0) {
          pairs.push({
            myPost,
            theirPost,
            matchedOfferSlugs: matchedOffer,
            matchedWantSlugs: matchedWant,
          })
        }
      }
    }
    // ソート: 一致度 (matchedOffer + matchedWant の合計) 降順、同点は相手 post の created_at 降順
    pairs.sort((a, b) => {
      const aScore = a.matchedOfferSlugs.length + a.matchedWantSlugs.length
      const bScore = b.matchedOfferSlugs.length + b.matchedWantSlugs.length
      if (bScore !== aScore) return bScore - aScore
      return (b.theirPost.created_at ?? '').localeCompare(
        a.theirPost.created_at ?? '',
      )
    })
    return pairs
  }, [mySupplyPosts, supplyPosts])

  const filteredPosts = useMemo(() => {
    if (searchCharacters.length === 0) return supplyPosts
    const searchSlugs = searchCharacters.map((c) => c.id)
    const searchNames = searchCharacters.map((c) => c.display_name_ja.toLowerCase())
    return supplyPosts.filter((post) => {
      const inChars = (post.characters ?? []).some((s) => searchSlugs.includes(s))
      const inWant = (post.want_characters ?? []).some((s) => searchSlugs.includes(s))
      const inLegacy = searchNames.some(
        (name) =>
          (post.card_name ?? '').toLowerCase().includes(name) ||
          (post.want_card ?? '').toLowerCase().includes(name),
      )
      return inChars || inWant || inLegacy
    })
  }, [supplyPosts, searchCharacters])


  // PR-V1: 各 load 関数に try/catch を追加。VenueFetchTimeoutError を捕捉して
  //   既存の silent fallback (空配列 / null / 0) と同じ挙動に倒す。
  //   想定外のエラーは上位に throw して Sentry 等で検知可能にする。
  //   loadingSupply は finally で確実に false に戻し、無限スピン防止。
  const loadSupply = useCallback(async () => {
    if (venueId == null) return
    setLoadingSupply(true)
    // PR-V2: ★ 状態リセット — 冒頭で必ず failed=false に戻す。
    //   再試行成功時に失敗フラグが残り続けるバグを防ぐ。
    setSupplyLoadFailed(false)
    try {
      // 当日掲示板は他人の post のみ表示。自分の post は /venue/my-posts に集約。
      const posts = await fetchSupplyPosts(venueId, userId)
      setSupplyPosts(posts)
    } catch (err) {
      // PR-V2-fix: タイムアウトに加え、機内モード/圏外で発生する
      //   TypeError: Network request failed もネットワーク起因として failed 扱いにする。
      //   想定外の本物のバグは re-throw で上位に伝播。
      if (isVenueLoadFailure(err)) {
        console.warn('[VenueHome][loadSupply]', err instanceof Error ? err.message : String(err))
        // PR-V1 互換: 既存の silent fallback (空配列) は維持。
        // PR-V2 で追加: failed フラグを true にして UI 出し分けを起動。
        setSupplyPosts([])
        setSupplyLoadFailed(true)
      } else {
        throw err
      }
    } finally {
      setLoadingSupply(false)
    }
  }, [venueId, userId])

  const loadHoldCount = useCallback(async () => {
    if (venueId == null || userId == null) {
      setReceivedHoldCount(0)
      return
    }
    try {
      const count = await fetchReceivedHoldCount(userId, venueId)
      setReceivedHoldCount(count)
    } catch (err) {
      // PR-V2-fix: ネットワーク起因 (timeout + RN fetch エラー) を共通判定で握り、
      //   既存の 0 fallback を維持。それ以外は re-throw (本物のバグを伝播)。
      if (isVenueLoadFailure(err)) {
        console.warn('[VenueHome][loadHoldCount]', err instanceof Error ? err.message : String(err))
        setReceivedHoldCount(0)
      } else {
        throw err
      }
    }
  }, [venueId, userId])

  // PR-2 → PR-V1: venue 行 + チェックイン数を並列取得。
  //   Promise.all で両方 fallback だと「checkinCount 失敗で会場名まで消える」最悪状態。
  //   PR-V1 では Promise.allSettled で並列維持 + 個別判定し、venue が取れれば会場名を出す。
  //   checkinCount だけが失敗した場合は checkinCountFailed=true で UI 側が「— 人参加中」表示。
  const loadVenueContext = useCallback(async () => {
    if (venueId == null) return
    const [vResult, cResult] = await Promise.allSettled([
      fetchVenue(venueId),
      fetchVenueCheckinCount(venueId),
    ])

    // venue: 成功 → setVenue / 失敗 (timeout 等) → null fallback (会場文脈ヘッダー非表示)。
    //   既存の null 判定 (venue != null && ...) と同じ挙動を維持。
    //   V2 で venueFailed state を追加するなら本 catch 内でセットする余地。
    if (vResult.status === 'fulfilled') {
      setVenue(vResult.value)
    } else {
      // PR-V2-fix: ネットワーク起因 (timeout + RN fetch エラー) は warn 扱い、
      //   それ以外 (想定外の本物のバグ) は error 扱いで Sentry 等に拾わせる。
      if (isVenueLoadFailure(vResult.reason)) {
        console.warn('[VenueHome][loadVenueContext] venue', vResult.reason instanceof Error ? vResult.reason.message : String(vResult.reason))
      } else {
        console.error('[VenueHome][loadVenueContext] venue', vResult.reason)
      }
      setVenue(null)
    }

    // checkinCount: 成功 → setCheckinCount + Failed=false / 失敗 → Failed=true。
    //   既存値は保持して画面ちらつきを抑制 (UI 側で Failed=true なら「—」表示)。
    if (cResult.status === 'fulfilled') {
      setCheckinCount(cResult.value)
      setCheckinCountFailed(false)
    } else {
      // PR-V2-fix: 同上、ネットワーク起因は warn / 本物のバグは error。
      if (isVenueLoadFailure(cResult.reason)) {
        console.warn('[VenueHome][loadVenueContext] checkinCount', cResult.reason instanceof Error ? cResult.reason.message : String(cResult.reason))
      } else {
        console.error('[VenueHome][loadVenueContext] checkinCount', cResult.reason)
      }
      setCheckinCountFailed(true)
    }
  }, [venueId])

  // PR-4: 自分の会場出品を取得 (マッチリボン計算用のデータソース)。
  // userId が null (未ログイン) なら空配列に戻し、リボン非表示にフォールバック。
  const loadMySupplyPosts = useCallback(async () => {
    if (venueId == null || userId == null) {
      setMySupplyPosts([])
      return
    }
    try {
      const posts = await fetchMySupplyPosts(venueId, userId)
      setMySupplyPosts(posts)
    } catch (err) {
      // PR-V2-fix: ネットワーク起因 (timeout + RN fetch エラー) を共通判定で握り、
      //   既存の空配列 fallback を維持。それ以外は re-throw (本物のバグを伝播)。
      if (isVenueLoadFailure(err)) {
        console.warn('[VenueHome][loadMySupplyPosts]', err instanceof Error ? err.message : String(err))
        setMySupplyPosts([])
      } else {
        throw err
      }
    }
  }, [venueId, userId])

  // item7 (旧 段階4/E): 会場入場アニメ。会場に入る度に「毎回」再生し、演出をやや強める
  //   (初回だけだと地味で気づかれないため)。①背景グラデがフェードイン (暗い紫 →
  //   ステージ点灯)、②ステージ看板 (LIVE 含む) が迫り上がりつつ微スケールで点灯。
  //   過剰にならないよう ~0.78s / useNativeDriver=true でテンポと軽さを維持。
  const entrance = useRef(new Animated.Value(0)).current
  useEffect(() => {
    entrance.setValue(0)
    const anim = Animated.timing(entrance, {
      toValue: 1,
      duration: 780,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    })
    anim.start()
    return () => anim.stop()
  }, [entrance, venueId])
  // 看板の迫り上がり (translateY 18 → 0) + 微スケール (0.98 → 1)。opacity は entrance を使う。
  const headerRise = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  })
  const headerScale = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1],
  })

  // PR-V2-fix3: 会場詳細の主要データを一括再取得するエントリ。
  //   useFocusEffect (画面入り直し) と「うまく読み込めませんでした」再試行ボタンの
  //   両方から呼ぶ。各 load は独立した try/catch + 失敗フラグ管理を持つので、
  //   ここでは並列起動するだけ (await しない)。
  //
  //   再試行ボタンで本関数を呼ぶことで、loadSupply (supplyPosts) に加え
  //   loadMySupplyPosts (mySupplyPosts) も再取得され、依存している
  //   マッチレーン (mutualPairs useMemo) も再計算されて復活する。
  //   loadHoldCount / loadVenueContext も同タイミングで取り直し、
  //   Hold バッジ・会場名・参加人数も最新化 (= 入り直しと完全に同じ挙動)。
  const reloadAll = useCallback(() => {
    loadSupply()
    loadHoldCount()
    loadVenueContext()
    loadMySupplyPosts()
  }, [loadSupply, loadHoldCount, loadVenueContext, loadMySupplyPosts])

  // 画面 focus 時に再取得 (Hold 承認 / 拒否後に戻ったときの最新化)
  useFocusEffect(
    useCallback(() => {
      reloadAll()
    }, [reloadAll])
  )

  // PR-6: 双方向マッチレーンからの呼出で proposer_card のプリセット値を受け取れるよう
  // optional 引数 myCardPreset を追加。既存の供給板カードからの呼出は引数なしのままで動く。
  // プリセット値はユーザーが Modal 内 TextInput で自由に編集可能 (placeholder ではなく value)。
  const handleHoldRequest = (
    post: VenueSupplyPost,
    myCardPreset?: string,
  ) => {
    // フル画面ルート (app/venue/hold.tsx) へ。相手 supply_post は Hold 生成 + 圧縮カード
    // 表示に必要な最小フィールドのみ params で渡す (オブジェクト全渡しを避ける)。
    router.push({
      pathname: '/venue/hold',
      params: {
        venueId: venueId ?? '',
        postId: post.id,
        receiverId: post.user_id,
        cardName: post.card_name,
        posterName: getDisplayName(post.poster),
        wantDisplay: post.want_card ?? '',
        myCardPreset: myCardPreset ?? '',
      },
    } as never)
  }

  // 右下 FAB「この会場で出す」押下時: 出品フル画面ルート (app/venue/post.tsx) へ。
  const handleOpenVenuePostForm = () => {
    router.push({
      pathname: '/venue/post',
      params: { venueId: venueId ?? '', workId: venue?.work_id ?? '' },
    } as never)
  }

  return (
    /* PR-7: Stack header (app/_layout.tsx:173-182 で headerShown:true) が既に top
        safe area を消化しているため、ここで edges={['top']} を付けると二重に
        inset が乗り「会場モード」タイトルと会場文脈ヘッダーの間に余分な余白が出る。
        edges={[]} で top safe area を画面側からは取らず、Stack header の高さに任せる。 */
    <View style={styles.root}>
      {/* 段階3-B: 上=紫 (非日常) → 下=白 (供給板の床) の縦グラデ。世界観レイヤー。
          段階4/E: 初回入場時はこのグラデが暗い紫床からフェードイン (ステージ点灯)。 */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: entrance }]}>
        <LinearGradient
          colors={[...VENUE_ROOM_GRADIENT]}
          locations={[...VENUE_ROOM_LOCATIONS]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <SafeAreaView style={styles.safeTransparent} edges={[]}>
      {/* PR-2: 会場文脈ヘッダー — どの会場にいるかを示し、開催中状態と参加人数で
          現在地＋臨場感を与える。venue 取得失敗時は非表示 (フォールバック)。
          ナビゲーションバーの Stack title ('会場モード' 固定) は本 PR では触らず、
          画面内ヘッダーで文脈を出す方針。 */}
      {venue != null && (
        // 段階3-B: ステージ看板ヘッダー。紫グラデ床に会場名を大きく掲げ、
        // LIVE バッジ + 参加人数 + アバターで「いま人がいる会場」の臨場感を出す。
        // 段階4/E: 初回入場時は点灯しながら少し迫り上がる (opacity + translateY)。
        <Animated.View
          style={[
            styles.venueContextHeader,
            {
              opacity: entrance,
              transform: [{ translateY: headerRise }, { scale: headerScale }],
            },
          ]}
        >
          <Text style={styles.venueContextTitle} numberOfLines={2}>
            {venue.title}
          </Text>
          <Text style={styles.venueContextSubtitle} numberOfLines={1}>
            {venue.venue_name} · {formatJaEventDate(venue.event_date)}
          </Text>
          <View style={styles.venueContextStatusRow}>
            {venue.status === 'open' ? (
              <>
                <LiveBadge />
                <Text style={styles.venueContextCheckin}>
                  {checkinCountFailed ? '—' : checkinCount}人がこの会場にいます
                </Text>
                {!checkinCountFailed && checkinCount > 0 && (
                  <VenueAvatarStack count={checkinCount} size={24} />
                )}
              </>
            ) : venue.status === 'upcoming' ? (
              <Text style={styles.venueContextHint}>まもなく開催</Text>
            ) : (
              <Text style={styles.venueContextHint}>終了</Text>
            )}
          </View>
        </Animated.View>
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
          <Text style={styles.quickLinkText} numberOfLines={1}>
            自分の会場投稿を管理
          </Text>
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
          <Text style={styles.quickLinkText} numberOfLines={1}>
            送受信のHoldを見る
          </Text>
          {/* PR-7: 受信中 pending Hold 件数バッジ (= 既存の receivedHoldCount、
              loadHoldCount で取得済)。新規 fetch なし。cancel 応答待ちは
              holds 画面の成立済タブで赤ドット表示 (PR-5-b) するため、本バッジは
              受信 Hold のみに絞り、画面間で役割分担する。 */}
          {receivedHoldCount > 0 && (
            <View style={styles.quickLinkBadge}>
              <Text style={styles.quickLinkBadgeText}>{receivedHoldCount}</Text>
            </View>
          )}
          <Text style={styles.quickLinkArrow}>→</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView ref={mainScrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* P1 follow-up (本 PR では UI 非表示、優先度は P1 として残す):
              Hidden from the primary venue surface until the P1 implementation is ready.
                - 会場商品棚レーン (P1-top follow-up): 参加者の棚を会場文脈で閲覧 (要 RLS 設計)
                - 成立候補レーン (P1 follow-up): 同会場 / Trust / 差額量で自動提案 (要 RPC 設計)
              復活時はレーンタブ + 各 lane content を別 PR で追加する。 */}

          {/* PR-6: 双方向マッチレーン (横スクロール、accent 色強調)。
              mutualPairs.length === 0 のときレーンごと非表示 (供給板だけ見せる)。
              検索バーで絞り込み中でもこのレーンは消えない (マッチ計算は supplyPosts 全件) */}
          {mutualPairs.length > 0 && (
            <View style={styles.matchLane}>
              <Text style={styles.matchLaneTitle}>◎ 今すぐ交換できる</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.matchLaneScroll}
              >
                {mutualPairs.map((pair) => (
                  <View
                    key={`${pair.myPost.id}_${pair.theirPost.id}`}
                    style={styles.matchCard}
                  >
                    {/* PR-6-b: 相手 / 自分それぞれのサムネを追加。image_url が NULL の
                        ケースは供給板カードと同じ brand-tint + image-outline 方式の
                        プレースホルダで揃える (視認性 + 既存パターン踏襲)。 */}
                    <Text style={styles.matchCardLabel}>相手が出す</Text>
                    <View style={styles.matchCardRow}>
                      {pair.theirPost.image_url != null ? (
                        <Image
                          source={{ uri: pair.theirPost.image_url }}
                          style={styles.matchCardThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.matchCardThumb,
                            styles.matchCardThumbPlaceholder,
                          ]}
                        >
                          <Ionicons
                            name="image-outline"
                            size={18}
                            color={VENUE_COLORS.brand}
                          />
                        </View>
                      )}
                      {/* PR-8: 種別サブ行を card_name の下に。先頭 1 件のみ、master 未登録は
                          slug 自身をフォールバック表示。種別未指定 (空配列 / undefined) は
                          サブ行ごと非表示 (return null)。 */}
                      <View style={styles.matchCardTextCol}>
                        <Text style={styles.matchCardName} numberOfLines={1}>
                          {pair.theirPost.card_name}
                        </Text>
                        {(() => {
                          const slug = (pair.theirPost.item_types ?? [])[0]
                          if (slug == null) return null
                          const label =
                            getItemTypeById(slug)?.display_name_ja ?? slug
                          return (
                            <Text
                              style={styles.matchCardItemType}
                              numberOfLines={1}
                            >
                              {label}
                            </Text>
                          )
                        })()}
                      </View>
                    </View>
                    <Text style={styles.matchCardArrow}>⇵</Text>
                    <Text style={styles.matchCardLabel}>あなたが出す</Text>
                    <View style={styles.matchCardRow}>
                      {pair.myPost.image_url != null ? (
                        <Image
                          source={{ uri: pair.myPost.image_url }}
                          style={styles.matchCardThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.matchCardThumb,
                            styles.matchCardThumbPlaceholder,
                          ]}
                        >
                          <Ionicons
                            name="image-outline"
                            size={18}
                            color={VENUE_COLORS.brand}
                          />
                        </View>
                      )}
                      <View style={styles.matchCardTextCol}>
                        <Text style={styles.matchCardName} numberOfLines={1}>
                          {pair.myPost.card_name}
                        </Text>
                        {(() => {
                          const slug = (pair.myPost.item_types ?? [])[0]
                          if (slug == null) return null
                          const label =
                            getItemTypeById(slug)?.display_name_ja ?? slug
                          return (
                            <Text
                              style={styles.matchCardItemType}
                              numberOfLines={1}
                            >
                              {label}
                            </Text>
                          )
                        })()}
                      </View>
                    </View>
                    <Pressable
                      style={styles.matchCardButton}
                      onPress={() =>
                        handleHoldRequest(pair.theirPost, pair.myPost.card_name)
                      }
                      accessibilityLabel="この組み合わせでHold申請"
                    >
                      <Text style={styles.matchCardButtonText}>
                        この組み合わせでHold
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── 当日供給板 (β1 主画面) ── */}
          <View style={styles.supplyHeader}>
            <View style={styles.supplyHeaderText}>
              <Text style={styles.supplyTitle}>いま会場に出ている交換</Text>
              <Text style={styles.supplySub}>
                {loadingSupply
                  ? '読み込み中…'
                  : supplyPosts.length > 0
                  ? `${filteredPosts.length} 件${
                      searchCharacters.length > 0 ? '（絞り込み中）' : ''
                    } · 本日中有効`
                  : '本日中有効'}
              </Text>
            </View>
            {/* PR-3.6d: 出品フォームは bottom sheet Modal に分離 (板とフォームの混線解消)。
                以前ここにあった「✕ 閉じる」はシート内 × ボタンに役割を統合した。 */}
          </View>

          {/* PR-3.5: 会場内検索バー (メンバー / キャラ master 横断、複数選択可、freeText 不可)。
              フィルタは filteredPosts useMemo でクライアント側完結、fetchSupplyPosts は不変。
              検索バー focus 時は scrollToSearch で mainScrollRef を該当位置にスクロール。 */}
          <View ref={searchBarRef} style={styles.searchBar} collapsable={false}>
            <View style={styles.searchBarMsaWrap}>
              <MultiSelectAutocomplete<MasterCharacter>
                selected={searchCharacters}
                onChange={setSearchCharacters}
                fetchSuggestions={(input) => getCharacterSuggestionsAcrossWorks(input)}
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
                placeholder="メンバー / キャラで絞り込む"
                minInputChars={1}
                softLimit={3}
                onFocus={scrollToSearch}
              />
            </View>
            {searchCharacters.length > 0 && (
              <Pressable
                onPress={() => setSearchCharacters([])}
                style={styles.searchClearButton}
                hitSlop={8}
                accessibilityLabel="検索をクリア"
              >
                <Text style={styles.searchClearText}>クリア</Text>
              </Pressable>
            )}
          </View>

          {/* PR-3.6d: 出品フォームの inline JSX (画像 / 譲セクション / 求セクション /
              投稿ボタン) は本 PR で bottom sheet Modal (file 末尾) に移植・除去済。
              ScrollView 内には供給板リストのみが残る (板とフォームの混線を解消)。 */}

          {/* PR-V2: 状態優先順位 loadingSupply > supplyLoadFailed > 検索 0 件 > 全件 0 件 > データ表示。
              「読み込み失敗」と「本当に空」を分離し、失敗時は再試行可能にする。 */}
          {loadingSupply ? (
            <ActivityIndicator color={VENUE_COLORS.brand} style={{ marginTop: 24 }} />
          ) : supplyLoadFailed ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>うまく読み込めませんでした</Text>
              <Text style={styles.errorBody}>
                電波が混み合っているかもしれません。少し待って再試行してください。
              </Text>
              <Pressable
                style={[
                  styles.retryButton,
                  loadingSupply && styles.retryButtonDisabled,
                ]}
                onPress={() => {
                  // PR-V2-fix3: loadSupply 単体ではなく reloadAll を呼んで、
                  //   マッチレーンの依存 (mySupplyPosts) や Hold バッジ・会場文脈も
                  //   同時に再取得し、入り直しと同じ復元挙動にする。
                  void reloadAll()
                }}
                disabled={loadingSupply}
                accessibilityLabel="再試行"
              >
                <Text style={styles.retryButtonText}>再試行</Text>
              </Pressable>
            </View>
          ) : supplyPosts.length === 0 ? (
            // 段階3-B: 空状態を「トップバッターに！」の前向き演出に。
            // 淡い紫→ピンクのグラデ + dashed 枠で「まだ誰も出していない = チャンス」を表現。
            <LinearGradient
              colors={['rgba(168,85,247,0.08)', 'rgba(244,114,182,0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyStage}
            >
              <Text style={styles.emptyStageEmoji}>🎤</Text>
              <Text style={styles.emptyStageTitle}>トップバッターに！</Text>
              <Text style={styles.emptyStageBody}>
                まだ交換が出ていません。{'\n'}
                最初のグッズを出して、この会場の口火を切りましょう。
              </Text>
            </LinearGradient>
          ) : filteredPosts.length === 0 ? (
            /* PR-3.5: 絞り込み結果 0 件 (全件 0 件とは分岐を分ける) */
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>該当する募集がありません</Text>
              <Pressable
                onPress={() => setSearchCharacters([])}
                style={styles.searchClearButtonInline}
              >
                <Text style={styles.searchClearText}>クリア</Text>
              </Pressable>
            </View>
          ) : (
            filteredPosts.map((post) => {
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

              // PR-4: マッチリボン (exact slug overlap、fuzzy 不使用)。
              //   hasOverlap = 自分の求 ∩ 相手の譲 (片方向)
              //   isMutual   = それに加えて 自分の譲 ∩ 相手の求 (双方向)
              //   どちらも false ならリボン非表示。
              const postSlugs = post.characters ?? []
              const theirWantSlugs = post.want_characters ?? []
              const hasOverlap = postSlugs.some((s) => myWantSlugs.includes(s))
              const isMutual =
                hasOverlap &&
                theirWantSlugs.some((s) => myOfferSlugs.includes(s))
              // 種別補足: 1 件目同士を比較 (β1 範囲では先頭優先で OK)。
              const postItemType = (post.item_types ?? [])[0] ?? ''
              const myWantItemType = myWantItemTypes[0] ?? ''
              let typeNote = ''
              if (postItemType !== '' && myWantItemType !== '') {
                typeNote =
                  postItemType === myWantItemType
                    ? `${postItemType}⇄${postItemType}`
                    : `${postItemType}(求:${myWantItemType})`
              }
              return (
                <View key={post.id} style={styles.supplyCard}>
                  {/* PR-6-b: 供給板リボンは「片方向一致のみ」に絞る。
                      双方向 (isMutual) は上部マッチレーン (PR-6) に集約済なのでここでは出さない。
                      hasOverlap && !isMutual = 片方向のみ → 薄ピンク「求と一致」固定。 */}
                  {hasOverlap && !isMutual && (
                    <View style={styles.ribbonOne}>
                      <Text style={styles.ribbonOneText}>求と一致</Text>
                      {typeNote !== '' && (
                        <Text style={styles.ribbonTypeNoteOne}>{typeNote}</Text>
                      )}
                    </View>
                  )}
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

      {/* 右下 FAB「この会場で出す」(主 CTA)。色レイヤー分離 (D): 操作 CTA は coral。
          会場詳細は (tabs) の外で通常 FAB が表示されないため本画面専用に配置。
          β1: 出品 form を開く動線はこの FAB のみに一本化 (inline 「＋」ボタンは廃止)。
          出品/Hold はフル画面ルート化したため overlay 競合はなく、FAB は常時表示。 */}
      <SubmitFab
        label="この会場で出す"
        onPress={handleOpenVenuePostForm}
        hasTabBar={false}
        backgroundColor={colors.primary}
        accessibilityLabel="この会場の当日供給板に出品"
      />

      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  // 段階3-B: 背景グラデを敷くための root + 透明 SafeAreaView。
  root: { flex: 1, backgroundColor: '#3B1E6E' },
  safeTransparent: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  // 段階3-B: ステージ看板ヘッダー。紫グラデ床の上に会場名を大きく掲げる。
  // 帯背景は付けず (グラデに沈める)、文字は白系で臨場感を出す。
  venueContextHeader: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    gap: 6,
  },
  venueContextTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.extrabold,
    color: '#FFFFFF',
    lineHeight: 27,
  },
  venueContextSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.82)',
  },
  venueContextStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  // 段階3-B: 旧・緑「開催中」LIVE ピル (venueContextLivePill/Dot/Text) は
  // 共有 LiveBadge (赤グラデ + 脈打ち) に置き換えて撤去。
  venueContextCheckin: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: 'rgba(255,255,255,0.9)',
  },
  venueContextHint: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.75)',
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
    // PR-7: 2 ボタンを常に横並びにする (折り返し禁止)。各ボタンが flex:1 で
    // 画面幅を等分するため、wrap は不要。
    flexWrap: 'nowrap',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  quickLink: {
    // PR-7: 2 ボタンが画面幅を等分するよう flex:1。中身 (アイコン+テキスト+矢印) は
    // justifyContent:'center' でボタン内中央寄せ。
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  quickLinkText: {
    // PR-7: テキストが長くてアイコン/矢印を押し出さないよう flexShrink:1 で潰せる
    // ようにする (numberOfLines={1} と併せて 1 行省略を担保)。
    flexShrink: 1,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  quickLinkArrow: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  // PR-7: 「送受信のHoldを見る」内の受信件数バッジ (coral 丸)。
  quickLinkBadge: {
    backgroundColor: '#FF3E6C',
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  quickLinkBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  content: { padding: spacing.base, paddingBottom: 120, gap: spacing.md },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  // 段階3-B: 「トップバッターに！」空状態カード。
  emptyStage: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(168,85,247,0.3)',
  },
  emptyStageEmoji: { fontSize: 34 },
  emptyStageTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: '#7C2D92',
  },
  emptyStageBody: {
    fontSize: fontSize.sm,
    color: '#9B6BB3',
    textAlign: 'center',
    lineHeight: 20,
  },
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
  // PR-V2: 通信失敗時の「うまく読み込めませんでした [再試行]」表示。
  //   会場一覧画面 (app/venue/index.tsx) の inline 実装と同形 (共通 component 化は V3)。
  errorBox: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  errorTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: VENUE_COLORS.headline,
  },
  errorBody: {
    fontSize: fontSize.sm,
    color: VENUE_COLORS.body,
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
  // PR-6: 双方向マッチレーン (横スクロール、供給板の上、accent 色強調)。
  matchLane: {
    marginTop: 8,
    marginBottom: 4,
  },
  matchLaneTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: VENUE_COLORS.accent,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  matchLaneScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  matchCard: {
    // PR-6-b: サムネ + 名前 2 列レイアウトに対応するため幅を 200 → 220 に拡張。
    width: 220,
    backgroundColor: VENUE_COLORS.accentTint,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: VENUE_COLORS.accent + '40',
  },
  matchCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: VENUE_COLORS.accent,
    opacity: 0.7,
  },
  // PR-6-b: サムネ + 名前の横並びコンテナ。
  matchCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  // PR-6-b → PR-8: マッチカード内サムネ。56 → 44 に縮小し、写真と名前の距離を詰める。
  // borderRadius も 8 → 6 に比例縮小、placeholder と兼用。
  matchCardThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: VENUE_COLORS.background,
  },
  matchCardThumbPlaceholder: {
    backgroundColor: VENUE_COLORS.brandTint,
    borderWidth: 1,
    borderColor: VENUE_COLORS.brandBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // PR-8: 名前 + 種別を縦に並べるテキスト列。サムネと横並びになるため flex:1 で残り幅を取る
  // (旧 matchCardName が持っていた flex:1 はこちらに移管)。
  matchCardTextCol: {
    flex: 1,
    gap: 2,
  },
  matchCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15161E',
  },
  // PR-8: 種別サブ行 (accent 色で「相手が出す」ラベルと色味を揃える、控えめ opacity)。
  matchCardItemType: {
    fontSize: 11,
    fontWeight: '600',
    color: VENUE_COLORS.accent,
    opacity: 0.85,
  },
  matchCardArrow: {
    fontSize: 16,
    color: VENUE_COLORS.accent,
    textAlign: 'center',
    marginVertical: 6,
  },
  matchCardButton: {
    marginTop: 10,
    height: 38,
    borderRadius: 10,
    backgroundColor: VENUE_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCardButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
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
  // PR-3.5: 会場内検索バー (供給板タイトル直下に配置)。
  // 横並びレイアウト: MSA (flex:1) + クリアボタン (テキストボタン、右端、選択中のみ表示)。
  searchBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  searchBarMsaWrap: {
    flex: 1,
  },
  // 選択中チップ右端の「クリア」ボタン (テキストのみ、hint 色)。
  searchClearButton: {
    paddingHorizontal: 8,
    paddingVertical: spacing.xs,
  },
  // 絞り込み結果 0 件の empty 内で再利用するクリアボタン (中央配置の inline 版)。
  searchClearButtonInline: {
    marginTop: spacing.xs,
    paddingHorizontal: 8,
    paddingVertical: spacing.xs,
  },
  searchClearText: {
    fontSize: 13,
    color: VENUE_COLORS.hint,
    fontWeight: fontWeight.semibold,
  },
  // β1: form open 時のみ表示する「✕ 閉じる」用。form を開く動線は FAB に一本化したため neutral 配色。
  // 旧 form-open style は廃止 (showPostForm 時しか表示しないため active 状態は不要)
  // PR-3.6b: 出品 form の「譲グッズ」「求グッズ」セクション区切りラベル。
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
  // ─────────────────────────────────────────
  // PR-3.6d: 出品 bottom sheet Modal
  // ─────────────────────────────────────────
  // 全画面 overlay (半透明黒) — 下端寄せでシートを 75% の高さに置く。
  // KeyboardAvoidingView をこのコンテナで包む。height: '75%' で画面下から
  // 75% せり上がる構成 (flex: 0.75 相当)。
  // シート本体: 上端角丸の白パネル、上 8px / 水平 16px パディング (spec)。
  // 上端 drag indicator (40x4、丸、#D1D5DB、中央)。視覚のみ (gesture 未配線)。
  // ヘッダー行: 中央タイトル + 右上 × ボタン。× は absolute で右に固定。
  // シート本体内 ScrollView (KeyboardAvoidingView → sheetCard → ScrollView)
  // 出品ボタン (coral / アクション系 CTA、brand 紫は primary CTA 専用)。
  // PR3: 画像 picker / preview
  // β1 投稿カード: 写真 + 譲/求 + 投稿者 + Trust + 残り時間 + Holdする CTA
  // PR-4: マッチリボンを角丸内に収めるため overflow: 'hidden' を追加。
  // リボンは padding 外に置く (marginHorizontal/Top で打ち消す) ため必須。
  supplyCard: {
    backgroundColor: VENUE_COLORS.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: VENUE_COLORS.border,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  // PR-4: マッチリボン (2 段)。supplyCard の padding (spacing.md) を
  // marginHorizontal/Top で打ち消し、カード端まで届く帯として描画。
  // overflow:'hidden' (supplyCard) で角丸の内側にクリップされる。
  ribbonOne: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginHorizontal: -spacing.md,
    marginTop: -spacing.md,
    backgroundColor: VENUE_COLORS.accentTint,
  },
  ribbonOneText: {
    fontSize: 13,
    fontWeight: '700',
    color: VENUE_COLORS.accent,
    flex: 1,
  },
  // 種別補足注記 (リボン右端、小さく)。色は 2 種類のリボン背景に合わせて分岐。
  ribbonTypeNoteOne: {
    fontSize: 11,
    opacity: 0.85,
    color: VENUE_COLORS.accent,
    marginLeft: 'auto',
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
  // 投稿カード主 CTA「Holdする」。色レイヤー分離 (D): 操作系 CTA は coral (colors.primary)。
  // 世界観 (背景/ヘッダー/会場識別) は VENUE_COLORS の紫を維持する。
  holdCta: {
    marginTop: spacing.xs,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdCtaPressed: { opacity: 0.9 },
  holdCtaText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  // Hold 申請モーダル内 ScrollView 用 contentContainer。
  // modalSheet 自体の gap は holdSent 成功表示用に温存、scroll 側にも同じ gap を与える。
})
