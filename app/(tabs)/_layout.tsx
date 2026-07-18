import { CustomTabBar } from '@/components/BottomTabBar'
import { Tabs } from 'expo-router'
import React from 'react'
import { View } from 'react-native'

export default function TabsLayout() {
  return (
    // 出品導線は下タブ中央「出品」action タブ (BottomTabBar) に移設したため、
    // グローバル出品 FAB (SubmitFab) は廃止。会場詳細の専用 FAB は venue/[id].tsx で別途表示。
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
        }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="search" />
        <Tabs.Screen name="trades" />
        <Tabs.Screen name="venue-tab" />

        {/* 求リスト (wants): 道2 で cards.want_* が正になり責務喪失のため下タブから外す。
            画面ファイルは温存し href:null で /wants ルートのみ維持 (⑤で経路整理)。 */}
        <Tabs.Screen name="wants" options={{ href: null }} />

        {/* ボトム外 (案 E5、refactor_plan §3.14-5): 右上アバターからのみ到達 */}
        <Tabs.Screen name="mypage" options={{ href: null }} />

        <Tabs.Screen name="home" options={{ href: null }} />
      </Tabs>
    </View>
  )
}
