// components/BottomTabBar.tsx
import { colors, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { router } from 'expo-router'
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
  name: 'index' | 'propose' | 'mypage' | 'search' | 'venue-tab'
  icon: keyof typeof Ionicons.glyphMap
  iconActive: keyof typeof Ionicons.glyphMap
  label: string
}

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
    name: 'propose',
    icon: 'swap-horizontal-outline',
    iconActive: 'swap-horizontal',
    label: '提案/取引',
  },
  {
    name: 'venue-tab',
    icon: 'location-outline',
    iconActive: 'location',
    label: '会場',
  },
  {
    name: 'mypage',
    icon: 'person-outline',
    iconActive: 'person',
    label: 'マイページ',
  },
]

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { bottom: insetBottom } = useSafeAreaInsets()
  const { pendingOfferCount } = useBadge()
  const currentRouteName = state.routes[state.index]?.name ?? ''

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

    const showBadge = tab.name === 'propose' && pendingOfferCount > 0

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
            color={isFocused ? colors.primary : colors.textTertiary}
          />
          {showBadge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {pendingOfferCount > 99 ? '99+' : String(pendingOfferCount)}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
          {tab.label}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={[styles.wrap, { paddingBottom: insetBottom }]}>
      <View style={styles.bar}>
        {renderTab(TABS[0])}
        {renderTab(TABS[1])}
        <Pressable
          onPress={() => router.push('/listing/new/image' as never)}
          style={({ pressed }) => [
            styles.tabItem,
            pressed && styles.tabItemPressed,
          ]}
          hitSlop={12}
        >
          <Ionicons
            name="add-circle-outline"
            size={22}
            color={colors.textTertiary}
          />
          <Text style={styles.tabLabel}>出品</Text>
        </Pressable>
        {renderTab(TABS[2])}
        {renderTab(TABS[3])}
        {renderTab(TABS[4])}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.backgroundCard,
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
