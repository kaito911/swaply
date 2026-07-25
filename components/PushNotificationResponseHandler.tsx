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
// 本 PR でやらないこと:
//   - setNotificationHandler (foreground 表示制御) は別 PR
//   - pending deep link queue (未ログイン時の resume) は別 PR

import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useEffect, useRef } from 'react'

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
