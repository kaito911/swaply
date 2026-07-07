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
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
  Alert,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// タップで打った点。xPct/yPct は 0–1 の割合 (原点=元画像の左上、実画像矩形基準)。
type TapPoint = {
  id: string
  xPct: number
  yPct: number
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

async function pickFromCamera(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('権限が必要です', 'カメラへのアクセスを許可してください。')
    return null
  }
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
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('権限が必要です', '写真ライブラリへのアクセスを許可してください。')
    return null
  }
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
  const [image, setImage] = useState<PickedImage | null>(null)
  const [points, setPoints] = useState<TapPoint[]>([])
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // letterbox を除いた実画像矩形 (contain)。タップ判定・座標変換・バッジ描画の基準。
  const rect = image
    ? computeContainRect(containerSize.width, containerSize.height, image.width, image.height)
    : { x: 0, y: 0, w: 0, h: 0 }

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
    setPoints((prev) => [...prev, { id: nextPointId(), xPct, yPct }])
  }

  // バッジのタップ → その点を削除 (番号は index ベースなので自動で振り直し)。
  const handleRemovePoint = (id: string) => {
    setPoints((prev) => prev.filter((p) => p.id !== id))
  }

  const handleRetakePhoto = () => {
    handlePickImage()
  }

  const handleNext = () => {
    // Phase 2-2 で属性シートに接続予定。現状は 2-1 の手触り確認用の暫定ブリッジ。
    Alert.alert(
      '次のステップは準備中です',
      `${points.length}点を選択中。属性の入力 (メンバー / 種類 / 補足) は次のステップで実装します。`,
    )
  }

  const handleCancel = () => {
    if (router.canGoBack()) router.back()
  }

  const canProceed = points.length > 0

  // ── 写真未選択: ピッカー起動画面 ──
  if (image == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="1枚から複数出品" onBack={handleCancel} />
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

  // ── 写真選択済: タップで点を追加 ──
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title="出品するグッズをタップ"
        subtitle={`${points.length}点`}
        onBack={handleCancel}
      />

      <View style={styles.hintRow}>
        <Ionicons name="hand-left-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.hintText}>
          写真上をタップして番号を付けます。番号をもう一度タップで削除。
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
          points.map((pt, idx) => (
            <Pressable
              key={pt.id}
              onPress={() => handleRemovePoint(pt.id)}
              hitSlop={8}
              style={[
                styles.badge,
                {
                  // 実画像矩形基準: 矩形原点 + 元画像割合 * 矩形サイズ - バッジ半径
                  left: rect.x + pt.xPct * rect.w - BADGE_SIZE / 2,
                  top: rect.y + pt.yPct * rect.h - BADGE_SIZE / 2,
                },
              ]}
            >
              <Text style={styles.badgeText}>{idx + 1}</Text>
            </Pressable>
          ))}
      </Pressable>

      {/* 写真を撮り直す */}
      <Pressable onPress={handleRetakePhoto} style={styles.retakeRow} hitSlop={8}>
        <Ionicons name="camera-reverse-outline" size={16} color={colors.primary} />
        <Text style={styles.retakeText}>写真を選び直す</Text>
      </Pressable>

      {/* 次へ */}
      <View style={styles.ctaWrap}>
        {!canProceed && (
          <Text style={styles.emptyHint}>
            出品したいグッズを1つ以上タップしてください
          </Text>
        )}
        <PrimaryCTA
          label={canProceed ? `次へ（${points.length}点）` : '次へ'}
          onPress={handleNext}
          disabled={!canProceed}
          size="lg"
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
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
