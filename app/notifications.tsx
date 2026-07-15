// app/notifications.tsx
//
// 通知画面 — β1 では「今対応が必要なこと」一覧として機能する。
//
// 設計判断 (β1):
//   - notifications テーブルや push 通知は本リリースでは導入しない。
//   - 既存 BadgeProvider の 3 軸 (pendingOfferCount / receivedHoldCount /
//     venueTradeUnreadCount) を使って動的に要対応カードを描画する。
//   - 0 件なら空状態。1 件以上ある軸ごとにカードを 1 枚表示。
//   - 押下で既存の取引タブ / 会場タブへ遷移し、ユーザーが自然に動けるようにする。
//
// β1 後の拡張案 (本タスクスコープ外):
//   - notifications テーブル + push 通知 (会場 Hold / venue DM 起点)
//   - 通常取引 DM 機能 + 未読通知
//   - 求リスト / いいねイベントの notifications カード化

import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useBadge } from '@/providers/BadgeProvider'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type ActionItem = {
  key: string
  icon: keyof typeof Ionicons.glyphMap
  title: string
  subtitle: string
  onPress: () => void
}

export default function NotificationsScreen() {
  const {
    pendingOfferCount,
    receivedHoldCount,
    venueTradeUnreadCount,
    totalNotificationCount,
    refreshBadge,
  } = useBadge()

  // 画面 focus 時に最新化。BadgeProvider は AppState 'active' でも refresh するが、
  // 通知画面遷移直後は確実に最新値を見せたいため明示再取得。
  useFocusEffect(
    useCallback(() => {
      void refreshBadge()
    }, [refreshBadge])
  )

  // 表示候補。count > 0 のものだけ描画する。
  const items: ActionItem[] = []

  if (pendingOfferCount > 0) {
    items.push({
      key: 'pending-offer',
      icon: 'mail-open-outline',
      title: '相手からの申請があります',
      subtitle: `${pendingOfferCount}件の申請に対応してください`,
      // 取引タブ (申請 / 相手から サブタブが既定値)。
      onPress: () => router.push('/trades' as never),
    })
  }

  if (receivedHoldCount > 0) {
    items.push({
      key: 'received-hold',
      icon: 'location-outline',
      title: '会場で交換の提案が届いています',
      subtitle: `${receivedHoldCount}件の交換の提案があります`,
      // 会場 Hold inbox は per-venue 動線 (/venue/holds は venueId 必須) のため、
      // 直接遷移ではなく会場タブの一覧経由で該当会場に入ってもらう。
      onPress: () => router.push('/venue-tab' as never),
    })
  }

  if (venueTradeUnreadCount > 0) {
    items.push({
      key: 'venue-dm-unread',
      icon: 'chatbubble-outline',
      title: '会場交換の未読メッセージがあります',
      subtitle: `${venueTradeUnreadCount}件の未読があります`,
      // venue trade DM も per-trade 動線 (/venue/trade/[id] は trade id 必須)。
      // 同様に会場タブ経由で「成立済」タブ → メッセージを開く で到達する。
      onPress: () => router.push('/venue-tab' as never),
    })
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="通知" />
      {totalNotificationCount === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>今対応が必要な通知はありません</Text>
          <Text style={styles.emptySub}>
            申請や会場の交換、未読メッセージがあるとここに表示されます。
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.actionCard,
                pressed && styles.actionCardPressed,
              ]}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}。${item.subtitle}`}
            >
              <View style={styles.actionIconWrap}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.actionSubtitle} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textTertiary}
              />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  emptySub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionCardPressed: {
    opacity: 0.85,
    backgroundColor: colors.backgroundMuted,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextWrap: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  actionSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
})
