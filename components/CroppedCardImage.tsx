// components/CroppedCardImage.tsx
//
// 一覧カード (HomeLargeCard / HomeSmallCard / FeedGridCard) の出品画像を、detect-bbox が
// 検出した外接矩形の範囲だけ拡大して「1 枚の独立した商品写真」のように見せる表示専用
// コンポーネント。1 枚の写真から複数のグッズを一括出品したとき、各カードがそれぞれのグッズ
// だけを主役として並ぶことを目的とする。
//
// ★座標規約: bbox_left / bbox_top / bbox_w / bbox_h は「元画像基準 (レターボックス除外)・
//   0〜1 の割合」(正は supabase/functions/detect-bbox/index.ts のヘッダ)。
//
// ★画像そのものは加工しない。overflow:hidden の窓 (window) の中で Image を絶対配置し、実サイズ
//   に拡大 + 平行移動 (= scale/translate 相当) して見せる。歪みなく切り抜くには元画像の縦横比が
//   必要なため onLoad で natural サイズを取得する。
//
// ★④-2 カード切り抜き仕様 (縦長矩形基準):
//   トレカ等の「縦長矩形」を主対象とし、矩形の高さがカード高さを埋めるよう拡大する:
//       scale = cardHeight / (bbox_h × imgH)
//   縦は矩形がちょうど収まり (上下の余白/隣接物なし)、横ははみ出しをクランプして矩形を中央寄せ
//   する (画像がカードより広い通常ケースでは背景を出さず隣接領域でカード幅を満たす)。
//   ・横長矩形 (rectPxW > rectPxH) → ★現状はログのみで対処保留。全体を cover 表示に fallback。
//   ・矩形 (bbox) が無い出品 / natural・窓サイズ取得前 → 全体を cover 表示 (= 従来挙動)。
//
// bbox_left/top/w/h が 4 つとも非 null のときだけ切り抜く。呼び出し側は bboxRectFromCard で
// 4 値の非 null 判定を一元化して渡す (どれか 1 つでも null なら null = 全体表示)。
// ※ detect-bbox は 4 列を 1 文で同時に埋めるため「一部だけ null」は本番に存在しない前提。

import { colors } from '@/constants/theme'
import { Card } from '@/lib/types'
import { Image } from 'expo-image'
import React, { useEffect, useRef, useState } from 'react'
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

type CropStyle = {
  position: 'absolute'
  width: number
  height: number
  left: number
  top: number
}

export function CroppedCardImage({ uri, bbox }: CroppedCardImageProps) {
  // 窓 (コンテナ) の実寸と元画像の natural サイズ。両方揃うまでは全体表示に fallback。
  const [container, setContainer] = useState<{ w: number; h: number } | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  // 横長矩形の警告ログを 1 度だけ出すためのガード。
  const landscapeLoggedRef = useRef(false)

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0 && height > 0) setContainer({ w: width, h: height })
  }

  const ready =
    bbox != null &&
    bbox.w > 0 &&
    bbox.h > 0 &&
    container != null &&
    container.w > 0 &&
    container.h > 0 &&
    natural != null &&
    natural.w > 0 &&
    natural.h > 0

  // 検出矩形の px 寸法 (元画像基準)。縦長 (rectPxH >= rectPxW) を切り抜き対象とする。
  const rectPxW = bbox != null && natural != null ? bbox.w * natural.w : 0
  const rectPxH = bbox != null && natural != null ? bbox.h * natural.h : 0
  const isLandscapeRect = ready && rectPxW > rectPxH

  // ★横長矩形は現状ログのみで対処保留 (縦長=トレカ等を主対象に設計)。
  useEffect(() => {
    if (isLandscapeRect && !landscapeLoggedRef.current) {
      landscapeLoggedRef.current = true
      console.warn(
        '[CroppedCardImage] landscape bbox detected; crop deferred, showing full image',
        { rectPxW: Math.round(rectPxW), rectPxH: Math.round(rectPxH) },
      )
    }
  }, [isLandscapeRect, rectPxW, rectPxH])

  // 縦長矩形のみ切り抜き (横長・未準備・矩形なしは全体 cover 表示に fallback)。
  const canCrop = ready && !isLandscapeRect

  let cropStyle: CropStyle | null = null
  if (canCrop && bbox != null && container != null && natural != null) {
    const CW = container.w
    const CH = container.h
    // ★scale = cardHeight / (bbox_h × imgH)。全体画像の表示サイズ = 元画像 px × scale。
    //   矩形高さがちょうど CH を埋める (DH = CH / bbox.h、上下は矩形で満ちる)。
    const scale = CH / (bbox.h * natural.h)
    const DW = natural.w * scale
    const DH = natural.h * scale
    // 矩形を水平中央に。画像がカードより広ければ左右のはみ出しをクランプし背景を出さない。
    const centerLeft = -bbox.left * DW + (CW - bbox.w * DW) / 2
    const left =
      DW >= CW
        ? Math.min(0, Math.max(CW - DW, centerLeft)) // 画像でカード幅を満たす (背景を出さない)
        : (CW - DW) / 2 // 画像がカードより狭い稀ケースは中央 (左右に背景トークンが出る)
    // 矩形上端を 0 に。矩形が縦を満たすため上下に背景は出ない。
    const top = -bbox.top * DH
    cropStyle = { position: 'absolute', width: DW, height: DH, left, top }
  }

  return (
    <View style={styles.window} onLayout={onLayout}>
      <Image
        source={{ uri }}
        // 切り抜き時は元画像を実寸配置 (縦横比維持) するため contentFit は無関係 (歪まない)。
        // 全体表示 fallback では従来どおり cover で枠を中央クロップ。
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
    // 画像がカードより狭い稀ケースで出る余白の背景。新規カラーは定義せず既存トークンを使用。
    backgroundColor: colors.backgroundMuted,
  },
  full: {
    width: '100%',
    height: '100%',
  },
})
