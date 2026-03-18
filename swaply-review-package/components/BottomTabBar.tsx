// components/BottomTabBar.tsx
import { colors, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import React from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

type VisibleTab = {
  name: 'index' | 'propose' | 'mypage'
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
    name: 'propose',
    icon: 'swap-horizontal-outline',
    iconActive: 'swap-horizontal',
    label: '提案/取引',
  },
  {
    name: 'mypage',
    icon: 'person-outline',
    iconActive: 'person',
    label: 'マイページ',
  },
]

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
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
        <Ionicons
          name={isFocused ? tab.iconActive : tab.icon}
          size={22}
          color={isFocused ? colors.primary : colors.textTertiary}
        />
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
          {tab.label}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <View style={styles.leftTabs}>
          {renderTab(TABS[0])}
          {renderTab(TABS[1])}
        </View>

        <View style={styles.centerSpace} />

        <View style={styles.rightTabs}>
          {renderTab(TABS[2])}
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/listing/new' as never)}
        style={({ pressed }) => [
          styles.fabWrap,
          pressed && styles.fabWrapPressed,
        ]}
        hitSlop={14}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </LinearGradient>
        <Text style={styles.fabLabel}>出品</Text>
      </Pressable>
    </View>
  )
}

const TAB_BAR_BOTTOM = Platform.OS === 'ios' ? 26 : spacing.sm

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: spacing.base,
    paddingBottom: TAB_BAR_BOTTOM,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 12,
  },
  leftTabs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightTabs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  centerSpace: {
    width: 84,
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
  fabWrap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: TAB_BAR_BOTTOM + 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 10000,
  },
  fabWrapPressed: {
    opacity: 0.9,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 14,
  },
  fabLabel: {
    marginTop: 4,
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700',
  },
})