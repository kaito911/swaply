// app/listing/new/image.tsx
// Phase 1 listing UX: select front + back images → navigate to /listing/new/cardinfo
// 裏面は任意（成立判断のため推奨）。表面のみで「次へ」可能。
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Slot = 'front' | 'back'

async function pickFromCamera(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('権限が必要です', 'カメラへのアクセスを許可してください。')
    return null
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset?.uri) {
    Alert.alert('画像エラー', '画像を取得できませんでした。')
    return null
  }
  return asset.uri
}

async function pickFromLibrary(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('権限が必要です', '写真ライブラリへのアクセスを許可してください。')
    return null
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset?.uri) {
    Alert.alert('画像エラー', '画像を取得できませんでした。')
    return null
  }
  return asset.uri
}

export default function ListingNewImageScreen() {
  const [frontUri, setFrontUri] = useState<string | null>(null)
  const [backUri, setBackUri] = useState<string | null>(null)
  const [activeSlot, setActiveSlot] = useState<Slot>('front')

  const currentUri = activeSlot === 'front' ? frontUri : backUri
  const setCurrentUri = activeSlot === 'front' ? setFrontUri : setBackUri

  const handleCamera = async () => {
    const uri = await pickFromCamera()
    if (!uri) return
    setCurrentUri(uri)
    if (activeSlot === 'front' && backUri == null) {
      setActiveSlot('back')
    }
  }

  const handleLibrary = async () => {
    const uri = await pickFromLibrary()
    if (!uri) return
    setCurrentUri(uri)
    if (activeSlot === 'front' && backUri == null) {
      setActiveSlot('back')
    }
  }

  const handleNext = () => {
    if (frontUri == null) return
    // Step 3 commit 5: 旧 cardinfo (K-POP 個別 N 出品) → 新 work (アニメ セット出品 3-step) に切替
    router.push({
      pathname: '/listing/new/work' as never,
      params: {
        imageUri: frontUri,
        imageBackUri: backUri,
      },
    })
  }

  const handleCancel = () => {
    const hasContent = frontUri != null || backUri != null
    if (!hasContent) {
      if (router.canGoBack()) router.back()
      return
    }
    Alert.alert(
      '出品をキャンセルしますか?',
      '入力した内容は破棄されます。',
      [
        { text: 'やめる', style: 'cancel' },
        {
          text: 'キャンセル',
          style: 'destructive',
          onPress: () => {
            if (router.canGoBack()) router.back()
          },
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.wrap} edges={['top', 'bottom']}>
      <ScreenHeader title="出品" subtitle="写真 1/6" onBack={handleCancel} />
      {/* Slot tabs */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeSlot === 'front' && styles.tabActive]}
          onPress={() => setActiveSlot('front')}
        >
          <Text
            style={[
              styles.tabText,
              activeSlot === 'front' && styles.tabTextActive,
            ]}
          >
            表面 {frontUri ? '✓' : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeSlot === 'back' && styles.tabActive]}
          onPress={() => setActiveSlot('back')}
        >
          <Text
            style={[
              styles.tabText,
              activeSlot === 'back' && styles.tabTextActive,
            ]}
          >
            裏面 {backUri ? '✓' : '（任意）'}
          </Text>
        </Pressable>
      </View>

      {/* Preview: fills vertical space, 3:4 crop applied via ImagePicker */}
      <View style={styles.previewWrap}>
        {currentUri ? (
          <Image
            source={{ uri: currentUri }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Text style={styles.placeholderIcon}>📷</Text>
            <Text style={styles.placeholderText}>
              {activeSlot === 'front'
                ? '表面の写真を選んでください'
                : '裏面の写真を選んでください（任意）'}
            </Text>
          </View>
        )}
      </View>

      {/* Pick buttons */}
      <View style={styles.btnRow}>
        <Pressable style={styles.pickBtn} onPress={handleCamera}>
          <Text style={styles.pickBtnIcon}>📸</Text>
          <Text style={styles.pickBtnLabel}>カメラで撮る</Text>
        </Pressable>

        <View style={styles.btnDivider} />

        <Pressable style={styles.pickBtn} onPress={handleLibrary}>
          <Text style={styles.pickBtnIcon}>🖼️</Text>
          <Text style={styles.pickBtnLabel}>アルバムから選ぶ</Text>
        </Pressable>
      </View>

      {/* Next CTA */}
      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label="次へ"
          onPress={handleNext}
          disabled={frontUri == null}
          size="lg"
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textInverse,
  },
  previewWrap: {
    flex: 1,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  previewPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  btnRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
  },
  pickBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  btnDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  pickBtnIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  pickBtnLabel: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
})
