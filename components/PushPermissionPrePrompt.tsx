// components/PushPermissionPrePrompt.tsx
//
// Push 通知 PR2: 通知許可 pre-prompt UI。
//
// 設計判断:
//   - OS の通知許可ポップアップを直接出さず、まずアプリ内で「通知をオンにしますか?」と
//     尋ねる (pre-prompt パターン)。「通知を許可する」を押した時のみ
//     registerForPushNotificationsAsync(userId) を呼び、その中で OS ポップアップが出る。
//   - 一度表示したら AsyncStorage に保存し、同一端末で二度と自動表示しない。
//     「あとで」も同様 (毎回出続けないため)。
//   - registerForPushNotificationsAsync は permission denied / 非実機 / Expo Go /
//     Web / token 取得失敗時に null を返す設計。本コンポーネントは null を正常系として
//     扱い、UI 上は単に閉じるだけにする (過剰な toast を出さない)。
//   - userId が null の間は表示判定を行わない (Auth gate 越え前)。
//   - 将来マイページ設定から再度有効化できるよう、AsyncStorage key は v1 サフィックス
//     付きで将来 bump の余地を残す。
//   - PR2 では呼出側はホームのみ。マイページ「通知設定」導線は別 PR。
//   - PR2 では logout / 退会導線への revoke 接続は行わない (PR1 helper はあるが未配線)。

import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { registerForPushNotificationsAsync } from '@/lib/pushNotifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

// 表示済みフラグの AsyncStorage key。
// v1 サフィックスは将来「再度尋ねる」キャンペーンで bump できるよう確保。
export const PUSH_PRE_PROMPT_SEEN_KEY = 'swaply_push_pre_prompt_seen_v1'

// マウント直後に出すと、ユーザーがホーム画面を認識する前に modal が被さるため
// 軽い猶予を入れる。β1 用の初期値。
const SHOW_DELAY_MS = 1200

type Props = {
  userId: string | null
}

export function PushPermissionPrePrompt({ userId }: Props) {
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 表示判定: userId が取れていて、かつ未表示の場合のみ visible へ。
  // AsyncStorage 失敗時は安全側に倒し「表示しない」(エラー連発回避)。
  useEffect(() => {
    if (userId == null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    AsyncStorage.getItem(PUSH_PRE_PROMPT_SEEN_KEY)
      .then((val) => {
        if (cancelled || val === 'true') return
        timer = setTimeout(() => {
          if (!cancelled) setVisible(true)
        }, SHOW_DELAY_MS)
      })
      .catch((err) => {
        console.warn('[PushPrePrompt] AsyncStorage.getItem failed', err)
      })

    return () => {
      cancelled = true
      if (timer != null) clearTimeout(timer)
    }
  }, [userId])

  // 「通知を許可する」: seen を先に立てて、register を試みる。
  // register の成否に関わらず pre-prompt は再表示しない。
  const handleAllow = async () => {
    if (userId == null || submitting) return
    setSubmitting(true)
    try {
      await AsyncStorage.setItem(PUSH_PRE_PROMPT_SEEN_KEY, 'true')
    } catch (err) {
      console.warn('[PushPrePrompt] mark seen (allow) failed', err)
    }
    try {
      await registerForPushNotificationsAsync(userId)
      // null 返却 (拒否 / 非実機 / Expo Go / Web / token 取得失敗) は helper 側で warn 済。
      // ここでは UI 上区別せず閉じる。
    } catch (err) {
      // helper は throw しない設計だが念のため握る (アプリは絶対落とさない)。
      console.warn('[PushPrePrompt] register unexpectedly threw', err)
    } finally {
      setSubmitting(false)
      setVisible(false)
    }
  }

  // 「あとで」: 何もせず seen を立てて閉じる。
  const handleLater = async () => {
    if (submitting) return
    try {
      await AsyncStorage.setItem(PUSH_PRE_PROMPT_SEEN_KEY, 'true')
    } catch (err) {
      console.warn('[PushPrePrompt] mark seen (later) failed', err)
    }
    setVisible(false)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleLater}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>通知をオンにしますか？</Text>
          <Text style={styles.body}>
            Hold申請・DM・交換申請を見逃さないように、通知を受け取れます。あとからでも変更できます。
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              submitting && styles.buttonDisabled,
              pressed && !submitting && styles.primaryButtonPressed,
            ]}
            onPress={handleAllow}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="通知を許可する"
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>通知を許可する</Text>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={handleLater}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="あとで"
          >
            <Text style={styles.secondaryButtonText}>あとで</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 27, 54, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  body: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  primaryButton: {
    height: 48,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textTertiary,
  },
})
