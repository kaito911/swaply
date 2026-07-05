// app/listing/new/entry.tsx
//
// Phase B: 出品 1 ページ化 入口。
//
// 挙動:
//   - 下書き 0 件 → 即 /listing/new/single-page へ replace (ハブは見せない)
//   - 下書き 1 件以上 → ボトムシート風の一覧:
//     「新規作成」ボタン + 下書き一覧 (title / 更新日時 / タップで再開 / 長押しで削除)
//
// ⚠️ 本ルートは Phase D で SubmitFab の向き先に統合する予定。今回は
// mypage の dev section 経由でのみ到達可能 (検証用の目立たない導線)。
// 既存の '/listing/new/image' 経由の旧フローには一切干渉しない。

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import {
  deleteDraft,
  generateDraftId,
  loadDrafts,
  type ListingDraft,
} from '@/lib/listingDrafts'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/** yyyy/mm/dd hh:mm 形式で表示 */
function formatUpdatedAt(ts: number): string {
  const d = new Date(ts)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`
}

export default function ListingNewEntryScreen() {
  const [drafts, setDrafts] = useState<ListingDraft[] | null>(null)

  // 画面 focus のたびに再読み込み (single-page からの戻り / 削除後の反映)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void loadDrafts().then((list) => {
        if (cancelled) return
        // 下書き 0 件 → 即 single-page へ replace (ハブは出さない)
        if (list.length === 0) {
          const newId = generateDraftId()
          router.replace({
            pathname: '/listing/new/single-page' as never,
            params: { draftId: newId, isNew: '1' },
          })
          return
        }
        setDrafts(list)
      })
      return () => {
        cancelled = true
      }
    }, []),
  )

  const handleNewDraft = () => {
    const newId = generateDraftId()
    router.replace({
      pathname: '/listing/new/single-page' as never,
      params: { draftId: newId, isNew: '1' },
    })
  }

  const handleResumeDraft = (draft: ListingDraft) => {
    router.replace({
      pathname: '/listing/new/single-page' as never,
      params: { draftId: draft.id, isNew: '0' },
    })
  }

  const handleDeleteDraft = (draft: ListingDraft) => {
    Alert.alert(
      '下書きを削除しますか?',
      `「${draft.title}」を削除します。この操作は取り消せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await deleteDraft(draft.id)
            const next = await loadDrafts()
            if (next.length === 0) {
              // 全消し → 新規作成に切替
              handleNewDraft()
              return
            }
            setDrafts(next)
          },
        },
      ],
    )
  }

  const handleCancel = () => {
    if (router.canGoBack()) router.back()
  }

  // ── render ──

  // loadDrafts 中はスピナー (下書き 0 なら直後に replace で消える)
  if (drafts == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* シンプルなヘッダー (ボトムシート風の見た目、上下余白広め) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>出品を始める</Text>
        <Pressable onPress={handleCancel} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 新規作成 CTA */}
        <View style={styles.newCtaWrap}>
          <PrimaryCTA
            label="新しく出品する"
            onPress={handleNewDraft}
            size="lg"
          />
        </View>

        {/* 下書き一覧 */}
        <Text style={styles.sectionLabel}>
          下書き ({drafts.length})
        </Text>
        <Text style={styles.sectionHint}>
          タップで再開、長押しで削除します。
        </Text>

        <View style={styles.list}>
          {drafts.map((draft) => (
            <Pressable
              key={draft.id}
              onPress={() => handleResumeDraft(draft)}
              onLongPress={() => handleDeleteDraft(draft)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.rowMeta}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {draft.title}
                </Text>
                <Text style={styles.rowSub}>
                  更新: {formatUpdatedAt(draft.updatedAt)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textTertiary}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  newCtaWrap: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  rowSub: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
})
