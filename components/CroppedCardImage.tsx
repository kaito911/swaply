// components/CroppedCardImage.tsx
//
// 一覧カード (HomeLargeCard / HomeSmallCard / FeedGridCard) の出品画像を、
// detect-bbox が検出した外接矩形の範囲だけ拡大して「1 枚の独立した商品写真」のように
// 見せる表示専用コンポーネント。1 枚の写真から複数のグッズを一括出品したとき、各カードが
// それぞれのグッズだけを主役として並ぶことを目的とする。
//
// ★座標規約: bbox_left / bbox_top / bbox_w / bbox_h は「元画像基準 (レターボックス除外)・
//   0〜1 の割合」(正は supabase/functions/detect-bbox/index.ts のヘッダ)。
//
// ★画像そのものは加工しない。overflow:hidden の窓 (window) の中で Image を実サイズに拡大 +
//   平行移動し、矩形が窓に収まる (案B = contain) ように配置する。歪みなく切り抜くには元画像の
//   縦横比が必要なため onLoad で natural サイズを取得する。
//   ・矩形 (bbox) が無い出品        → 全体を cover 表示 (= 従来挙動)
//   ・natural / 窓サイズ取得前       → 全体を cover 表示 (揃った時点で切り抜きへ切替)
//
// ★案B (contain) 採用理由: 交換判断にはグッズ全体が見えることが必要。cover だと矩形の縦横比
//   (本番実データで約 1:1.9) がカード枠と食い違い上下/左右が欠け絵柄が判断できなくなる。
//   contain は矩形全体を必ず表示し、余白 (レターボックス) には窓の背景 (既存 theme トークン
//   colors.backgroundMuted) を出す。
//
// bbox_left/top/w/h が 4 つとも非 null のときだけ切り抜く。呼び出し側は bboxRectFromCard で
// 4 値の非 null 判定を一元化して渡す (どれか 1 つでも null なら null = 全体表示)。

import { colors } from '@/constants/theme'
import { Card } from '@/lib/types'
import { Image } from 'expo-image'
import React, { useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'

export type BboxRect = { left: number; top: number; w: number; h: number }

/**
 * bbox_left/top/w/h が 4 つとも非 null のときのみ矩形を返す。1 つでも null なら null
 * (= 呼び出し側は全体表示に fallback する)。
 */
export function bboxRectFromCard(card: Card): BboxRect | null {
  const { bbox_left, bbox_top, bbox_w, bbox_h } = card
  if (
    bbox_left != null &&
    bbox_top != null &&
    bbox_w != null &&
    bbox_h != null
  ) {
    return { left: bbox_left, top: bbox_top, w: bbox_w, h: bbox_h }
  }
  return null
}

interface CroppedCardImageProps {
  uri: string
  /** 4 値すべて非 null の矩形。null のとき画像全体を cover 表示する。 */
  bbox: BboxRect | null
}

export function CroppedCardImage({ uri, bbox }: CroppedCardImageProps) {
  // 窓 (コンテナ) の実寸と元画像の natural サイズ。両方揃うまでは全体表示に fallback。
  const [container, setContainer] = useState<{ w: number; h: number } | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) setContainer({ w: width, h: height })
  }

  const canCrop =
    bbox != null &&
    bbox.w > 0 &&
    bbox.h > 0 &&
    container != null &&
    container.w > 0 &&
    container.h > 0 &&
    natural != null &&
    natural.w > 0 &&
    natural.h > 0

  // 切り抜き時の Image レイアウト (px 絶対配置)。案B (contain): 矩形が窓に「収まる」よう
  // 全体画像の表示サイズ (DW×DH, 縦横比 r 維持) を決め、矩形を窓の中央に置く (余白は窓の背景)。
  let cropStyle: { position: 'absolute'; width: number; height: number; left: number; top: number } | null =
    null
  if (canCrop && bbox != null && container != null && natural != null) {
    const r = natural.w / natural.h // 元画像の縦横比 (歪ませない)
    const CW = container.w
    const CH = container.h
    const DH = Math.min(CW / (bbox.w * r), CH / bbox.h)
    const DW = r * DH
    const left = -bbox.left * DW + (CW - bbox.w * DW) / 2
    const top = -bbox.top * DH + (CH - bbox.h * DH) / 2
    cropStyle = { position: 'absolute', width: DW, height: DH, left, top }
  }

  return (
    <View style={styles.window} onLayout={onLayout}>
      <Image
        source={{ uri }}
        // 切り抜き時は縦横比 r ちょうどの枠に置くため contentFit は無関係 (歪まない)。
        // 全体表示 fallback では従来どおり cover で正方枠を中央クロップ。
        style={cropStyle ?? styles.full}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
        onLoad={(e) => {
          const w = e?.source?.width
          const h = e?.source?.height
          if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
            setNatural((prev) => prev ?? { w, h })
          }
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  window: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    // contain の余白 (レターボックス) に出る背景。新規カラーは定義せず既存トークンを使用。
    backgroundColor: colors.backgroundMuted,
  },
  full: {
    width: '100%',
    height: '100%',
  },
})
