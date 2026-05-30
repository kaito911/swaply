// app/listing/new/confirm.tsx
// Step 3 commit 6: 出品内容確認 → cards テーブルへ 1 行 insert (セット 1 出品 N=1)
//
// 旧版 (commit 4 まで): EnrichedCard[] (N 件) を受け取り、N 行 insert
// 新版 (commit 6):     EnrichedListing (1 セット) を受け取り、1 行 insert
//
// 設計方針 (Phase 2 §6):
//   - toInsertRow v2: characters[] / item_types[] / work_id / category 投入
//   - legacy K-POP 列 (group_name/member_name/series) は NULL (新規出品では使わない)
//   - name は buildSetName で master + free text を結合した表示用文字列
//   - 「N 件のカードを出品しました」→「出品が完了しました」(N=1 化)
//
// NOTE: 発送方法 (allows_mail / allows_handoff) は STEP4 に存在しないため
//       旧版と同様 allows_mail=true / allows_handoff=false で insert する。

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import {
  getCharacterById,
  getItemTypeById,
  getWorkById,
} from '@/lib/master'
import { supabase, uploadCardImage } from '@/lib/supabase'
import type { MasterCategory } from '@/lib/types'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// ─────────────────────────────────────────
// types
// ─────────────────────────────────────────

/** condition.tsx から受け取る型 (re-declare、cross-route で型 export 不可のため) */
type EnrichedListing = {
  workId: string
  category: MasterCategory
  characters: string[]
  itemTypes: string[]
  want_description: string
  allows_adjustment: boolean
  adjustment_max: number
}

/** cards テーブルへの insert 行型 (Step 2.5 配列化後) */
type CardInsertRow = {
  owner_user_id: string
  name: string
  // 新 schema (Step 1 + Step 2.5)
  category: MasterCategory
  work_id: string
  characters: string[]
  item_types: string[]
  // 共通
  image_url: string | null
  image_back_url: string | null
  description: null
  status: 'active'
  condition: null
  want_description: string | null
  allows_mail: true
  allows_handoff: false
  allows_adjustment: boolean
  adjustment_max: number | null
  // legacy K-POP 列は NULL (新規出品では使わない、Phase 1.5 K-POP 統一まで保全)
  group_name: null
  member_name: null
  series: null
}

// ─────────────────────────────────────────
// helpers
// ─────────────────────────────────────────

/** master ID → display name、未ヒットなら raw text fallback */
function characterDisplay(id: string): string {
  return getCharacterById(id)?.display_name_ja ?? id
}

function itemTypeDisplay(id: string): string {
  return getItemTypeById(id)?.display_name_ja ?? id
}

/**
 * セット表示用の name 文字列を生成。
 * 例: 「鬼滅の刃 - 炭治郎、禰豆子、善逸 (アクスタ)」
 *     「鬼滅の刃 - 炭治郎、禰豆子、善逸 他8名 (アクスタ・缶バッジ)」
 */
function buildSetName(e: EnrichedListing): string {
  const work = getWorkById(e.workId)
  const charNames = e.characters.map(characterDisplay)
  const typeNames = e.itemTypes.map(itemTypeDisplay)

  const parts: string[] = []
  // master 未登録の自由入力 workId は raw text を直接表示 (ハイブリッドマスタ fallback)
  const workDisplayName = work?.display_name_ja ?? e.workId
  if (workDisplayName !== '') parts.push(workDisplayName)

  if (charNames.length > 0) {
    parts.push(
      charNames.length <= 3
        ? charNames.join('、')
        : `${charNames.slice(0, 3).join('、')} 他${charNames.length - 3}名`,
    )
  }

  if (typeNames.length > 0) {
    parts.push(`(${typeNames.join('・')})`)
  }

  return parts.join(' - ')
}

function toInsertRow(
  e: EnrichedListing,
  userId: string,
  imageUri: string | null,
  imageBackUrl: string | null,
): CardInsertRow {
  return {
    owner_user_id: userId,
    name: buildSetName(e),
    // 新 schema
    category: e.category,
    work_id: e.workId,
    characters: e.characters,
    item_types: e.itemTypes,
    // 画像
    image_url: imageUri,
    image_back_url: imageBackUrl,
    // 共通
    description: null,
    status: 'active',
    condition: null,
    want_description: e.want_description !== '' ? e.want_description : null,
    allows_mail: true,
    allows_handoff: false,
    allows_adjustment: e.allows_adjustment,
    adjustment_max: e.allows_adjustment ? e.adjustment_max : null,
    // legacy NULL
    group_name: null,
    member_name: null,
    series: null,
  }
}

// ─────────────────────────────────────────
// sub-components
// ─────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.wrap}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  )
}

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    width: 96,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  value: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
})

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────

export default function ListingNewConfirmScreen() {
  const { userId, loading: authLoading } = useAuth()

  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri: string
    enrichedListingJson: string
  }>()

  const { imageUri, imageBackUri } = params

  // useLocalSearchParams は同期的に値を返すため lazy initializer で直接 parse
  const [enriched] = useState<EnrichedListing | null>(() => {
    try {
      return JSON.parse(params.enrichedListingJson) as EnrichedListing
    } catch {
      return null
    }
  })
  const [submitting, setSubmitting] = useState(false)

  const work = enriched != null ? getWorkById(enriched.workId) : undefined

  const handleSubmit = async () => {
    if (submitting || authLoading) return
    if (userId == null) {
      Alert.alert('エラー', 'ログイン情報が取得できません')
      return
    }
    if (enriched == null) {
      Alert.alert('エラー', '出品情報を読み込めませんでした')
      return
    }

    try {
      setSubmitting(true)

      // 表面を Storage にアップロード
      let resolvedImageUrl: string | null = null
      if (imageUri != null && imageUri !== '' && !imageUri.startsWith('http')) {
        try {
          resolvedImageUrl = await uploadCardImage({ userId, imageUri })
        } catch (error) {
          console.error('[confirm] uploadCardImage failed', error)
          resolvedImageUrl = null
        }
      } else {
        resolvedImageUrl = imageUri !== '' ? imageUri : null
      }

      // 裏面を Storage にアップロード(任意)
      let resolvedImageBackUrl: string | null = null
      if (imageBackUri) {
        if (!imageBackUri.startsWith('http')) {
          try {
            resolvedImageBackUrl = await uploadCardImage({
              userId,
              imageUri: imageBackUri,
              fileName: `back-${Date.now()}.jpg`,
            })
          } catch (error) {
            console.error('[confirm] uploadCardImage (back) failed', error)
            resolvedImageBackUrl = null
          }
        } else {
          resolvedImageBackUrl = imageBackUri
        }
      }

      // 1 row insert (N=1 化、セット 1 出品)
      const row = toInsertRow(
        enriched,
        userId,
        resolvedImageUrl,
        resolvedImageBackUrl,
      )

      const { error } = await supabase.from('cards').insert([row])
      if (error) throw error

      Alert.alert('出品完了', '出品が完了しました。', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/mypage' as never),
        },
      ])
    } catch (err) {
      console.error('[ListingNewConfirmScreen][handleSubmit]', err)
      const message =
        typeof err === 'object' &&
        err != null &&
        'message' in err &&
        typeof err.message === 'string'
          ? err.message
          : '出品に失敗しました。'
      Alert.alert('出品エラー', message)
    } finally {
      setSubmitting(false)
    }
  }

  // enriched が読み込めなかった場合のフォールバック表示
  if (enriched == null) {
    return (
      <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
        <ScreenHeader title="出品" subtitle="確認" />
        <View style={styles.errorState}>
          <Text style={styles.errorStateText}>
            出品情報を読み込めませんでした。前の画面に戻ってやり直してください。
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  const charNames = enriched.characters.map(characterDisplay)
  const typeNames = enriched.itemTypes.map(itemTypeDisplay)

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
      <ScreenHeader title="出品" subtitle="確認" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 写真プレビュー */}
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.preview}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.previewPlaceholder} />
        )}

        {/* セット内容 */}
        <View style={styles.cardSection}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardHeaderTitle} numberOfLines={2}>
              {buildSetName(enriched)}
            </Text>
          </View>

          <View style={styles.cardBody}>
            <Row label="作品" value={work?.display_name_ja ?? enriched.workId ?? '(未指定)'} />
            <Row
              label="キャラクター"
              value={
                charNames.length > 0 ? charNames.join('、') : '(未指定)'
              }
            />
            <Row
              label="アイテム種別"
              value={
                typeNames.length > 0 ? typeNames.join(' / ') : '(未指定)'
              }
            />
            <Row
              label="求めるカード"
              value={enriched.want_description || '—'}
            />
            <Row
              label="調整金"
              value={enriched.allows_adjustment ? 'あり' : 'なし'}
            />
            {enriched.allows_adjustment && (
              <Row
                label="調整金目安"
                value={
                  enriched.adjustment_max > 0
                    ? `¥${enriched.adjustment_max.toLocaleString()} まで`
                    : '¥0'
                }
              />
            )}
          </View>
        </View>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label="出品する"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting || authLoading || userId == null}
          size="lg"
        />
      </View>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────
const PREVIEW_HEIGHT = 200

const styles = StyleSheet.create({
  outerWrap: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
  preview: {
    width: '100%',
    height: PREVIEW_HEIGHT,
    backgroundColor: colors.backgroundMuted,
  },
  previewPlaceholder: {
    width: '100%',
    height: PREVIEW_HEIGHT,
    backgroundColor: colors.backgroundMuted,
  },
  // セット内容ブロック
  cardSection: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  // error state
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorStateText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  // CTA
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
})
