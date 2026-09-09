// lib/imageProcessing.ts
//
// 出品/アバター/求参考などの画像を、アップロード前に JPEG へ統一しつつ
// 長辺上限までリサイズする共通処理。
//
// 背景:
//   - iPhone のカメラ標準形式 HEIC は Anthropic Vision API が受け付けず、
//     detect-bbox の矩形検出が実データで機能しない (実ユーザー出品が全滅)。
//   - expo-image-picker の base64:true では HEIC→JPEG 変換されないことが実機で確定。
//   - 原寸画像 (例 1179×2556) がそのまま Storage に入り、表示時のメモリ圧の原因になる。
//   → expo-image-manipulator で明示的に JPEG 変換 + 長辺リサイズする。
//
// ★失敗の扱い (監査:高 への対応):
//   変換に失敗したら元 uri を返さず ImagePreparationError を throw する。
//   「出品を止めない」より「JPEG で保存される」ことを優先する。呼出側は必ず catch し、
//   画像を採用せず (プレビューにも出さず) 再試行を促す。
//
// API:
//   ★expo-image-manipulator 14 では manipulateAsync が deprecated のため、
//     新しい context API (ImageManipulator.manipulate(uri).resize(...).renderAsync()
//     → ImageRef.saveAsync(...)) を使う。SaveFormat は現行 API。
//     ImageManipulatorContext / ImageRef はいずれも SharedObject 継承で release() を持つ。

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

/** 出品・会場・求参考画像の長辺上限 (px)。一括出品の矩形検出精度のため小さくしすぎない。 */
export const LISTING_IMAGE_MAX_LONG_EDGE = 2000
/** アバターの長辺上限 (px)。 */
export const AVATAR_IMAGE_MAX_LONG_EDGE = 512

export type PreparedImage = { uri: string; width: number; height: number }

/** 画像の JPEG 変換に失敗したことを表すエラー。呼出側は catch して画像を採用しない。 */
export class ImagePreparationError extends Error {
  constructor(message = '画像を処理できませんでした') {
    super(message)
    this.name = 'ImagePreparationError'
  }
}

/**
 * ImagePicker が返した asset を JPEG に統一し、必要なら長辺を maxLongEdge までリサイズする。
 *
 *   - 長辺 <= maxLongEdge → リサイズしない (JPEG 変換のみ)。
 *   - 長辺 > maxLongEdge  → ★長辺側だけ resize 指定 (もう一方は比率自動維持)。
 *     ★width:max を無条件指定すると縦長が拡大されるため、必ず長辺を判定する。
 *   - resize action が無くても renderAsync→saveAsync(JPEG) で再エンコード = HEIC→JPEG 変換される。
 *   - ★変換後の uri と width/height を返す (bulk のタップUI が変換後寸法で contain 計算するため)。
 *   - ★失敗時は ImagePreparationError を throw (元 uri は返さない)。console.warn は残す。
 *   - ImageManipulatorContext / ImageRef は成功・失敗の双方で release() する (finally)。
 */
export async function prepareImageForUpload(
  asset: { uri: string; width?: number; height?: number },
  opts: { maxLongEdge: number },
): Promise<PreparedImage> {
  try {
    const context = ImageManipulator.manipulate(asset.uri)
    try {
      const { width, height } = asset
      if (width != null && height != null && width > 0 && height > 0) {
        const longEdge = Math.max(width, height)
        if (longEdge > opts.maxLongEdge) {
          context.resize(
            width >= height
              ? { width: opts.maxLongEdge }
              : { height: opts.maxLongEdge },
          )
        }
      }
      const rendered = await context.renderAsync()
      try {
        // uri/width/height は saveAsync 解決時にプリミティブとして確定 (native 参照ではない)
        // ため、下の release() 後も安全に返せる。
        const result = await rendered.saveAsync({
          compress: 0.85,
          format: SaveFormat.JPEG,
        })
        return { uri: result.uri, width: result.width, height: result.height }
      } finally {
        try {
          rendered.release()
        } catch {
          // release 失敗は無害 (double-release 等)。握って続行。
        }
      }
    } finally {
      try {
        context.release()
      } catch {
        // 同上。
      }
    }
  } catch (e) {
    console.warn('[prepareImageForUpload] manipulate failed', e)
    throw new ImagePreparationError()
  }
}
