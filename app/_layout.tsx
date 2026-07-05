import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors } from '@/constants/theme'
import { PushNotificationResponseHandler } from '@/components/PushNotificationResponseHandler'
import { AuthProvider, useAuthContext } from '@/providers/AuthProvider'
import { BadgeProvider } from '@/providers/BadgeProvider'
import { MasterCacheProvider } from '@/providers/MasterCacheProvider'
import { ToastProvider } from '@/providers/ToastProvider'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import OnboardingScreen, { ONBOARDING_DONE_KEY } from './onboarding'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function RootNavigator() {
  const { session, loading } = useAuthContext()

  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)

  useEffect(() => {
    if (session == null) {
      setOnboardingDone(null)
      return
    }
    AsyncStorage.getItem(ONBOARDING_DONE_KEY).then((val) => {
      setOnboardingDone(val === 'true')
    })
  }, [session])

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={['top']}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    )
  }

  if (session == null) {
    return (
      <>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack>
      </>
    )
  }

  if (onboardingDone === null) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={['top']}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    )
  }

  if (!onboardingDone) {
    return (
      <>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <OnboardingScreen onComplete={() => setOnboardingDone(true)} />
      </>
    )
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="listing" options={{ headerShown: false }} />
        <Stack.Screen name="trade" options={{ headerShown: false }} />

        <Stack.Screen
          name="listing/new"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />

        <Stack.Screen
          name="offer/create"
          options={{
            headerShown: true,
            title: '交換を提案する',
            presentation: 'modal',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
          }}
        />

        <Stack.Screen
          name="offer/counter"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />

        <Stack.Screen
          name="offer/[offerId]"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="trust/[id]"
          options={{ headerShown: false }} // 画面内 ScreenHeader 統一 (3.5a 規約)
        />

        <Stack.Screen
          name="search"
          options={{ headerShown: false }} // ★ updated (3.5a): タブ内 search は画面内 ScreenHeader、root Stack の search は dead config だが整合性のため false に
        />

        {/* wants は app/(tabs)/wants.tsx に移動して下部タブ化したため、
            この root Stack.Screen 登録は不要 (expo-router が (tabs) group 経由で /wants を解決)。 */}

        <Stack.Screen
          name="notifications"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="offer-insights"
          options={{
            headerShown: true,
            title: '成立ログ [dev]',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
          }}
        />

        <Stack.Screen
          name="shipping"
          options={{ headerShown: false }} // ★ updated
        />

        <Stack.Screen
          name="profile-edit"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="shelf"
          options={{
            headerShown: true,
            title: '商品棚',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
          }}
        />

        <Stack.Screen
          name="oshi-edit"
          options={{ headerShown: false }} // ★ updated
        />

        <Stack.Screen
          name="venue/[id]"
          options={{
            headerShown: true,
            title: '会場モード',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="venue/holds"
          options={{
            headerShown: true,
            title: 'Venue Hold一覧',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="venue/my-posts"
          options={{
            headerShown: true,
            title: '自分の会場投稿',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="venue/trade/[id]"
          options={{ headerShown: false }} // 画面内 ScreenHeader 統一 (3.5a 規約)
        />
        <Stack.Screen
          name="legal"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="report"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="account-delete"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <BadgeProvider>
        <MasterCacheProvider>
          {/* Phase B (2026-07-05): 軽量トースト用 Provider。他 Provider に依存しない
              ため最深部に配置。Toast overlay は本 Provider の子ツリー上に render される。 */}
          <ToastProvider>
            {/* PR4-c: Push 通知 tap → deep-link 遷移を担う副作用 component。
                UI は返さず、cold start / foreground / background tap を listen する。
                auth/onboarding gate の外でマウントすることで cold start を取り逃さない。 */}
            <PushNotificationResponseHandler />
            <RootNavigator />
          </ToastProvider>
        </MasterCacheProvider>
      </BadgeProvider>
    </AuthProvider>
  )
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
})