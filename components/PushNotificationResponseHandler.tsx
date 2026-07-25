// components/PushNotificationResponseHandler.tsx
//
// Push 通知 PR4-c: 通知 tap → deep-link 遷移を担う副作用 component。
//
// 役割:
//   - Expo Push 通知の tap response を listen し、payload `data.route` に従って
//     `router.push` で画面遷移する。
//   - cold start (アプリ killed 状態 → 通知 tap で起動) と
//     foreground/background tap の両方を扱う。
//
// 設計判断:
//   - UI は返さない (`return null`)、副作用のみ。
//   - `app/_layout.tsx` の Provider 群の中、`<RootNavigator />` の兄弟として
//     1 度だけマウントする。auth / onboarding gate より外でマウントすることで
//     cold start を取り逃さない。
//   - 未ログイン / onboarding 未完了の状態で tap されても、navigator gate
//     により `router.push` は no-op になるだけでクラッシュしない (β1 受容)。
//     login/onboarding 完了後の resume は本 PR スコープ外、後続 PR で検討。
//
// route allowlist (PR4 で送出される payload に対応):
//   - '/venue-tab'                完全一致 (venue_hold_requested)
//   - '/venue/trade/<UUID>'       UUID 形式チェック付き (venue_trade_message)
//   - 上記以外 / 外部 URL / 任意 path / 不正 UUID は **全て拒否** (console.warn のみ)
//
// dedupe:
//   - cold start 経路 (getLastNotificationResponseAsync) と listener 経路
//     (addNotificationResponseReceivedListener) が同じ response を流す可能性が
//     あるため、`response.notification.request.identifier` を ref で記憶し、
//     同 id の二重発火を抑止する。
//
// cold start 遅延:
//   - navigator マウント完了より早く `router.push` を呼ぶと no-op になるため、
//     getLastNotificationResponseAsync 経路にだけ 500ms の setTimeout を入れる。
//     unmount 後の発火を防ぐため cancelled guard でガード。
//
// foreground 表示制御 (PR-DM 追加):
//   - setNotificationHandler をモジュールスコープで 1 度だけ登録し、アプリ表示中
//     (foreground) でも通知バナー・サウンドを出す。iOS は既定で foreground 中は
//     バナーを出さないため、明示設定が必須。DM 受信中や取引画面閲覧中こそ通知価値が
//     高いので全画面で表示する (画面別抑制は入れない・下記理由)。
//
// 本 PR でやらないこと:
//   - pending deep link queue (未ログイン時の resume) は別 PR

import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// foreground 通知の表示挙動 (モジュール読み込み時に 1 度だけ登録)。
//
// expo-notifications 0.32.17 の NotificationBehavior:
//   - shouldShowAlert は @deprecated → shouldShowBanner / shouldShowList に分割。
//   - iOS では UNNotificationPresentationOptions に直接マップされる。
//     shouldShowBanner=バナー / shouldShowList=通知センター履歴。
//
// 方針 (K 判断待ちのデフォルト):
//   - shouldShowBanner: true  … foreground でもバナーを出す (本対応の主目的)。
//   - shouldShowList:   true  … 通知センターの履歴にも残す (見逃し対策)。
//   - shouldPlaySound:  true  … サウンドを鳴らす。
//   - shouldSetBadge:   false … push payload に badge 値を載せていないため、
//       true でもアプリアイコンバッジは変化しない (誤って 0 クリアする副作用も
//       避ける)。アプリ内タブバッジは BadgeProvider が別管理。将来 payload に
//       badge を載せる設計にする時に true 化を検討する。
//
// 画面別抑制を入れない理由:
//   - 「今開いている画面と同じ相手の DM 通知はバナーを出さない」等は、handler が
//     現在 route を知る必要があり (module ref を navigation listener で更新する等)、
//     複雑化する。まずは全表示のシンプル実装にする。冗長さが問題になれば後続で追加。
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// UUID 形式 (8-4-4-4-12 hex、version 不問、case-insensitive)。
// send-push / notify-on-event 側と同じ tolerant な定義。
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// '/venue/trade/<id>' を切り出すパターン。クエリ / フラグメントは含めない。
const VENUE_TRADE_RE = /^\/venue\/trade\/([^/?#]+)$/

// PR-DM: 通常取引の deep-link。
//   '/offer/<id>'            … 提案詳細 (offer_created/accepted/declined/counter)
//   '/trade/<offerId>'       … 取引詳細 (trade_cancelled/shipment_shipped)
//   '/trade/<offerId>/dm'    … 取引DM (trade_message)
const OFFER_RE = /^\/offer\/([^/?#]+)$/
const TRADE_DETAIL_RE = /^\/trade\/([^/?#]+)$/
const TRADE_DM_RE = /^\/trade\/([^/?#]+)\/dm$/

// 通知 payload `data.route` から、許可された route のみを返す。
// 不正 / 不明 / 外部 URL / UUID 形式不正は null。
function resolveSafeRoute(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null
  const route = (data as { route?: unknown }).route
  if (typeof route !== 'string' || route === '') return null

  if (route === '/venue-tab') return route
  if (route === '/trades') return route

  const venueTrade = route.match(VENUE_TRADE_RE)
  if (venueTrade != null && UUID_RE.test(venueTrade[1])) return route

  const offer = route.match(OFFER_RE)
  if (offer != null && UUID_RE.test(offer[1])) return route

  const tradeDm = route.match(TRADE_DM_RE)
  if (tradeDm != null && UUID_RE.test(tradeDm[1])) return route

  const tradeDetail = route.match(TRADE_DETAIL_RE)
  if (tradeDetail != null && UUID_RE.test(tradeDetail[1])) return route

  return null
}

function navigateTo(route: string) {
  try {
    // expo-router typedRoutes 有効化下では文字列 push に `as never` が必要。
    // 既存コード ('/venue-tab' 等) と同パターン。
    router.push(route as never)
  } catch (err) {
    console.warn('[PushResponseHandler] navigation failed', err)
  }
}

export function PushNotificationResponseHandler() {
  // 同一通知 (request.identifier) で複数経路の二重発火を抑止する用。
  const lastHandledIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let coldStartTimer: ReturnType<typeof setTimeout> | null = null

    const handle = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier
      if (id != null && lastHandledIdRef.current === id) return
      lastHandledIdRef.current = id ?? null

      const data = response.notification.request.content.data
      const safe = resolveSafeRoute(data)
      if (safe == null) {
        // 不正 / 未知 route は何もしない。route のみログに残し、payload 全体は
        // 念のため出さない (将来 sensitive な data が混じる可能性に備える)。
        console.warn(
          '[PushResponseHandler] unsafe or unknown route',
          (data as { route?: unknown } | null | undefined)?.route ?? null,
        )
        return
      }
      navigateTo(safe)
    }

    // (1) cold start: アプリが killed 状態で通知 tap から起動された場合の
    //     最後の response を取得。navigator マウント完了より早いと no-op に
    //     なるため、軽い遅延を入れる。
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (cancelled || response == null) return
        coldStartTimer = setTimeout(() => {
          if (!cancelled) handle(response)
        }, 500)
      })
      .catch((err) => {
        console.warn(
          '[PushResponseHandler] getLastNotificationResponseAsync failed',
          err,
        )
      })

    // (2) foreground / background tap でリアルタイム発火。
    const sub = Notifications.addNotificationResponseReceivedListener(handle)

    return () => {
      cancelled = true
      if (coldStartTimer != null) clearTimeout(coldStartTimer)
      sub.remove()
    }
  }, [])

  return null
}
