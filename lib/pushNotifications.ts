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

import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

import { supabase } from './supabase'

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
      return null
    }
  } catch (err) {
    console.warn('[pushNotifications] upsert push_tokens exception', err)
    return null
  }

  return token
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
