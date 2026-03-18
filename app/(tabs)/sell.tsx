// app/(tabs)/sell.tsx
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { colors } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import { createCard } from '@/lib/supabase'

export default function SellScreen() {
  const { userId, loading: authLoading } = useAuth()

  const [name, setName] = useState('')
  const [series, setSeries] = useState('')
  const [member, setMember] = useState('')
  const [want, setWant] = useState('')
  const [description, setDescription] = useState('')
  const [imageUri, setImageUri] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isDisabled = name.trim() === '' || submitting || authLoading || userId == null

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('権限が必要です', '写真ライブラリへのアクセスを許可してください。')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    })

    if (result.canceled) {
      return
    }

    const asset = result.assets?.[0]

    if (!asset?.uri) {
      Alert.alert('画像エラー', '画像を取得できませんでした。')
      return
    }

    setImageUri(asset.uri)
  }

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    const trimmedSeries = series.trim()
    const trimmedMember = member.trim()
    const trimmedWant = want.trim()
    const trimmedDescription = description.trim()

    if (userId == null) {
      Alert.alert('エラー', 'ログイン情報がありません')
      return
    }

    if (!trimmedName) {
      Alert.alert('入力不足', 'カード名を入力してください。')
      return
    }

    try {
      setSubmitting(true)

      await createCard({
        ownerUserId: userId,
        name: trimmedName,
        imageUrl: imageUri !== '' ? imageUri : null,
        series: trimmedSeries !== '' ? trimmedSeries : null,
        memberName: trimmedMember !== '' ? trimmedMember : null,
        wantDescription: trimmedWant !== '' ? trimmedWant : null,
        description: trimmedDescription !== '' ? trimmedDescription : null,
      })

      Alert.alert(
        '出品完了',
        imageUri !== ''
          ? 'カードを出品しました。\n※ 画像は現在ローカルURI保存のため、次段階でStorage対応が必要です。'
          : 'カードを出品しました。',
        [
          {
            text: 'OK',
            onPress: () => {
              setName('')
              setSeries('')
              setMember('')
              setWant('')
              setDescription('')
              setImageUri('')
              router.replace('/(tabs)' as never)
            },
          },
        ]
      )
    } catch (error) {
      console.error('[SellScreen][handleSubmit]', error)

      const message =
        typeof error === 'object' &&
        error != null &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : 'カード出品に失敗しました。'

      Alert.alert('出品エラー', message)
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>カード出品</Text>
        <Text style={styles.subTitle}>交換に出すカード情報を入力してください</Text>

        <View style={styles.block}>
          <Text style={styles.label}>出品画像</Text>

          <Pressable style={styles.imagePickerButton} onPress={handlePickImage}>
            <Text style={styles.imagePickerButtonText}>
              {imageUri ? '写真を変更する' : '写真を追加する'}
            </Text>
          </Pressable>

          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text style={styles.previewPlaceholderText}>
                まだ画像は選択されていません
              </Text>
            </View>
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>カード名 *</Text>
          <TextInput
            style={styles.input}
            placeholder="例：TREASURE ジュンギュ トレカ"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>シリーズ</Text>
          <TextInput
            style={styles.input}
            placeholder="例：REBOOT"
            value={series}
            onChangeText={setSeries}
          />
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>メンバー</Text>
          <TextInput
            style={styles.input}
            placeholder="例：ジュンギュ"
            value={member}
            onChangeText={setMember}
          />
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>希望条件</Text>
          <TextInput
            style={styles.input}
            placeholder="例：ヒョンソク同種優先 / 異種も検討"
            value={want}
            onChangeText={setWant}
          />
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>説明</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="例：目立つ傷なし。スリーブ保管しています。"
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </View>

        <Pressable
          style={[styles.button, isDisabled ? styles.buttonDisabled : undefined]}
          onPress={handleSubmit}
          disabled={isDisabled}
        >
          <Text style={styles.buttonText}>
            {submitting ? '出品中...' : '出品する'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subTitle: {
    marginTop: 6,
    marginBottom: 20,
    fontSize: 13,
    color: colors.textSecondary,
  },
  block: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  imagePickerButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
  },
  imagePickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  previewImage: {
    marginTop: 12,
    width: '100%',
    height: 260,
    borderRadius: 16,
    backgroundColor: colors.backgroundMuted,
  },
  previewPlaceholder: {
    marginTop: 12,
    height: 160,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundCard,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.textPrimary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
})