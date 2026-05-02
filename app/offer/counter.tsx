// app/offer/counter.tsx
// カウンターオファー作成画面
import { colors, radius, spacing } from '@/constants/theme'
import { createCounterOffer } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
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

export default function CounterOfferScreen() {
  const {
    originalOfferId,
    proposerId,
    receiverId,
    proposerCardId,
    receiverCardId,
  } = useLocalSearchParams<{
    originalOfferId: string
    proposerId: string
    receiverId: string
    proposerCardId: string
    receiverCardId: string
  }>()

  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    const amount = adjustmentAmount === '' ? 0 : parseInt(adjustmentAmount, 10)
    if (isNaN(amount)) {
      Alert.alert('入力エラー', '差額は数値で入力してください')
      return
    }

    setLoading(true)
    try {
      await createCounterOffer({
        originalOfferId,
        proposerId,
        receiverId,
        proposerCardId,
        receiverCardId,
        adjustmentAmount: amount === 0 ? null : amount,
        message: message.trim() === '' ? null : message.trim(),
      })
      Alert.alert('送信完了', 'カウンターオファーを送りました', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? 'カウンターオファーの送信に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>差額変更を提案</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>差額金額（円）</Text>
          <Text style={styles.hint}>
            相手に追加で支払ってほしい金額を入力します。あなたが支払う場合はマイナスを付けてください。
          </Text>
          <TextInput
            style={styles.input}
            placeholder="例: 500 または -500"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numbers-and-punctuation"
            value={adjustmentAmount}
            onChangeText={setAdjustmentAmount}
          />

          <Text style={[styles.label, { marginTop: spacing.lg }]}>メッセージ（任意）</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="相手へのメッセージを入力..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            value={message}
            onChangeText={setMessage}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.submitButton, pressed && { opacity: 0.8 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>カウンターオファーを送る</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.base,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  input: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  footer: {
    padding: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
})
