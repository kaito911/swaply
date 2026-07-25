// lib/pushNotifications.ts
//
// Push 通知 PR1: token 保存基盤 helper。
//
// 提供関数:
//   - registerForPushNotificationsAsync(userId)
//     → 権限取得 → Expo Push Token 取得 → push_tokens upsert
//     → 取得 token を返す (null = 取得不可 = 無権限 / 非実機 / Web 等)
//   - revokePushTokenForUser(userId, expoPushToken?)
//     → ログアウト等で呼ぶ。token 指定時はそれ 1 件、未指定時は user の全 token 削除。
//
// 設計判断:
//   - Expo Go や iOS Simulator では Push Token を取得できない。Device.isDevice で早期 return。
//   - Web (Platform.OS === 'web') も Expo Push 非対応のため早期 return。
//   - permission denied / token 取得失敗は throw せず null を返す。呼出側で握る。
//   - upsert は (user_id, expo_push_token) を conflict キーに 1 行管理。
//     同端末で再起動毎に呼んでも重複行は作らない。
//   - projectId は app.json の extra.eas.projectId を Constants 経由で参照。
//
// 本 PR では呼出側 (許可フロー UI / オンボーディング / マイページ設定) には接続しない。
// PR2 で接続予定。

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

import { supabase } from './supabase'

// 最後に push_tokens へ upsert した token を端末に記録するキー。
// 起動/復帰の度にリモート upsert が走らないよう、token 変化時だけ書き込む (要件3)。
const LAST_SYNCED_PUSH_TOKEN_KEY = 'swaply_last_synced_push_token_v1'

type Platform_ = 'ios' | 'android'

function getCurrentPlatform(): Platform_ | null {
  if (Platform.OS === 'ios') return 'ios'
  if (Platform.OS === 'android') return 'android'
  return null
}

function getEasProjectId(): string | null {
  // expo-constants の Config 型は extra を Record<string, unknown> として扱うため、
  // ネスト参照に optional chain を多用する。
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined
  return extra?.eas?.projectId ?? null
}

/**
 * 端末で Push 通知の許可を取得し、Expo Push Token を発行して
 * Supabase の push_tokens テーブルに upsert する。
 *
 * 戻り値:
 *   - 成功: 取得した Expo Push Token (ExponentPushToken[XXXXXX] 形式の文字列)
 *   - 失敗 / 未取得: null
 *     (非実機 / Web / 権限拒否 / projectId 不明 / token 取得失敗 / DB upsert 失敗)
 *
 * 例外:
 *   - 内部の Notifications / supabase 呼出が失敗しても throw しない (null 返却)。
 *   - 呼出側はオプショナルな成功を期待する設計。
 */
export async function registerForPushNotificationsAsync(
  userId: string
): Promise<string | null> {
  // (a) Web / Simulator は早期 return
  if (Platform.OS === 'web') {
    return null
  }
  if (!Device.isDevice) {
    console.warn(
      '[pushNotifications] Push notifications require a physical device, skipping token registration'
    )
    return null
  }

  const platform = getCurrentPlatform()
  if (platform == null) {
    console.warn('[pushNotifications] Unsupported platform:', Platform.OS)
    return null
  }

  // (b) 権限取得
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing
    if (status !== 'granted') {
      const result = await Notifications.requestPermissionsAsync()
      status = result.status
    }
    if (status !== 'granted') {
      // ユーザが拒否した。今回は静かに終了 (PR2 の許可フロー UI で説明済の想定)。
      return null
    }
  } catch (err) {
    console.warn('[pushNotifications] permission request failed', err)
    return null
  }

  // (c) projectId 確認
  const projectId = getEasProjectId()
  if (projectId == null) {
    console.warn(
      '[pushNotifications] EAS projectId not found in app.json extra.eas.projectId'
    )
    return null
  }

  // (d) Expo Push Token 取得
  let token: string
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    })
    token = tokenResponse.data
  } catch (err) {
    console.warn('[pushNotifications] getExpoPushTokenAsync failed', err)
    return null
  }

  // (e) Supabase push_tokens upsert
  const ok = await upsertPushToken(userId, token, platform)
  if (!ok) return null

  // 最後に同期した (userId, token) 組を記録 (syncPushTokenIfGranted の差分判定用)
  try {
    await AsyncStorage.setItem(LAST_SYNCED_PUSH_TOKEN_KEY, `${userId}:${token}`)
  } catch (err) {
    if (__DEV__) console.warn('[pushNotifications] setItem last-synced failed', err)
  }

  return token
}

// push_tokens upsert の共通ロジック。成功=true / 失敗=false。
async function upsertPushToken(
  userId: string,
  token: string,
  platform: Platform_
): Promise<boolean> {
  try {
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: token,
        platform,
        device_id: null,
      },
      { onConflict: 'user_id,expo_push_token' }
    )
    if (error != null) {
      console.warn('[pushNotifications] upsert push_tokens failed', error)
      return false
    }
    return true
  } catch (err) {
    console.warn('[pushNotifications] upsert push_tokens exception', err)
    return false
  }
}

/**
 * ★起動時/フォアグラウンド復帰時のトークン同期 (サイレント)。
 *
 * 通知権限が既に granted の場合のみ、Expo Push Token を取得して push_tokens へ upsert する。
 * ★未許可の場合は何もしない (OS ダイアログを出さない = pre-prompt の初回体験を壊さない・要件1)。
 * ★前回同期した token と同じなら upsert をスキップ (毎起動のリモート呼び出しを避ける・要件3)。
 *
 * これにより「再インストール / iOS のトークンローテーション / 後から設定で許可」でも、
 * 起動時にトークンが更新され、サイレント通知不達を防ぐ。
 *
 * 失敗時は throw せず、__DEV__ でのみログを出す (要件5)。
 */
export async function syncPushTokenIfGranted(userId: string): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return
  const platform = getCurrentPlatform()
  if (platform == null) return

  // (1) 権限が granted か「確認のみ」。requestPermissionsAsync は絶対に呼ばない。
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return
  } catch (err) {
    if (__DEV__) console.warn('[pushNotifications] getPermissions (sync) failed', err)
    return
  }

  // (2) projectId
  const projectId = getEasProjectId()
  if (projectId == null) {
    if (__DEV__) console.warn('[pushNotifications] projectId not found (sync)')
    return
  }

  // (3) token 取得
  let token: string
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId })
    token = res.data
  } catch (err) {
    if (__DEV__) console.warn('[pushNotifications] getExpoPushTokenAsync (sync) failed', err)
    return
  }

  // (4) 前回同期の (userId, token) 組と同じなら skip (差分時のみ upsert・要件3)。
  //   ★キーに userId を含めるのが重要: 同一端末で A→ログアウト→B とログインし直した時、
  //     token は同じでも userId が変わるので upsert が走り、B の行が作られる (③の複数アカウント)。
  const syncedMarker = `${userId}:${token}`
  try {
    const last = await AsyncStorage.getItem(LAST_SYNCED_PUSH_TOKEN_KEY)
    if (last === syncedMarker) return
  } catch (err) {
    if (__DEV__) console.warn('[pushNotifications] getItem last-synced failed', err)
    // 読めない場合は安全側で upsert に進む (二重でも upsert は冪等)
  }

  // (5) upsert + 記録
  const ok = await upsertPushToken(userId, token, platform)
  if (!ok) {
    if (__DEV__) console.warn('[pushNotifications] sync upsert failed for user', userId)
    return
  }
  try {
    await AsyncStorage.setItem(LAST_SYNCED_PUSH_TOKEN_KEY, syncedMarker)
  } catch (err) {
    if (__DEV__) console.warn('[pushNotifications] setItem last-synced (sync) failed', err)
  }
  if (__DEV__) console.log('[pushNotifications] push token synced for user', userId)
}

/**
 * ★Expo のトークン変更リスナー登録 (要件4: 採用)。
 *
 * addPushTokenListener は OS がトークンをローテーションした瞬間に発火する。
 * 起動時 sync だけだと「起動中にローテーションした」ケースを取りこぼすため併用する。
 * granted 前提のイベントだが、念のため upsert 前に権限は確認しない
 * (発火時点で既に token が発行されている = 許可済み)。
 *
 * 戻り値: subscription (呼出側で remove する)。
 */
export function addPushTokenRotationListener(
  userId: string
): Notifications.Subscription {
  return Notifications.addPushTokenListener((tokenData) => {
    const token = tokenData.data
    if (typeof token !== 'string' || token === '') return
    const platform = getCurrentPlatform()
    if (platform == null) return
    void (async () => {
      const ok = await upsertPushToken(userId, token, platform)
      if (ok) {
        try {
          await AsyncStorage.setItem(LAST_SYNCED_PUSH_TOKEN_KEY, `${userId}:${token}`)
        } catch (err) {
          if (__DEV__) console.warn('[pushNotifications] rotation setItem failed', err)
        }
        if (__DEV__) console.log('[pushNotifications] push token rotated & synced')
      } else if (__DEV__) {
        console.warn('[pushNotifications] rotation upsert failed')
      }
    })()
  })
}

/**
 * push_tokens から token を削除する。ログアウト時等に呼ぶ想定。
 *
 * 引数:
 *   - userId: 削除対象ユーザの id
 *   - expoPushToken (任意): 指定時はその 1 行のみ削除、未指定時は当該 user の全行削除
 *
 * 戻り値:
 *   - 成功: void
 *   - 失敗: void (内部で warn)
 *
 * 本 PR では既存 logout 導線にはまだ接続しない (PR2 で接続)。
 */
export async function revokePushTokenForUser(
  userId: string,
  expoPushToken?: string
): Promise<void> {
  try {
    let query = supabase.from('push_tokens').delete().eq('user_id', userId)
    if (expoPushToken != null) {
      query = query.eq('expo_push_token', expoPushToken)
    }
    const { error } = await query
    if (error != null) {
      console.warn('[pushNotifications] revoke push_tokens failed', error)
    }
  } catch (err) {
    console.warn('[pushNotifications] revoke push_tokens exception', err)
  }
}
