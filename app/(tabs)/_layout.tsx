import { CustomTabBar } from '@/components/BottomTabBar'
import { SubmitFab } from '@/components/SubmitFab'
import { Tabs } from 'expo-router'
import React from 'react'
import { View } from 'react-native'

export default function TabsLayout() {
  return (
    // Tabs と FAB を兄弟で配置。FAB は absolute で右下に overlay、
    // すべてのタブ画面に共通で表示される (Stack push された画面では自動で非表示)。
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
        }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="search" />
        {/* 求リスト: app/wants.tsx から (tabs)/wants.tsx に移動して下部タブ化。
            既存の /wants 路由は (tabs) group が collapse されるため不変。 */}
        <Tabs.Screen name="wants" />
        <Tabs.Screen name="trades" />
        <Tabs.Screen name="venue-tab" />

        {/* ボトム外 (案 E5、refactor_plan §3.14-5): 右上アバターからのみ到達 */}
        <Tabs.Screen name="mypage" options={{ href: null }} />

        <Tabs.Screen name="home" options={{ href: null }} />
      </Tabs>
      <SubmitFab />
    </View>
  )
}
