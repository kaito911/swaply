// components/listing/section/ImageSection.tsx
//
// Phase A: 出品 1 ページ化 section 抽出。
// 元: app/listing/new/image.tsx の入力 UI 部 (front + back 画像選択)。
//
// 再利用/書き換え比率: 再利用 ~85% / 書き換え ~15%
//   - pickFromCamera / pickFromLibrary helper: 完全流用
//   - Slot tab / preview / pick buttons: 完全流用
//   - 削除: SafeAreaView / ScreenHeader / handleCancel / handleNext / PrimaryCTA
//     → 親画面の責務に移譲
//   - 追加: controlled component 化 (value + onChange props)

import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import * as ImagePicker from 'expo-image-picker'
import React, { useState } from 'react'
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native'

import type { ImageSectionValue } from './types'

export type ImageSectionProps = {
  value: ImageSectionValue
  onChange: (next: ImageSectionValue) => void
}

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

export function ImageSection({ value, onChange }: ImageSectionProps) {
  const [activeSlot, setActiveSlot] = useState<Slot>('front')

  const currentUri = activeSlot === 'front' ? value.frontUri : value.backUri

  const setSlot = (uri: string) => {
    if (activeSlot === 'front') {
      onChange({ ...value, frontUri: uri })
      // 表面選択直後、裏面が空なら自動でタブ移動 (元 UX 継承)
      if (value.backUri == null) setActiveSlot('back')
    } else {
      onChange({ ...value, backUri: uri })
    }
  }

  const handleCamera = async () => {
    const uri = await pickFromCamera()
    if (uri != null) setSlot(uri)
  }
  const handleLibrary = async () => {
    const uri = await pickFromLibrary()
    if (uri != null) setSlot(uri)
  }

  return (
    <View style={styles.wrap}>
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
            表面 {value.frontUri ? '✓' : ''}
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
            裏面 {value.backUri ? '✓' : '（任意）'}
          </Text>
        </Pressable>
      </View>

      {/* Preview (3:4 比率、ImagePicker で crop 済) */}
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
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
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
    aspectRatio: 3 / 4,
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
})
