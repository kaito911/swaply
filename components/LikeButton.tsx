// components/LikeButton.tsx
// 写真 overlay 配置の♡ボタン (メルカリ式)。HomeLargeCard / HomeSmallCard / listing[id] で使用。
// 3.5a (機能 H): 旧画面下部の「いいね」ボタンを廃止し、写真右上/右下に overlay 配置。
//
// toggle ロジックは親側で実装 (myWants 配列を読んで isLiked 判定 + add/archive 切替)。
// 本 component は visual と onToggle 呼出のみ責任。
// 半透明白背景 + Heart アイコン filled/outline で視認性 + 状態を表現。

import { colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { Pressable, StyleSheet, type ViewStyle } from 'react-native'

interface LikeButtonProps {
  isLiked: boolean
  onToggle: () => void
  size?: 'small' | 'medium'
  /** Pressable に追加する style (position: 'absolute' + top/right/left/bottom を親で指定) */
  style?: ViewStyle | ViewStyle[]
  /** 二度押し抑止 (toggle 中) */
  disabled?: boolean
}

export function LikeButton({
  isLiked,
  onToggle,
  size = 'small',
  style,
  disabled = false,
}: LikeButtonProps) {
  const dim = size === 'small' ? 28 : 36
  const iconSize = size === 'small' ? 16 : 20

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        { width: dim, height: dim, borderRadius: dim / 2 },
        pressed && !disabled && styles.btnPressed,
        disabled && styles.btnDisabled,
        style,
      ]}
    >
      <Ionicons
        name={isLiked ? 'heart' : 'heart-outline'}
        size={iconSize}
        color={isLiked ? colors.error : colors.textPrimary}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  btnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  btnDisabled: {
    opacity: 0.6,
  },
})
