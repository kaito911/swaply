// app/offer/preview/[cardId].tsx
//
// 確認専用の商品詳細 (2026-08): 申請者比較 (by-card) から「相手が出すグッズ」をタップした先。
// 現物の状態を確認するためだけの読み取り専用画面。
//
// ★出さないもの (この文脈で意味をなさないため): 譲/求タブ切替・「交換を提案する」・
//   いいね・通報・ブロック。/listing/[id] とは別画面 (listing/[id] は変更しない)。
//
// 内容: 大きい写真 (表/裏)・カード名・交換条件(状態/求)・説明・出品者 Trust (TrustFactPanel)。

import { ScreenHeader } from '@/components/ScreenHeader'
import { TroubleDot } from '@/components/TroubleDot'
import { TrustFactPanel } from '@/components/TrustFactPanel'
import { colors } from '@/constants/theme'
import { fetchCard, fetchUserTrust } from '@/lib/supabase'
import { formatStructuredWant } from '@/lib/master'
import { CONDITION_LABELS, type Card, type UserTrust } from '@/lib/types'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function ownerName(card: Card | null): string {
  const p = card?.owner
  if (p?.display_name && p.display_name.trim().length > 0) return p.display_name
  if (p?.handle && p.handle.trim().length > 0) return `@${p.handle}`
  return 'ユーザー'
}

export default function OfferPreviewScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>()

  const [card, setCard] = useState<Card | null>(null)
  const [trust, setTrust] = useState<UserTrust | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    if (cardId == null || cardId === '') {
      setLoading(false)
      setLoadFailed(true)
      return
    }
    setLoading(true)
    setLoadFailed(false)
    try {
      const fetched = await fetchCard(cardId)
      if (fetched == null) {
        // 棚カード等で fetchCard が null (所有者ゲート) → 表示できないエッジ。
        setCard(null)
        setLoadFailed(true)
        return
      }
      setCard(fetched)
      // 出品者 Trust (失敗しても本体表示は止めない・null=「—」)。
      const t = await fetchUserTrust(fetched.owner_user_id).catch(() => null)
      setTrust(t)
    } catch (error) {
      console.error('[OfferPreview][load]', error)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [cardId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  // ── render ──

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="グッズを確認" />
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (loadFailed || card == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="グッズを確認" />
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>表示できません</Text>
          <Text style={styles.emptyBody}>
            この出品は表示できない状態か、取得に失敗しました。
          </Text>
          <Pressable style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const hasBack = card.image_back_url != null && card.image_back_url !== ''
  const conditionLabel =
    card.condition != null ? CONDITION_LABELS[card.condition] : null
  const wantText = formatStructuredWant(card).text
  const hasDescription =
    card.description != null && card.description.trim().length > 0

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="グッズを確認" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* 写真 (大・現物確認用)。表→裏の順。裏が無ければ表のみ (レイアウト崩れなし)。 */}
        {card.image_url != null && card.image_url !== '' ? (
          <Image source={{ uri: card.image_url }} style={styles.photo} resizeMode="contain" />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Text style={styles.photoEmptyText}>写真なし</Text>
          </View>
        )}
        {hasBack && (
          <Image
            source={{ uri: card.image_back_url as string }}
            style={styles.photo}
            resizeMode="contain"
          />
        )}

        {/* カード名 */}
        <Text style={styles.name}>
          {card.name && card.name.trim().length > 0 ? card.name : 'グッズ情報なし'}
        </Text>

        {/* 交換条件・状態 (空はセクションごと非表示) */}
        {conditionLabel != null && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>状態</Text>
            <Text style={styles.sectionBody}>{conditionLabel}</Text>
          </View>
        )}
        {wantText != null && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>交換条件</Text>
            <Text style={styles.sectionBody}>{wantText}</Text>
          </View>
        )}
        {hasDescription && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>説明</Text>
            <Text style={styles.sectionBody}>{card.description}</Text>
          </View>
        )}

        {/* 出品者 Trust (出品詳細と同じ TrustFactPanel 縦4行) */}
        <View style={styles.trustSection}>
          <View style={styles.ownerRow}>
            <Text style={styles.ownerName} numberOfLines={1}>
              {ownerName(card)}
            </Text>
            {/* トラブル色サイン (stage 0 は非表示・既存挙動)。 */}
            <TroubleDot stage={trust?.trouble_stage ?? 0} />
          </View>
          <TrustFactPanel trust={trust} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  retryButtonText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  content: { padding: 16, paddingBottom: 120, gap: 14 },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 14,
    backgroundColor: colors.backgroundMuted,
  },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  photoEmptyText: { fontSize: 13, color: colors.textTertiary },
  name: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  section: { gap: 4 },
  sectionLabel: { fontSize: 12, color: colors.textSecondary },
  sectionBody: { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
  trustSection: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    padding: 14,
  },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  ownerName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
})
