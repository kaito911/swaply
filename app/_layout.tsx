import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors } from '@/constants/theme'
import { AuthProvider, useAuthContext } from '@/providers/AuthProvider'
import { BadgeProvider } from '@/providers/BadgeProvider'
import { MasterCacheProvider } from '@/providers/MasterCacheProvider'
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

        <Stack.Screen
          name="wants"
          options={{ headerShown: false }} // ★ updated
        />

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
      </Stack>
    </>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <BadgeProvider>
        <MasterCacheProvider>
          <RootNavigator />
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