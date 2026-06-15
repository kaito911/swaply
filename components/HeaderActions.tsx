// components/HeaderActions.tsx
// タブヘッダー右側の 3 アイコン (通知ベル / いいね ♡ / マイページアバター)。
// マイページ画面 active 時は Avatar 強調 (primary 色) + tap 無効化。
// 通知バッジ count は 3.5d でデータソース投入予定 (3.5a 現在は表示なし)。
//
// 案 E5 (refactor_plan §3.14-5): マイページはボトムタブ外 (href: null)。
// 右上アバターからのみ到達 — 全画面共通の唯一の入口。
//
// Phase A (2026-06): ♡ アイコンの遷移先を /wants から /likes へ切替。
// UI は「いいね」、DB は liked_cards、求リスト (wanted_cards) とは別概念。
// いいねと求リストは別画面・別テーブル・別責務。

import { colors, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router, usePathname } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useBadge } from '@/providers/BadgeProvider'

export function HeaderActions() {
  // (tabs) などの route group は pathname から strip されるため、
  // mypage screen の pathname は '/mypage' 固定。href: null で hidden tab 化しても変化なし。
  const pathname = usePathname()
  const isMypageActive = pathname === '/mypage'
  // 通知ベルバッジ: 「対応が必要なこと」の合算 (pending offer + 受信 Hold +
  // venue DM 未読)。0 件なら非表示、99 超は 99+ 表示。
  const { totalNotificationCount } = useBadge()
  const showBellBadge = totalNotificationCount > 0

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.push('/notifications')}
        hitSlop={8}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
        {showBellBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {totalNotificationCount > 99 ? '99+' : String(totalNotificationCount)}
            </Text>
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.push('/likes')}
        hitSlop={8}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
      >
        <Ionicons name="heart-outline" size={22} color={colors.textPrimary} />
      </Pressable>

      <Pressable
        onPress={isMypageActive ? undefined : () => router.push('/mypage')}
        hitSlop={8}
        disabled={isMypageActive}
        style={({ pressed }) => [styles.iconBtn, pressed && !isMypageActive && styles.iconBtnPressed]}
      >
        <Ionicons
          name={isMypageActive ? 'person' : 'person-outline'}
          size={22}
          color={isMypageActive ? colors.primary : colors.textPrimary}
        />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  iconBtnPressed: {
    backgroundColor: colors.backgroundMuted,
  },
  // 通知ベル赤丸バッジ。BottomTabBar のバッジと視覚を揃える。
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
})
