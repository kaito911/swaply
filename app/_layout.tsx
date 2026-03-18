import { colors } from '@/constants/theme'
import { AuthProvider, useAuthContext } from '@/providers/AuthProvider'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

function RootNavigator() {
  const { session, loading } = useAuthContext()

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
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

  return (
    <>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="listing" options={{ headerShown: false }} />
        <Stack.Screen name="trade" options={{ headerShown: false }} />

        <Stack.Screen
          name="listing/new"
          options={{
            headerShown: true,
            title: '出品する',
            presentation: 'modal',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
            headerBackTitle: '',
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
            headerBackTitle: '',
          }}
        />

        <Stack.Screen
          name="trust/[id]"
          options={{
            headerShown: true,
            title: 'Trustプロフィール',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
            headerBackTitle: '',
          }}
        />

        <Stack.Screen
          name="search"
          options={{
            headerShown: true,
            title: '検索',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
            headerBackTitle: '',
          }}
        />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
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