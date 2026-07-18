// app/listing/new/bulk.tsx
//
// 出品フロー刷新 Phase 2: 一括出品フロー (1枚の写真から複数出品)。
//
// Phase 2-1 (本ファイルの現状): 写真1枚を選択 → 写真上をタップして点を動的に追加
//   → タップ点に番号バッジ①②③… を描画。バッジ再タップで削除 (番号は自動で振り直し)。
//   座標機構は app/listing/new/select.tsx (DEPRECATED) の onLayout / %変換 / バッジ描画を流用し、
//   BBOX_MOCK 固定枠 → 「タップ点の動的 state 配列」に置換。
//
// β1 方針: 手動タップのみ・AI 検出なし・切り出しファイル生成なし・native 依存追加ゼロ。
//   ★座標は「元画像基準」で保存する (将来の AI 物体検出 / AI 代理出品 / photo moat の土台。
//     β1 期間中に貯まる bbox 座標は遡って直せない = 不可逆なので、今から正しく貯める)。
//   写真は resizeMode='contain' で全体表示。コンテナ内の letterbox を除いた「実画像矩形」を
//   算出し、タップは実画像矩形内のみ有効 (余白タップは無視)。保存する xPct/yPct は
//   「実画像矩形内の割合 (0–1)」= 元画像基準。バッジ描画も実画像矩形基準で乗せる。
//   保存時に cards.bbox_x/bbox_y へ格納予定 (Phase 2-4)。bbox_w/bbox_h はバッジ表示用に不使用。
//   image_url_cropped は β1 では NULL のまま (切り出しファイルを作らない)。
//
// Phase 2-2: タップ点ごとの属性シート (メンバー/種類/補足)。
// Phase 2-4: N insert (各点 = 1 cards レコード、同一 image_url + 各点座標)。
//   → これらは後続サブ Phase で本ファイルに追加する。現状 2-1 は「点の追加/削除の手触り」まで。

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { CharactersSection } from '@/components/listing/section/CharactersSection'
import { ItemsSection } from '@/components/listing/section/ItemsSection'
import type {
  WantMasterValue,
  WorkSectionValue,
} from '@/components/listing/section/types'
import { WantMasterSection } from '@/components/listing/section/WantMasterSection'
import { WorkSection } from '@/components/listing/section/WorkSection'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchListingKeywordHistory,
  getCharacterById,
  getItemTypeById,
  getMemberLabel,
  getWorkById,
  recordListingKeyword,
} from '@/lib/master'
import { supabase, uploadCardImage } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { ensureMediaPermission } from '@/lib/ensureMediaPermission'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  Alert,
  GestureResponderEvent,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
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

// タップで打った点 = 1 商品レコード。
//   xPct/yPct は 0–1 の割合 (原点=元画像の左上、実画像矩形基準)。
//   characters/itemTypes は点ごとに可変 (master ID + free text 混在、CharactersSection と同形式)。
//   作品/グループ (work) は冒頭で 1 回選択し全点共通のため、点には持たせない。
type TapPoint = {
  id: string
  xPct: number
  yPct: number
  characters: string[]
  itemTypes: string[]
  note: string
}

// 選択した写真 (uri + 元画像ピクセルサイズ、contain 矩形算出に使う)。
type PickedImage = {
  uri: string
  width: number
  height: number
}

// letterbox を除いた実画像矩形 (コンテナ内での描画位置・サイズ)。
type ImageRect = { x: number; y: number; w: number; h: number }

// 点の上限 (1 枚の写真から作れる商品数の目安。UX 上の抑制、DB 制約ではない)
const MAX_POINTS = 12

// バッジ 1 個のサイズ (中心をタップ点に合わせるため半分を offset)
const BADGE_SIZE = 28

let pointSeq = 0
function nextPointId(): string {
  pointSeq += 1
  return `p_${pointSeq}`
}

/**
 * 元画像のピクセルサイズを解決する。
 *   通常は picker asset の width/height を使う (無駄な getSize 呼び出しを避ける)。
 *   欠損 (0 / undefined) の端末のみ Image.getSize(uri) でフォールバック取得する。
 *   → contain 矩形が常に元画像基準で算出でき、座標汚染 (コンテナ基準) を防ぐ。
 * getSize も失敗した場合は {0,0} を返し、呼出側で fallback (コンテナ全体) に倒す。
 */
async function resolveImageSize(
  uri: string,
  assetW: number | undefined,
  assetH: number | undefined,
): Promise<{ width: number; height: number }> {
  if (assetW != null && assetW > 0 && assetH != null && assetH > 0) {
    return { width: assetW, height: assetH }
  }
  // 欠損時のみ Image.getSize (RN 標準、native 追加なし)
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 }),
    )
  })
}

/**
 * contain フィットで、コンテナ内に実画像が描画される矩形を算出する。
 * scale = min(横比, 縦比)、余白は上下 or 左右に均等 (letterbox)。
 * 画像サイズ不明 (width/height <= 0) の場合はコンテナ全体を返す (fallback)。
 */
function computeContainRect(
  containerW: number,
  containerH: number,
  imgW: number,
  imgH: number,
): ImageRect {
  if (containerW <= 0 || containerH <= 0) return { x: 0, y: 0, w: 0, h: 0 }
  if (imgW <= 0 || imgH <= 0) {
    return { x: 0, y: 0, w: containerW, h: containerH }
  }
  const scale = Math.min(containerW / imgW, containerH / imgH)
  const w = imgW * scale
  const h = imgH * scale
  const x = (containerW - w) / 2
  const y = (containerH - h) / 2
  return { x, y, w, h }
}

// master ID → 表示名、未ヒットなら raw text (ハイブリッドマスタ fallback)。
function characterDisplay(id: string): string {
  return getCharacterById(id)?.display_name_ja ?? id
}
function itemTypeDisplay(id: string): string {
  return getItemTypeById(id)?.display_name_ja ?? id
}

/**
 * 1 点 = 1 商品の cards.name を生成 (single-page buildSetName と同型、点ごとの属性で)。
 * 例: 「Snow Man - 岩本 (アクスタ)」。作品は共通 work、メンバー/種類は点固有。
 */
function buildPointName(
  work: WorkSectionValue,
  characters: string[],
  itemTypes: string[],
): string {
  const parts: string[] = []
  if (work != null) {
    const w = getWorkById(work.workId)
    const workName = w?.display_name_ja ?? work.workId
    if (workName !== '') parts.push(workName)
  }
  const charNames = characters.map(characterDisplay)
  if (charNames.length > 0) {
    parts.push(
      charNames.length <= 3
        ? charNames.join('、')
        : `${charNames.slice(0, 3).join('、')} 他${charNames.length - 3}名`,
    )
  }
  const typeNames = itemTypes.map(itemTypeDisplay)
  if (typeNames.length > 0) {
    parts.push(`(${typeNames.join('・')})`)
  }
  return parts.length > 0 ? parts.join(' - ') : '無題の出品'
}

async function pickFromCamera(): Promise<PickedImage | null> {
  if (!(await ensureMediaPermission('camera'))) return null
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  })
  if (result.canceled) return null
  const a = result.assets?.[0]
  if (a?.uri == null) return null
  const size = await resolveImageSize(a.uri, a.width, a.height)
  return { uri: a.uri, width: size.width, height: size.height }
}

async function pickFromLibrary(): Promise<PickedImage | null> {
  if (!(await ensureMediaPermission('library'))) return null
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  })
  if (result.canceled) return null
  const a = result.assets?.[0]
  if (a?.uri == null) return null
  const size = await resolveImageSize(a.uri, a.width, a.height)
  return { uri: a.uri, width: size.width, height: size.height }
}

export default function ListingNewBulkScreen() {
  const { userId } = useAuth()
  const [image, setImage] = useState<PickedImage | null>(null)
  // 作品/グループ: 冒頭で 1 回選択、N 商品で共通 (案 a)。
  const [work, setWork] = useState<WorkSectionValue>(null)
  // 求: N 商品共通の master 構造化求 (PR-1b-1)。全 cards の want_* に同じ内容を保存する
  //   (per-item override は PR-1b-2)。作品確定後・タップ前に 1 回入力 (グッズごとには分けない)。
  const [bulkWant, setBulkWant] = useState<WantMasterValue>({
    works: [],
    characters: [],
    itemTypes: [],
    sameSeriesAsOffer: false,
  })
  // 求ステップを完了したか (作品 → 求 → タップ の進行管理)。
  const [wantDone, setWantDone] = useState(false)
  const [points, setPoints] = useState<TapPoint[]>([])
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  // 属性シートを開いている点の id (null = 閉じている)。
  const [activePointId, setActivePointId] = useState<string | null>(null)
  // 補足チップ用の履歴 (自分の listing_note keyword、直近 unique)。
  const [history, setHistory] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  // 出品前の最終確認画面を表示中か (STEP 4)。
  const [reviewMode, setReviewMode] = useState(false)

  // 履歴を初回取得 (userId 確定後)。
  useEffect(() => {
    if (userId == null) return
    let cancelled = false
    void fetchListingKeywordHistory(userId, 10).then((list) => {
      if (!cancelled) setHistory(list)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  // letterbox を除いた実画像矩形 (contain)。タップ判定・座標変換・バッジ描画の基準。
  const rect = image
    ? computeContainRect(containerSize.width, containerSize.height, image.width, image.height)
    : { x: 0, y: 0, w: 0, h: 0 }

  const activePoint = points.find((p) => p.id === activePointId) ?? null
  const workId = work?.workId ?? ''

  const handlePickImage = () => {
    Alert.alert('写真を選ぶ', undefined, [
      {
        text: 'カメラで撮る',
        onPress: async () => {
          const picked = await pickFromCamera()
          if (picked != null) {
            setImage(picked)
            setPoints([]) // 写真を替えたら点をリセット
          }
        },
      },
      {
        text: 'アルバムから選ぶ',
        onPress: async () => {
          const picked = await pickFromLibrary()
          if (picked != null) {
            setImage(picked)
            setPoints([])
          }
        },
      },
      { text: 'キャンセル', style: 'cancel' },
    ])
  }

  // 点の属性を更新するヘルパー (characters / itemTypes / note)。
  const updatePoint = (
    id: string,
    patch: Partial<Pick<TapPoint, 'characters' | 'itemTypes' | 'note'>>,
  ) => {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  // 補足チップをタップ → 補足欄に挿入 (末尾に追記、空なら置換)。
  const handleInsertChip = (id: string, chip: string) => {
    setPoints((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, note: p.note.trim() === '' ? chip : `${p.note} ${chip}` }
          : p,
      ),
    )
  }

  // 写真上のタップ → 実画像矩形内なら、元画像基準の割合で点を追加。
  //   余白 (letterbox) のタップは無視する。
  const handleImageTap = (e: GestureResponderEvent) => {
    if (rect.w === 0 || rect.h === 0) return
    const { locationX, locationY } = e.nativeEvent
    // 実画像矩形の外 (余白) は無効
    if (
      locationX < rect.x ||
      locationX > rect.x + rect.w ||
      locationY < rect.y ||
      locationY > rect.y + rect.h
    ) {
      return
    }
    if (points.length >= MAX_POINTS) {
      Alert.alert('これ以上追加できません', `1枚から出品できるのは最大${MAX_POINTS}点です。`)
      return
    }
    // 元画像基準の割合 (0–1) = (タップ位置 - 矩形原点) / 矩形サイズ
    const xPct = Math.min(1, Math.max(0, (locationX - rect.x) / rect.w))
    const yPct = Math.min(1, Math.max(0, (locationY - rect.y) / rect.h))
    const id = nextPointId()
    setPoints((prev) => [
      ...prev,
      { id, xPct, yPct, characters: [], itemTypes: [], note: '' },
    ])
    // 追加直後に属性シートを開く (タップした商品の属性をその場で入力)。
    setActivePointId(id)
  }

  // バッジのタップ → その点の属性シートを開く (編集)。削除はシート内から。
  const handleOpenPoint = (id: string) => {
    setActivePointId(id)
  }

  // 点を削除 (番号は index ベースなので自動で振り直し)。属性シート内から呼ぶ。
  const handleRemovePoint = (id: string) => {
    setPoints((prev) => prev.filter((p) => p.id !== id))
    setActivePointId(null)
  }

  const handleRetakePhoto = () => {
    handlePickImage()
  }

  // 確定: N 商品を一括 insert。画像は 1 回だけアップし N 行で共有。
  //   配列 insert = 単一 INSERT 文 = 原子的。部分失敗なら 0 件 (一部だけ入る状態を作らない)。
  const handleSubmit = async () => {
    if (submitting) return
    if (userId == null) {
      Alert.alert('エラー', 'ログイン情報が取得できません')
      return
    }
    if (image == null || work == null || !canProceed) return

    try {
      setSubmitting(true)

      // 画像を 1 回だけアップロード (バイト重複なし、N 行で image_url を共有)。
      let imageUrl: string | null = null
      if (image.uri.startsWith('http')) {
        imageUrl = image.uri
      } else {
        // アップロード失敗は throw → catch で全体エラー (cards は 1 件も作らない)。
        imageUrl = await uploadCardImage({ userId, imageUri: image.uri })
      }

      // 各点 → 1 cards row。single-page の row 形状に準拠。
      //   bbox_x/y = 元画像基準のタップ割合 (contain 変換済)。bbox_w/h・image_url_cropped は NULL。
      //   求は共通 bulkWant を master 構造化して各 card の want_* に保存 (PR-1b-1)。
      const rows = points.map((pt) => ({
        owner_user_id: userId,
        name: buildPointName(work, pt.characters, pt.itemTypes),
        category: work.category,
        work_id: work.workId,
        characters: pt.characters,
        item_types: pt.itemTypes,
        image_url: imageUrl,
        image_back_url: null,
        // 「商品の状態・補足」note は商品説明カラム description に格納する。
        // (want_description は「求」の自由記述カラムであり、商品状態を入れると検索一覧で
        //  「求: 美品」と誤表示されるため。bulk の求は card_wanted_links に紐づく。)
        description: pt.note.trim() !== '' ? pt.note.trim() : null,
        status: 'active',
        is_public: true, // 顔2: 通常出品は公開 (商品棚=false は顔2本体で別途)
        condition: null,
        // bulk に「求の詳細フリーテキスト」欄は無い。
        want_description: null,
        allows_mail: true,
        allows_handoff: false,
        allows_adjustment: false,
        adjustment_max: null,
        // 求 (共通 bulkWant) を各 card の want_* に保存。同シリーズ ON は per-card 解決:
        //   作品 = 譲 work、種別 = その card 自身の種別 (pt.itemTypes、コンプ狙い)。
        want_works: bulkWant.sameSeriesAsOffer ? [work.workId] : bulkWant.works,
        want_characters: bulkWant.characters,
        want_item_types: bulkWant.sameSeriesAsOffer
          ? pt.itemTypes
          : bulkWant.itemTypes,
        group_name: null,
        member_name: null,
        series: null,
        bbox_x: pt.xPct,
        bbox_y: pt.yPct,
        bbox_w: null,
        bbox_h: null,
        image_url_cropped: null,
      }))

      // 配列 insert = 単一 INSERT 文 = 原子的 (全成功 or 全ロールバック)。
      //   求は各 row の want_* に含めて 1 回の INSERT で完結
      //   (card_wanted_links への二次書込は廃止 = per-card link ループ不要)。
      const { error } = await supabase.from('cards').insert(rows)
      if (error) throw error

      Alert.alert('出品完了', `${rows.length}点を出品しました。`, [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/mypage' as never),
        },
      ])
    } catch (err) {
      console.error('[bulk][handleSubmit]', err)
      const message =
        typeof err === 'object' &&
        err != null &&
        'message' in err &&
        typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : '出品に失敗しました。'
      Alert.alert('出品エラー', message)
    } finally {
      setSubmitting(false)
    }
  }

  // 属性シートを閉じる。補足が入っていれば履歴に記録して育てる。
  //   source='listing_note' で補足専用プールに記録 (メンバー/種類 free text とは分離、
  //   補足チップにメンバー名が混じらない)。
  const handleCloseSheet = () => {
    if (activePoint != null && userId != null) {
      const note = activePoint.note.trim()
      if (note !== '') {
        void recordListingKeyword(userId, note, 'listing_note')
      }
    }
    setActivePointId(null)
  }

  // step-back: タップ → 求 → 作品 → 写真 → choose の順に 1 段ずつ戻る。
  //   タップ画面の戻り = 求ステップへ (点はそのまま保持、求を編集し直せる)。
  const backFromTap = () => {
    setActivePointId(null)
    setWantDone(false)
  }
  // 求ステップの戻り = 作品選択へ。作品を変えると求フィルタ前提が崩れるわけではないが、
  //   点の属性 (旧 work のメンバー) が残るため、属性ありなら Alert で確認しリセット。
  const backFromWant = () => {
    const hasAttrs = points.some(
      (p) => p.characters.length + p.itemTypes.length > 0 || p.note.trim() !== '',
    )
    if (!hasAttrs) {
      setWork(null)
      return
    }
    Alert.alert(
      '作品を変更しますか?',
      `入力済みの${getMemberLabel(work?.category ?? null)}・グッズ種類・補足はリセットされます。番号の位置 (タップした場所) は残ります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '作品を変更',
          style: 'destructive',
          onPress: () => {
            // 座標 (xPct/yPct) は残し、属性のみクリア。
            setPoints((prev) =>
              prev.map((p) => ({ ...p, characters: [], itemTypes: [], note: '' })),
            )
            setActivePointId(null)
            setWork(null)
          },
        },
      ],
    )
  }
  const backFromWork = () => setImage(null)
  const backFromPhoto = () => {
    if (router.canGoBack()) router.back()
  }

  // 各点に最低 1 個の属性 (メンバー or 種類) が入っているか。
  const allPointsHaveAttrs =
    points.length > 0 &&
    points.every((p) => p.characters.length + p.itemTypes.length >= 1)
  // 出品可能: 全点に属性 AND 共通求が充足 (求グループ + 求メンバー、single-page と同基準)。
  const isBulkWantDone =
    bulkWant.works.length >= 1 && bulkWant.characters.length >= 1
  const canProceed = allPointsHaveAttrs && isBulkWantDone

  // ── STEP 1: 写真未選択 → ピッカー起動画面 ──
  if (image == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="1枚から複数出品" onBack={backFromPhoto} />
        <View style={styles.pickWrap}>
          <Ionicons name="images-outline" size={44} color={colors.textTertiary} />
          <Text style={styles.pickTitle}>まとめ撮りした写真を選んでください</Text>
          <Text style={styles.pickSub}>
            複数のグッズが写った写真を1枚選び、{'\n'}
            出品したいグッズを写真上でタップします。
          </Text>
          <View style={styles.pickCtaWrap}>
            <PrimaryCTA label="写真を選ぶ" onPress={handlePickImage} size="lg" />
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP 2: 作品/グループ選択 (冒頭で 1 回、N 商品で共通) ──
  if (work == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="作品・グループを選ぶ" onBack={backFromWork} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={80}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.workContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.workLead}>
              この写真のグッズは、どの作品・グループですか?
            </Text>
            <Text style={styles.workSub}>
              1枚の写真は1つの作品・グループを想定しています。メンバーや種類は、この後グッズごとに選びます。
            </Text>
            <WorkSection value={work} onChange={setWork} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ── STEP 2.5: 求を入力 (N 商品共通・master 構造化・グループ+メンバー必須) ──
  if (!wantDone) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="求める商品を入力" onBack={backFromWant} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={80}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.workContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.workLead}>この出品で受け付けたい「求」は?</Text>
            <Text style={styles.workSub}>
              この写真から出品するすべてのグッズに共通の求です。
              「同シリーズ」を選ぶと、各グッズと同じ作品・種別で他メンバーを集められます。
            </Text>
            <View style={{ marginTop: spacing.lg }}>
              <WantMasterSection
                value={bulkWant}
                onChange={setBulkWant}
                userId={userId}
                offerWork={work}
                offerItemTypes={[]}
                sameSeriesItemTypeLabel="各グッズと同じ種別"
              />
            </View>
          </ScrollView>
          <View style={styles.ctaWrap}>
            {!isBulkWantDone && (
              <Text style={styles.emptyHint}>
                求グループと求{getMemberLabel(work?.category ?? null)}を入れてください
              </Text>
            )}
            <PrimaryCTA
              label="次へ"
              onPress={() => setWantDone(true)}
              disabled={!isBulkWantDone}
              size="lg"
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ── STEP 4: 出品前の最終確認 (全量をまとめて確認、各項目から修正へ戻れる) ──
  if (reviewMode) {
    const workName =
      work != null ? getWorkById(work.workId)?.display_name_ja ?? work.workId : ''
    // 共通求 (bulkWant) の構造化表示。同シリーズ ON は各 card の work/種別を流用するため
    //   作品 = 譲 work、種別 = 「各グッズと同じ種別」と表示する。
    const wantMemberLabel = getMemberLabel(work?.category ?? null)
    const wantWorkName = bulkWant.sameSeriesAsOffer
      ? workName
      : bulkWant.works
          .map((id) => getWorkById(id)?.display_name_ja ?? id)
          .join('、')
    const wantCharNames = bulkWant.characters
      .map((id) => getCharacterById(id)?.display_name_ja ?? id)
      .join('、')
    const wantTypeNames = bulkWant.sameSeriesAsOffer
      ? '各グッズと同じ種別'
      : bulkWant.itemTypes
          .map((id) => getItemTypeById(id)?.display_name_ja ?? id)
          .join('・')
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader
          title="出品内容の確認"
          subtitle={`${points.length}点`}
          onBack={() => setReviewMode(false)}
        />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.reviewContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 元写真 + バッジ (タップで STEP3 の編集へ戻る) */}
          <Pressable
            style={styles.reviewImageWrap}
            onLayout={(ev: LayoutChangeEvent) =>
              setContainerSize({
                width: ev.nativeEvent.layout.width,
                height: ev.nativeEvent.layout.height,
              })
            }
            onPress={() => setReviewMode(false)}
          >
            {image != null && (
              <Image
                source={{ uri: image.uri }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
            )}
            {rect.w > 0 &&
              points.map((pt, idx) => (
                <View
                  key={pt.id}
                  style={[
                    styles.badge,
                    {
                      left: rect.x + pt.xPct * rect.w - BADGE_SIZE / 2,
                      top: rect.y + pt.yPct * rect.h - BADGE_SIZE / 2,
                    },
                  ]}
                >
                  <Text style={styles.badgeText}>{idx + 1}</Text>
                </View>
              ))}
          </Pressable>

          {/* 作品 (共通) */}
          <View style={styles.reviewSummaryRow}>
            <Text style={styles.reviewSummaryLabel}>作品・グループ</Text>
            <Text style={styles.reviewSummaryValue} numberOfLines={1}>
              {workName}
            </Text>
          </View>

          {/* 各商品 (タップで該当の属性シートへ) */}
          <Text style={styles.reviewSectionTitle}>出品するグッズ ({points.length}点)</Text>
          {points.map((pt, idx) => {
            const memberNames = pt.characters.map((c) => getCharacterById(c)?.display_name_ja ?? c)
            const typeNames = pt.itemTypes.map((t) => getItemTypeById(t)?.display_name_ja ?? t)
            return (
              <Pressable
                key={pt.id}
                style={styles.reviewItemRow}
                onPress={() => {
                  setReviewMode(false)
                  setActivePointId(pt.id)
                }}
              >
                <View style={styles.reviewItemBadge}>
                  <Text style={styles.badgeText}>{idx + 1}</Text>
                </View>
                <View style={styles.reviewItemBody}>
                  <Text style={styles.reviewItemMain} numberOfLines={1}>
                    {memberNames.length > 0 ? memberNames.join('、') : '(メンバー未設定)'}
                  </Text>
                  {typeNames.length > 0 && (
                    <Text style={styles.reviewItemSub} numberOfLines={1}>
                      {typeNames.join('・')}
                    </Text>
                  )}
                  {pt.note.trim() !== '' && (
                    <Text style={styles.reviewItemNote} numberOfLines={2}>
                      補足: {pt.note.trim()}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            )
          })}

          {/* 共通の求 (タップで求ステップへ) — master 構造化表示 */}
          <Pressable
            style={styles.reviewWantRow}
            onPress={() => {
              setReviewMode(false)
              setWantDone(false)
            }}
          >
            <View style={styles.reviewItemBody}>
              <Text style={styles.reviewSectionTitle}>求める商品（共通）</Text>
              {bulkWant.sameSeriesAsOffer && (
                <Text style={styles.reviewItemNote}>譲と同シリーズのグッズを求む</Text>
              )}
              <Text style={styles.reviewItemSub} numberOfLines={3}>
                {`求作品: ${wantWorkName !== '' ? wantWorkName : '—'}`}
              </Text>
              <Text style={styles.reviewItemSub} numberOfLines={3}>
                {`求${wantMemberLabel}: ${wantCharNames !== '' ? wantCharNames : '—'}`}
              </Text>
              <Text style={styles.reviewItemSub} numberOfLines={2}>
                {`求種別: ${wantTypeNames !== '' ? wantTypeNames : '（指定なし）'}`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        </ScrollView>

        {/* 出品する (ここで初めて N insert) */}
        <View style={styles.ctaWrap}>
          <Text style={styles.reviewConfirmHint}>
            {points.length}点をまとめて出品します。この操作で全商品が公開されます。
          </Text>
          <PrimaryCTA
            label={`${points.length}点を出品する`}
            onPress={handleSubmit}
            loading={submitting}
            size="lg"
          />
        </View>
      </SafeAreaView>
    )
  }

  // ── STEP 3: 写真上をタップ → 点追加 → 各点の属性シート ──
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title="出品するグッズをタップ"
        subtitle={`${points.length}点`}
        onBack={backFromTap}
      />

      <View style={styles.hintRow}>
        <Ionicons name="hand-left-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.hintText}>
          写真上をタップして、そのグッズの属性を入力します。番号をタップで編集。
        </Text>
      </View>

      {/* 写真 + 番号バッジ overlay。overflow:hidden で純 RN クリップ (native 依存なし)。 */}
      <Pressable
        onPress={handleImageTap}
        style={styles.imageContainer}
        onLayout={(ev: LayoutChangeEvent) =>
          setContainerSize({
            width: ev.nativeEvent.layout.width,
            height: ev.nativeEvent.layout.height,
          })
        }
      >
        <Image
          source={{ uri: image.uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
        />

        {rect.w > 0 &&
          points.map((pt, idx) => {
            // 属性未入力の点は視覚的に区別 (薄め + 破線枠)。
            const incomplete = pt.characters.length + pt.itemTypes.length === 0
            return (
              <Pressable
                key={pt.id}
                onPress={() => handleOpenPoint(pt.id)}
                hitSlop={8}
                style={[
                  styles.badge,
                  incomplete && styles.badgeIncomplete,
                  {
                    // 実画像矩形基準: 矩形原点 + 元画像割合 * 矩形サイズ - バッジ半径
                    left: rect.x + pt.xPct * rect.w - BADGE_SIZE / 2,
                    top: rect.y + pt.yPct * rect.h - BADGE_SIZE / 2,
                  },
                ]}
              >
                <Text style={styles.badgeText}>{idx + 1}</Text>
              </Pressable>
            )
          })}
      </Pressable>

      {/* 写真を撮り直す */}
      <Pressable onPress={handleRetakePhoto} style={styles.retakeRow} hitSlop={8}>
        <Ionicons name="camera-reverse-outline" size={16} color={colors.primary} />
        <Text style={styles.retakeText}>写真を選び直す</Text>
      </Pressable>

      {/* 確認へ進む */}
      <View style={styles.ctaWrap}>
        {!canProceed && (
          <Text style={styles.emptyHint}>
            {points.length === 0
              ? '出品したいグッズを1つ以上タップしてください'
              : `すべての番号に、${getMemberLabel(work?.category ?? null)}か種類を1つ以上入れてください`}
          </Text>
        )}
        <PrimaryCTA
          label={canProceed ? `確認へ進む（${points.length}点）` : '確認へ進む'}
          onPress={() => setReviewMode(true)}
          disabled={!canProceed}
          size="lg"
        />
      </View>

      {/* 属性シート (点ごと): メンバー / 種類。作品は冒頭で選択済のため出さない。 */}
      <Modal
        visible={activePoint != null}
        transparent
        animationType="slide"
        onRequestClose={handleCloseSheet}
      >
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            {activePoint != null && (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>
                    {points.findIndex((p) => p.id === activePoint.id) + 1} 番のグッズ
                  </Text>
                  <Pressable
                    onPress={handleCloseSheet}
                    hitSlop={12}
                    style={styles.sheetClose}
                  >
                    <Ionicons name="close" size={22} color={colors.textSecondary} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={styles.sheetScrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.sheetSectionLabel}>{getMemberLabel(work?.category ?? null)}</Text>
                  <CharactersSection
                    value={activePoint.characters}
                    onChange={(v) => updatePoint(activePoint.id, { characters: v })}
                    workId={workId}
                    userId={userId}
                  />

                  <View style={styles.sheetDivider} />

                  <Text style={styles.sheetSectionLabel}>グッズ種類</Text>
                  <ItemsSection
                    value={activePoint.itemTypes}
                    onChange={(v) => updatePoint(activePoint.id, { itemTypes: v })}
                    userId={userId}
                  />

                  <View style={styles.sheetDivider} />

                  <Text style={styles.sheetSectionLabel}>
                    商品の状態・補足<Text style={styles.sheetOptional}>（任意）</Text>
                  </Text>
                  {/* 履歴チップ: 直近によく打った商品補足。タップで補足欄に挿入。 */}
                  {history.length > 0 && (
                    <View style={styles.chipsRow}>
                      {history.map((h) => (
                        <Pressable
                          key={h}
                          onPress={() => handleInsertChip(activePoint.id, h)}
                          style={({ pressed }) => [
                            styles.historyChip,
                            pressed && styles.historyChipPressed,
                          ]}
                        >
                          <Text style={styles.historyChipText} numberOfLines={1}>
                            {h}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <TextInput
                    style={styles.noteInput}
                    value={activePoint.note}
                    onChangeText={(v) => updatePoint(activePoint.id, { note: v })}
                    placeholder="例: 傷なし、未開封、スリーブ付き、初回盤特典"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    textAlignVertical="top"
                  />
                </ScrollView>

                <View style={styles.sheetActions}>
                  <Pressable
                    onPress={() => handleRemovePoint(activePoint.id)}
                    style={styles.sheetDeleteBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={styles.sheetDeleteText}>この番号を削除</Text>
                  </Pressable>
                  <View style={styles.sheetDoneWrap}>
                    <PrimaryCTA
                      label="完了"
                      onPress={handleCloseSheet}
                      size="md"
                    />
                  </View>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  // 作品選択 (STEP 2)
  workContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  workLead: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  workSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  wantIntro: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  // 確認画面 (STEP 4)
  reviewContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  reviewImageWrap: {
    height: 240,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  reviewSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  reviewSummaryLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  reviewSummaryValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  reviewSectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  reviewItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  reviewItemBadge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reviewItemBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  reviewItemMain: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  reviewItemSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  reviewItemNote: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    lineHeight: 16,
  },
  reviewWantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    marginTop: spacing.sm,
  },
  reviewConfirmHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  // 写真未選択
  pickWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  pickTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  pickSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  pickCtaWrap: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  // ヒント
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  hintText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  // 写真コンテナ (contain 表示。letterbox 余白は暗色で写真領域を際立たせる)
  imageContainer: {
    flex: 1,
    marginHorizontal: spacing.base,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  // 番号バッジ (select.tsx の bboxBadge を踏襲、coral 塗り)
  badge: {
    position: 'absolute',
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.textInverse,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  // 属性未入力の点 (薄め + 破線枠で「未完了」を示す)
  badgeIncomplete: {
    backgroundColor: colors.textTertiary,
    borderStyle: 'dashed',
  },
  // 属性シート (Modal)
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingTop: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  sheetClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    maxHeight: 420,
  },
  sheetScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  sheetSectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.lg,
  },
  sheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sheetDeleteText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.error,
  },
  sheetDoneWrap: {
    flex: 1,
  },
  sheetOptional: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textTertiary,
  },
  // 補足履歴チップ
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  historyChip: {
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.backgroundMuted,
  },
  historyChipPressed: {
    opacity: 0.6,
  },
  historyChipText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    minHeight: 72,
  },
  // 撮り直し
  retakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  retakeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  // CTA
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    gap: spacing.sm,
  },
  emptyHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
