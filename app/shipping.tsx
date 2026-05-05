// app/shipping.tsx
// 配送情報設定画面
// マイページ → 配送情報 で遷移
import { fetchShippingAddress, updateShippingAddress } from '@/lib/supabase'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ShippingScreen() {
  const { session, loading: authLoading } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [shippingName, setShippingName] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')

  useEffect(() => {
    if (authLoading) return

    if (userId == null) {
      setLoading(false)
      return
    }

    fetchShippingAddress(userId).then((data) => {
      if (data != null) {
        setShippingName(data.shipping_name ?? '')
        setPostalCode(data.postal_code ?? '')
        setAddressLine1(data.address_line1 ?? '')
        setAddressLine2(data.address_line2 ?? '')
      }
      setLoading(false)
    })
  }, [userId, authLoading])

  const canSave =
    shippingName.trim().length > 0 &&
    postalCode.trim().length > 0 &&
    addressLine1.trim().length > 0

  const handleSave = async () => {
    if (!canSave || saving || userId == null) return

    try {
      setSaving(true)
      await updateShippingAddress({
        userId,
        shippingName: shippingName.trim(),
        postalCode: postalCode.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() !== '' ? addressLine2.trim() : null,
      })
      Alert.alert('保存しました', '配送情報を更新しました。', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (error) {
      console.error('[ShippingScreen][handleSave]', error)
      Alert.alert('エラー', '保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.customHeader}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>配送情報</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.note}>
            配送情報は取引成立後に相手に表示されます。成立前は完全に非公開です。
          </Text>

          <View style={styles.block}>
            <Text style={styles.label}>配送用お名前 *</Text>
            <TextInput
              style={styles.input}
              placeholder="例：山田 太郎"
              value={shippingName}
              onChangeText={setShippingName}
              autoCorrect={false}
            />
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>郵便番号 *</Text>
            <TextInput
              style={styles.input}
              placeholder="例：1234567（ハイフンなし）"
              value={postalCode}
              onChangeText={setPostalCode}
              keyboardType="number-pad"
              maxLength={8}
            />
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>住所（都道府県〜番地）*</Text>
            <TextInput
              style={styles.input}
              placeholder="例：東京都渋谷区1-2-3"
              value={addressLine1}
              onChangeText={setAddressLine1}
              autoCorrect={false}
            />
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>建物名・部屋番号（任意）</Text>
            <TextInput
              style={styles.input}
              placeholder="例：○○マンション101号室"
              value={addressLine2}
              onChangeText={setAddressLine2}
              autoCorrect={false}
            />
          </View>

          <Pressable
            style={[styles.button, (!canSave || saving || userId == null) && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving || userId == null}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>保存する</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: '#F7F7FB',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7FB',
  },
  // ★ added: カスタムヘッダー
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 36,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  headerRight: {
    width: 36,
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  note: {
    fontSize: 13,
    color: '#71717A',
    lineHeight: 20,
    marginBottom: 24,
  },
  block: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ECE8FA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#18181B',
    backgroundColor: '#FFFFFF',
  },
  button: {
    marginTop: 8,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#C4C0D8',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
})
