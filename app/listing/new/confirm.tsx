// app/listing/new/confirm.tsx
// STEP5: 出品内容確認 → cards テーブルへ一括 insert（複数カード対応）
// 資料: プロトタイプ STEP5「出品生成確認（複数出品プレビュー）」
//   - enrichedCardsJson を受け取り、EnrichedCard[] を parse
//   - 「N件の出品が作成されます」バナー
//   - 各カードのプレビューリスト（シリーズ・メンバー・カード・求・調整金）
//   - 「出品する」: enrichedCards を1回の insert で一括登録
//
// NOTE: 発送方法（allows_mail / allows_handoff）は STEP4 に存在しないため
//       condition.tsx からは渡されない。
//       資料 画面単位仕様書 3-2 に「郵送/手渡し可否（任意）」とある通り、
//       入力ステップが資料上未確定のため、現時点は allows_mail=true（デフォルト）
//       allows_handoff=false で insert する。
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import { supabase, uploadCardImage } from '@/lib/supabase'
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

// condition.tsx から受け取るカード型
type EnrichedCard = {
  id: string
  group: string
  series: string
  member: string
  card: string
  want_description: string
  allows_adjustment: boolean
  adjustment_max: number
}

// cards テーブルへの insert 行型
type CardInsertRow = {
  owner_user_id: string
  name: string
  group_name: string | null
  member_name: string | null
  series: string | null
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
}

// ─────────────────────────────────────────
// helpers
// ─────────────────────────────────────────

function toInsertRow(
  c: EnrichedCard,
  userId: string,
  imageUri: string,
  imageBackUrl: string | null,
): CardInsertRow {
  return {
    owner_user_id: userId,
    // group + member を name として使用（例: TREASURE ハルト）
    name: [c.group, c.member].filter(Boolean).join(' '),
    group_name: c.group !== '' ? c.group : null,
    member_name: c.member !== '' ? c.member : null,
    series: c.series !== '' ? c.series : null,
    // Phase 1: imageUri はローカルURI — Supabase Storage 連携は Phase 2
    image_url: imageUri !== '' ? imageUri : null,
    image_back_url: imageBackUrl,
    description: null,
    status: 'active',
    condition: null,
    want_description: c.want_description !== '' ? c.want_description : null,
    // 発送方法は資料上 STEP4 に入力ステップが未確定のため暫定デフォルト
    allows_mail: true,
    allows_handoff: false,
    allows_adjustment: c.allows_adjustment,
    adjustment_max: c.allows_adjustment ? c.adjustment_max : null,
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
    enrichedCardsJson: string
  }>()

  const { imageUri, imageBackUri } = params

  // useLocalSearchParams は同期的に値を返すため lazy initializer で直接 parse する
  // enrichedCards は確認画面で編集しないため setter は不要
  const [enrichedCards] = useState<EnrichedCard[]>(() =>
    JSON.parse(params.enrichedCardsJson) as EnrichedCard[]
  )
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (submitting || authLoading) return
    if (userId == null) {
      Alert.alert('エラー', 'ログイン情報が取得できません')
      return
    }
    if (enrichedCards.length === 0) return

    try {
      setSubmitting(true)

      // 表面をStorageにアップロード
      let resolvedImageUrl: string | null = null
      if (imageUri != null && imageUri !== '' && !imageUri.startsWith('http')) {
        try {
          resolvedImageUrl = await uploadCardImage({
            userId,
            imageUri,
          })
        } catch (error) {
          console.error('[confirm] uploadCardImage failed', error)
          resolvedImageUrl = null
        }
      } else {
        resolvedImageUrl = imageUri !== '' ? imageUri : null
      }

      // 裏面をStorageにアップロード（任意・存在する場合のみ）
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

      const rows: CardInsertRow[] = enrichedCards.map((c) =>
        toInsertRow(c, userId, resolvedImageUrl ?? '', resolvedImageBackUrl),
      )

      const { error } = await supabase.from('cards').insert(rows)
      if (error) throw error

      Alert.alert(
        '出品完了',
        `${enrichedCards.length}件のカードを出品しました。`,
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)/mypage' as never),
          },
        ],
      )
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

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
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

        {/* 件数バナー */}
        <View style={styles.countBanner}>
          <Text style={styles.countBannerText}>
            <Text style={styles.countBannerBold}>{enrichedCards.length}件</Text>
            {' '}の出品が作成されます
          </Text>
        </View>

        {/* カード別プレビュー */}
        {enrichedCards.map((c, i) => (
          <View key={c.id} style={styles.cardSection}>
            {/* カードヘッダー */}
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderBadge}>
                <Text style={styles.cardHeaderBadgeText}>{i + 1}</Text>
              </View>
              <Text style={styles.cardHeaderTitle} numberOfLines={1}>
                {[c.group, c.member, c.series].filter(Boolean).join(' · ') || '（未入力）'}
              </Text>
            </View>

            {/* カード詳細 */}
            <View style={styles.cardBody}>
              <Row label="グループ" value={c.group || '—'} />
              <Row label="メンバー" value={c.member || '—'} />
              <Row label="シリーズ" value={c.series || '—'} />
              <Row label="求めるカード" value={c.want_description || '—'} />
              <Row label="調整金" value={c.allows_adjustment ? 'あり' : 'なし'} />
              {c.allows_adjustment && (
                <Row
                  label="調整金目安"
                  value={
                    c.adjustment_max > 0
                      ? `¥${c.adjustment_max.toLocaleString()} まで`
                      : '¥0'
                  }
                />
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Fixed CTA */}
      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label="出品する"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting || authLoading || userId == null || enrichedCards.length === 0}
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
  outerWrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
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
  // 件数バナー
  countBanner: {
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  countBannerText: {
    fontSize: 13,
    color: '#3730A3',
    lineHeight: 19,
  },
  countBannerBold: {
    fontWeight: fontWeight.bold,
  },
  // カード別プレビューブロック
  cardSection: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardHeaderBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardHeaderBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  cardHeaderTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
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
