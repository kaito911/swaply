// lib/ensureMediaPermission.ts
//
// カメラ / 写真ライブラリの権限を確認し、未許可なら「設定を開く」導線を出す共通ヘルパー。
//
// 背景: iOS は一度権限を拒否するとアプリから再度ダイアログを出せない (canAskAgain=false)。
//   その状態だと出品で写真が使えず詰む。拒否を検知したら Alert で状況を伝え、
//   Linking.openSettings() で iOS 設定内の Swaply ページへ直接飛ばす (自動 ON は iOS 仕様上不可)。
//
// native 追加なし: expo-image-picker (導入済) + Linking (RN コア)。OTA-safe。
//
// 使い方: 画像取得の直前に
//   if (!(await ensureMediaPermission('camera'))) return
import * as ImagePicker from 'expo-image-picker'
import { Alert, Linking } from 'react-native'

export type MediaPermissionKind = 'camera' | 'library'

/**
 * 権限を要求し、granted なら true。未許可なら設定誘導 Alert を出して false。
 * 呼び出し側は false のとき launch 系を実行せず return する。
 */
export async function ensureMediaPermission(kind: MediaPermissionKind): Promise<boolean> {
  const res =
    kind === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()

  if (res.status === 'granted') return true

  const isCamera = kind === 'camera'
  Alert.alert(
    isCamera ? 'カメラの許可が必要です' : '写真へのアクセス許可が必要です',
    (isCamera
      ? 'グッズやカードの写真を撮影するにはカメラの許可が必要です。'
      : '写真を選ぶには写真へのアクセス許可が必要です。') +
      '\n「設定を開く」→ Swaply から許可してください。',
    [
      { text: '閉じる', style: 'cancel' },
      {
        text: '設定を開く',
        onPress: () => {
          void Linking.openSettings()
        },
      },
    ],
  )
  return false
}
