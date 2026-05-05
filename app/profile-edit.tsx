// app/profile-edit.tsx
// プロフィール編集画面
// マイページ → プロフィール編集 で遷移
import { checkHandleAvailable, fetchProfile, updateProfile, supabase } from '@/lib/supabase'
import { useAuthContext } from '@/providers/AuthProvider'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { readAsStringAsync } from 'expo-file-system/legacy'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'

async function uploadAvatarImage(userId: string, imageUri: string): Promise<string> {
  const filePath = `${userId}.jpg`

  const base64 = await readAsStringAsync(imageUri, { encoding: 'base64' })
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }

  const { error } = await supabase.storage
    .from('avatars')
    .upload(filePath, bytes, { contentType: 'image/jpeg', upsert: true })

  if (error) throw error

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return data.publicUrl
}

export default function ProfileEditScreen() {
  const { session, loading: authLoading } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [handle, setHandle] = useState('')
  const [handleError, setHandleError] = useState<string | null>(null)
  const [originalHandle, setOriginalHandle] = useState('')

  // アバター: existingAvatarUrl = DB保存済み URL, localAvatarUri = 選択した未保存ローカルURI
  const [existingAvatarUrl, setExistingAvatarUrl] = useState<string | null>(null)
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (userId == null) {
      setLoading(false)
      return
    }

    fetchProfile(userId).then((profile) => {
      if (profile != null) {
        setHandle(profile.handle ?? '')
        setOriginalHandle(profile.handle ?? '')
        setExistingAvatarUrl(profile.avatar_url ?? null)
      }
      setLoading(false)
    })
  }, [userId, authLoading])

  const validateHandle = (value: string): string | null => {
    if (value.trim().length < 3) return '3文字以上で入力してください'
    return null
  }

  const canSave = handle.trim().length >= 3 && !saving

  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('権限が必要です', '写真ライブラリへのアクセスを許可してください。')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.uri) return
    setLocalAvatarUri(asset.uri)
  }

  const handleSave = async () => {
    if (!canSave || userId == null) return

    const trimmedHandle = handle.trim()
    const error = validateHandle(trimmedHandle)
    if (error != null) {
      setHandleError(error)
      return
    }

    try {
      setSaving(true)
      setHandleError(null)

      // アバター画像のアップロード（新規選択時のみ）
      let newAvatarUrl: string | null = existingAvatarUrl
      if (localAvatarUri != null) {
        newAvatarUrl = await uploadAvatarImage(userId, localAvatarUri)
      }

      // handle の重複チェック（変更時のみ）
      if (trimmedHandle !== originalHandle) {
        const available = await checkHandleAvailable(trimmedHandle)
        if (!available) {
          setHandleError('この表示名はすでに使われています')
          return
        }
      }

      // handle を更新
      await updateProfile({ userId, handle: trimmedHandle, displayName: null })

      // avatar_url を更新（変更があった場合のみ）
      if (newAvatarUrl !== existingAvatarUrl) {
        const { error: avatarError } = await supabase
          .from('profiles')
          .update({ avatar_url: newAvatarUrl })
          .eq('id', userId)
        if (avatarError) throw avatarError
        setExistingAvatarUrl(newAvatarUrl)
        setLocalAvatarUri(null)
      }

      Alert.alert('保存しました', 'プロフィールを更新しました。', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (error) {
      console.error('[ProfileEditScreen][handleSave]', error)
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

  const avatarChar = (handle || 'U').slice(0, 1).toUpperCase()
  const avatarDisplayUri = localAvatarUri ?? existingAvatarUrl

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* カスタムヘッダー */}
          <View style={styles.customHeader}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>プロフィール編集</Text>
            <View style={styles.headerRight} />
          </View>

          {/* アバター */}
          <View style={styles.avatarWrap}>
            <Pressable style={styles.avatarCircle} onPress={handlePickAvatar}>
              {avatarDisplayUri != null ? (
                <Image
                  source={{ uri: avatarDisplayUri }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.avatarChar}>{avatarChar}</Text>
              )}
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>

          {/* 表示名 */}
          <View style={styles.block}>
            <Text style={styles.label}>表示名 *</Text>
            <Text style={styles.hint}>取引や提案で表示される名前です（3文字以上）</Text>
            <TextInput
              style={[styles.input, handleError != null && styles.inputError]}
              placeholder="例：かいと"
              value={handle}
              onChangeText={(v) => {
                setHandle(v)
                setHandleError(null)
              }}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {handleError != null && (
              <Text style={styles.errorText}>{handleError}</Text>
            )}
          </View>

          <Pressable
            style={[styles.button, (!canSave) && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={!canSave}
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

const AVATAR_SIZE = 80

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  // アバター
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarChar: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 26,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // カスタムヘッダー
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
  // フォーム
  block: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: '#71717A',
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
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: '#EF4444',
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
    backgroundColor: colors.textTertiary,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
})
