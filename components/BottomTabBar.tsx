// components/BottomTabBar.tsx
import { colors, spacing } from '@/constants/theme'
import { VENUE_DARK } from '@/lib/venueIgnition'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import React from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBadge } from '@/providers/BadgeProvider'

type VisibleTab = {
  name: 'index' | 'trades' | 'search' | 'venue-tab' | 'wants'
  icon: keyof typeof Ionicons.glyphMap
  iconActive: keyof typeof Ionicons.glyphMap
  label: string
}

// 確定タブ構成: ホーム / 検索 / 求リスト / 取引 / 会場 の 5 スロット (均等配置)。
// 出品は下部タブから外し、右下 FAB (SubmitFab) に移動。
// マイページはボトム外、右上 HeaderActions のアバターからのみ到達可能。
const TABS: VisibleTab[] = [
  {
    name: 'index',
    icon: 'home-outline',
    iconActive: 'home',
    label: 'ホーム',
  },
  {
    name: 'search',
    icon: 'search-outline',
    iconActive: 'search',
    label: '検索',
  },
  {
    name: 'wants',
    icon: 'bookmark-outline',
    iconActive: 'bookmark',
    label: '求リスト',
  },
  {
    name: 'trades',
    icon: 'swap-horizontal-outline',
    iconActive: 'swap-horizontal',
    label: '取引',
  },
  {
    name: 'venue-tab',
    icon: 'location-outline',
    iconActive: 'location',
    label: '会場',
  },
]

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { bottom: insetBottom } = useSafeAreaInsets()
  const { pendingOfferCount, receivedHoldCount, venueTradeUnreadCount } =
    useBadge()
  const currentRouteName = state.routes[state.index]?.name ?? ''
  // 会場タブ在席時だけタブバーを暗地(会場背景と同値 VENUE_DARK)になじませる。他タブは白のまま。
  //   スナップ切替 (案1)。iOS26 glass 無縁 (自前 View)。
  const isVenue = currentRouteName === 'venue-tab'
  const inactiveColor = isVenue ? 'rgba(255,255,255,0.55)' : colors.textTertiary

  const renderTab = (tab: VisibleTab) => {
    const route = state.routes.find((r) => r.name === tab.name)
    if (route == null) return null

    const isFocused = currentRouteName === tab.name

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      })

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name)
      }
    }

    // PR2: trades タブは pending offer。
    // PR5: venue タブは受信 Hold + venue_trade DM 未読の合算。二重バッジにはしない。
    const badgeCount =
      tab.name === 'trades'
        ? pendingOfferCount
        : tab.name === 'venue-tab'
        ? receivedHoldCount + venueTradeUnreadCount
        : 0
    const showBadge = badgeCount > 0

    return (
      <Pressable
        key={tab.name}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tabItem,
          pressed && styles.tabItemPressed,
        ]}
        hitSlop={12}
      >
        <View style={styles.iconWrap}>
          <Ionicons
            name={isFocused ? tab.iconActive : tab.icon}
            size={22}
            color={isFocused ? colors.primary : inactiveColor}
          />
          {showBadge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {badgeCount > 99 ? '99+' : String(badgeCount)}
              </Text>
            </View>
          )}
        </View>
        <Text
          style={[
            styles.tabLabel,
            !isFocused && { color: inactiveColor },
            isFocused && styles.tabLabelActive,
          ]}
        >
          {tab.label}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={[styles.wrap, isVenue && styles.wrapDark, { paddingBottom: insetBottom }]}>
      <View style={[styles.bar, isVenue && styles.barDark]}>
        {TABS.map(renderTab)}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.backgroundCard,
  },
  // 会場タブ在席時: 暗地(会場背景と同値 VENUE_DARK)になじませる。
  wrapDark: {
    backgroundColor: VENUE_DARK,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    minHeight: 72,
    backgroundColor: colors.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  // 会場タブ在席時: 暗地bg + 上端は薄い白 hairline のみで領域を示す (色差で分けない)。
  barDark: {
    backgroundColor: VENUE_DARK,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  tabItem: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    marginTop: 3,
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
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
