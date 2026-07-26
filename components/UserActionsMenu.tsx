// components/UserActionsMenu.tsx
// ユーザーへの通報・ブロックの「…」メニュー (単一実装)。DM画面 / 取引画面のヘッダーで共用。
//   - このユーザーを通報する → 既存 /report をユーザー通報 (targetType:'user') で流用。
//   - このユーザーをブロックする / 解除する → addUserBlock/removeUserBlock。
//   ★ブロックは既存 DM・既存取引に一切遡及させない。本コンポーネントは blockedIds を
//     メニュー文言のトグルにのみ使い、呼出画面の送信可否や表示判定には関与しない。
//   ★メッセージ単体通報は非対応 (p_message_id は client 未対応)。
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { colors } from '@/constants/theme'
import {
  addUserBlock,
  fetchMyBlockedUserIds,
  removeUserBlock,
} from '@/lib/supabase'

export function UserActionsMenu({
  userId,
  userLabel,
  iconColor,
}: {
  userId: string | null
  userLabel: string
  iconColor?: string
}) {
  const [blockedIds, setBlockedIds] = useState<string[]>([])

  const refreshBlocked = useCallback(async () => {
    try {
      setBlockedIds(await fetchMyBlockedUserIds())
    } catch (error) {
      console.warn('[UserActionsMenu] fetchMyBlockedUserIds', error)
    }
  }, [])

  useEffect(() => {
    void refreshBlocked()
  }, [refreshBlocked])

  const missingTarget = () => {
    Alert.alert(
      '操作できません',
      '相手の情報を取得できませんでした。画面を開き直してください。'
    )
  }

  const handleReport = useCallback(() => {
    if (userId == null || userId === '') {
      missingTarget()
      return
    }
    router.push({
      pathname: '/report',
      params: { targetType: 'user', targetId: userId, targetLabel: userLabel },
    } as never)
  }, [userId, userLabel])

  const handleBlockToggle = useCallback(() => {
    if (userId == null || userId === '') {
      missingTarget()
      return
    }
    const blocked = blockedIds.includes(userId)
    if (blocked) {
      Alert.alert(
        'ブロックを解除しますか？',
        '解除すると、このユーザーと再び新しい交換のやり取りができるようになります。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '解除する',
            onPress: async () => {
              try {
                await removeUserBlock(userId)
                await refreshBlocked()
              } catch (error) {
                console.warn('[UserActionsMenu] removeUserBlock', error)
                Alert.alert('エラー', 'ブロックの解除に失敗しました。')
              }
            },
          },
        ]
      )
    } else {
      Alert.alert(
        'このユーザーをブロックしますか？',
        'ブロックすると、このユーザーとの新しい交換のやり取りが始まらなくなります。\n\n※ この取引のメッセージは、これまでどおり続けられます。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: 'ブロックする',
            style: 'destructive',
            onPress: async () => {
              try {
                await addUserBlock(userId)
                await refreshBlocked()
              } catch (error) {
                console.warn('[UserActionsMenu] addUserBlock', error)
                Alert.alert('エラー', 'ブロックに失敗しました。')
              }
            },
          },
        ]
      )
    }
  }, [userId, blockedIds, refreshBlocked])

  const openMenu = useCallback(() => {
    const blocked = userId != null && blockedIds.includes(userId)
    Alert.alert(userLabel, undefined, [
      { text: 'このユーザーを通報する', onPress: handleReport },
      {
        text: blocked
          ? 'このユーザーのブロックを解除する'
          : 'このユーザーをブロックする',
        style: blocked ? 'default' : 'destructive',
        onPress: handleBlockToggle,
      },
      { text: 'キャンセル', style: 'cancel' },
    ])
  }, [userId, userLabel, blockedIds, handleReport, handleBlockToggle])

  return (
    <Pressable
      onPress={openMenu}
      hitSlop={8}
      accessibilityLabel="通報・ブロック"
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Ionicons
        name="ellipsis-horizontal"
        size={22}
        color={iconColor ?? colors.textPrimary}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  buttonPressed: {
    backgroundColor: colors.backgroundMuted,
  },
})
