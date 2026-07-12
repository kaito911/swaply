// components/listing/section/ImageSection.tsx
//
// Phase A: 出品 1 ページ化 section 抽出。
// 元: app/listing/new/image.tsx の入力 UI 部 (front + back 画像選択)。
//
// Phase B UI 微修正 (2026-07-05):
//   旧レイアウト (aspectRatio 3:4 の大 preview + tab + カメラ/アルバムボタン) は
//   写真セクションが 1 画面を占有し「下に入力が続く」ことが視覚的に伝わらなかった。
//   → メルカリ型の小サイズサムネイル横並び (2 スロット, ~88x88 sq) に変更。
//   1 行に 3-4 個入るサイズ感で、下に入力が続くことが縦スクロールを促す。
//
//   変更点:
//     - Tab (front/back 切替) 廃止 — 2 スロットが常時見えて slot 単位で操作可能に
//     - 大 preview (aspectRatio) 廃止 — 小サムネイル 2 個の Row
//     - カメラ/アルバム 2 ボタン廃止 — スロット tap 時に Alert.alert で action sheet
//     - 既存: pickFromCamera / pickFromLibrary helper は完全流用
//     - 既存: value = {frontUri, backUri} 契約は不変 (親 reducer への影響ゼロ)

import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { ensureMediaPermission } from '@/lib/ensureMediaPermission'
import React from 'react'
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { ImageSectionValue } from './types'

export type ImageSectionProps = {
  value: ImageSectionValue
  onChange: (next: ImageSectionValue) => void
}

type Slot = 'front' | 'back'

async function pickFromCamera(): Promise<string | null> {
  if (!(await ensureMediaPermission('camera'))) return null
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
  if (!(await ensureMediaPermission('library'))) return null
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
  const applyToSlot = (slot: Slot, uri: string | null) => {
    if (slot === 'front') {
      onChange({ ...value, frontUri: uri })
    } else {
      onChange({ ...value, backUri: uri })
    }
  }

  const openPicker = (slot: Slot) => {
    Alert.alert(
      slot === 'front' ? '表面の写真を選ぶ' : '裏面の写真を選ぶ',
      undefined,
      [
        {
          text: 'カメラで撮る',
          onPress: async () => {
            const uri = await pickFromCamera()
            if (uri != null) applyToSlot(slot, uri)
          },
        },
        {
          text: 'アルバムから選ぶ',
          onPress: async () => {
            const uri = await pickFromLibrary()
            if (uri != null) applyToSlot(slot, uri)
          },
        },
        { text: 'キャンセル', style: 'cancel' },
      ],
    )
  }

  const removeSlot = (slot: Slot) => {
    applyToSlot(slot, null)
  }

  return (
    <View style={styles.row}>
      <Thumbnail
        slot="front"
        uri={value.frontUri}
        label="表面"
        required
        onPress={() => openPicker('front')}
        onRemove={() => removeSlot('front')}
      />
      <Thumbnail
        slot="back"
        uri={value.backUri}
        label="裏面"
        onPress={() => openPicker('back')}
        onRemove={() => removeSlot('back')}
      />
    </View>
  )
}

// ─────────────────────────────────────────
// sub-component: 小サイズサムネイル 1 個 (~88x88 sq)
// ─────────────────────────────────────────

function Thumbnail({
  uri,
  label,
  required = false,
  onPress,
  onRemove,
}: {
  slot: Slot
  uri: string | null
  label: string
  required?: boolean
  onPress: () => void
  onRemove: () => void
}) {
  const hasImage = uri != null && uri !== ''
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.thumb,
        hasImage && styles.thumbFilled,
        pressed && styles.thumbPressed,
      ]}
    >
      {hasImage ? (
        <>
          <Image
            source={{ uri }}
            style={styles.thumbImage}
            resizeMode="cover"
          />
          {/* 削除 (× 小ボタン、右上) */}
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            style={styles.removeBadge}
          >
            <Ionicons name="close" size={12} color={colors.textInverse} />
          </Pressable>
        </>
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name="add" size={22} color={colors.primary} />
          <Text style={styles.thumbLabel}>
            {label}
            {!required && <Text style={styles.optional}>{'\n'}（任意）</Text>}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const THUMB_SIZE = 88

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbFilled: {
    borderStyle: 'solid',
    borderColor: colors.border,
  },
  thumbPressed: {
    opacity: 0.7,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  thumbLabel: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  optional: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
    color: colors.textTertiary,
  },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
