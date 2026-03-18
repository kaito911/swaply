import { router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/providers/AuthProvider'

export default function MyPageScreen() {
  const { session } = useAuthContext()
  const [loading, setLoading] = useState(false)

  const email = useMemo(() => {
    return session?.user?.email ?? 'メールアドレス不明'
  }, [session])

  const userId = useMemo(() => {
    return session?.user?.id ?? 'ユーザーID不明'
  }, [session])

  const handleLogout = () => {
    Alert.alert('ログアウトしますか？', '', [
      {
        text: 'キャンセル',
        style: 'cancel',
      },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true)

            const { error } = await supabase.auth.signOut()
            if (error) {
              throw error
            }

            router.replace('/(auth)/login')
          } catch (error) {
            console.error('[MyPageScreen][handleLogout]', error)
            Alert.alert('エラー', 'ログアウトに失敗しました')
          } finally {
            setLoading(false)
          }
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>マイページ</Text>
          <Text style={styles.subtitle}>
            現在ログイン中のアカウントを確認できます
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ログイン中アカウント</Text>

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>メールアドレス</Text>
            <Text style={styles.infoValue}>{email}</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>ユーザーID</Text>
            <Text style={styles.infoSubValue}>{userId}</Text>
          </View>
        </View>

        <Pressable
          style={[styles.logoutButton, loading && styles.disabledButton]}
          onPress={handleLogout}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.logoutButtonText}>ログアウト</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7FB',
  },

  container: {
    flex: 1,
    backgroundColor: '#F7F7FB',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },

  header: {
    marginBottom: 20,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#18181B',
  },

  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#71717A',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE8FA',
    marginBottom: 16,
  },

  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 14,
  },

  infoBlock: {
    marginBottom: 14,
  },

  infoLabel: {
    fontSize: 12,
    color: '#8A8499',
    marginBottom: 4,
  },

  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#18181B',
  },

  infoSubValue: {
    fontSize: 13,
    lineHeight: 20,
    color: '#52525B',
  },

  logoutButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoutButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  disabledButton: {
    opacity: 0.6,
  },
})