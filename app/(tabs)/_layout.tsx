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
      <Tabs.Screen name="mypage" />
      <Tabs.Screen name="venue-tab" />

      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="search" />
    </Tabs>
  )
}
