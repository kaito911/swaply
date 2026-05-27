import { CustomTabBar } from '@/components/BottomTabBar'
import { Tabs } from 'expo-router'
import React from 'react'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="trades" />
      <Tabs.Screen name="venue-tab" />
      <Tabs.Screen name="search" />

      {/* ボトム外 (案 E5、refactor_plan §3.14-5): 右上アバターからのみ到達 */}
      <Tabs.Screen name="mypage" options={{ href: null }} />

      <Tabs.Screen name="home" options={{ href: null }} />
    </Tabs>
  )
}
