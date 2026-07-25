// components/PushTokenSync.tsx
//
// ★通知トークンのサイレント再同期 (副作用専用・UIなし)。
//
// 目的:
//   pre-prompt (PushPermissionPrePrompt) は端末1回きりで registerForPushNotificationsAsync を
//   呼ぶが、以下のケースでトークンが更新されず通知が永久不達になる:
//     - 再インストールでトークンが変わった / iOS がトークンをローテーションした
//     - ユーザーが後から設定アプリで通知を許可した
//   send-push はトークン0件でも 200 {sent:0} を返すため、サイレント失敗になる。
//
// 対策:
//   - ログイン済み (userId あり) かつ通知権限が granted の時だけ、
//     起動時 / フォアグラウンド復帰時に token を取得して push_tokens へ upsert する。
//   - ★未許可のときは OS ダイアログを出さない (pre-prompt の初回体験を壊さない)。
//   - ★前回同期した token と同じなら upsert をスキップ (毎起動のリモート呼び出しを避ける)。
//   - addPushTokenListener でローテーションを即検知 (起動中の変更も取りこぼさない)。
//
// pre-prompt の表示ロジックは一切変更しない。本 component は許可を「要求」せず、
// 既に granted な状態を「同期」するだけ。
import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import type { Subscription } from 'expo-notifications'

import { useAuthContext } from '@/providers/AuthProvider'
import {
  addPushTokenRotationListener,
  syncPushTokenIfGranted,
} from '@/lib/pushNotifications'

export function PushTokenSync() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null
  const appState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    if (userId == null) return

    // 起動時 / userId 確定時に 1 回同期。
    // ★force:true — marker を無視して必ず upsert し、DB 行の存在を保証する。
    //   サーバ側で token 行が削除された (DeviceNotRegistered 自動削除等) 場合でも、
    //   コールドスタートで自己修復させる (Option B)。低頻度なのでコスト微小。
    void syncPushTokenIfGranted(userId, { force: true })

    // トークンローテーションのリスナー登録。
    const rotationSub: Subscription = addPushTokenRotationListener(userId)

    // フォアグラウンド復帰 (background/inactive → active) で再同期。
    const appStateSub = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        const prev = appState.current
        appState.current = next
        if (
          (prev === 'background' || prev === 'inactive') &&
          next === 'active'
        ) {
          void syncPushTokenIfGranted(userId)
        }
      }
    )

    return () => {
      rotationSub.remove()
      appStateSub.remove()
    }
  }, [userId])

  return null
}
