// app/listing/new/work.tsx
// Step 3 commit 4: 出品 form 3-step フロー Step 1 — 作品 (work) 選択
//
// 設計方針 (Phase 2 §4):
//   - master_works が β1 では 3 件 (kimetsu/conan/sanrio) のため autocomplete ではなく
//     ボタンリスト UI (即座に全選択肢が見える、入力不要、簡潔)
//   - Phase 2+ で 10+ works に拡大時は SingleSelectAutocomplete 化検討
//   - 出口: workId + category を query params で next step へ
//
// 受け取る params (image.tsx から):
//   imageUri, imageBackUri (任意)
// 渡す params (characters.tsx へ):
//   imageUri, imageBackUri, workId, category

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import { getWorkSuggestions } from '@/lib/master'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ListingNewWorkScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri?: string
  }>()

  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null)

  // master_works 全件 (sort_order 順、3 件想定)
  const works = getWorkSuggestions('', 100)

  const selectedWork = selectedWorkId
    ? works.find((w) => w.id === selectedWorkId) ?? null
    : null

  const canNext = selectedWork != null

  const handleNext = () => {
    if (selectedWork == null) return
    router.push({
      pathname: '/listing/new/characters' as never,
      params: {
        imageUri: params.imageUri ?? '',
        imageBackUri: params.imageBackUri ?? '',
        workId: selectedWork.id,
        category: selectedWork.category,
      },
    })
  }

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 説明 */}
        <View style={styles.desc}>
          <Text style={styles.descTitle}>どの作品の出品ですか?</Text>
          <Text style={styles.descSub}>
            1 つ選んでください。複数の作品が混ざる場合は、主な作品を選びます。
          </Text>
        </View>

        {/* 作品ボタンリスト */}
        <View style={styles.list}>
          {works.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                作品マスタを読み込み中、または読み込み失敗。{'\n'}
                ネットワークを確認して再起動してください。
              </Text>
            </View>
          ) : (
            works.map((w) => {
              const isSelected = w.id === selectedWorkId
              return (
                <Pressable
                  key={w.id}
                  onPress={() => setSelectedWorkId(w.id)}
                  style={({ pressed }) => [
                    styles.workBtn,
                    isSelected && styles.workBtnSelected,
                    pressed && styles.workBtnPressed,
                  ]}
                >
                  <View style={styles.workBtnBody}>
                    <Text
                      style={[
                        styles.workBtnLabel,
                        isSelected && styles.workBtnLabelSelected,
                      ]}
                    >
                      {w.display_name_ja}
                    </Text>
                    {w.display_name_en != null && w.display_name_en !== '' && (
                      <Text
                        style={[
                          styles.workBtnSub,
                          isSelected && styles.workBtnSubSelected,
                        ]}
                      >
                        {w.display_name_en}
                      </Text>
                    )}
                  </View>
                  {isSelected && (
                    <View style={styles.checkBadge}>
                      <Text style={styles.checkBadgeText}>✓</Text>
                    </View>
                  )}
                </Pressable>
              )
            })
          )}
        </View>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label="次へ"
          onPress={handleNext}
          disabled={!canNext}
          size="lg"
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  outerWrap: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  desc: {
    marginBottom: spacing.lg,
  },
  descTitle: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  descSub: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  list: {
    gap: spacing.sm,
  },
  workBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
  },
  workBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: '#EEF2FF',
  },
  workBtnPressed: {
    opacity: 0.7,
  },
  workBtnBody: {
    flex: 1,
  },
  workBtnLabel: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  workBtnLabelSelected: {
    color: colors.primary,
  },
  workBtnSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  workBtnSubSelected: {
    color: colors.primary,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  emptyState: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
})
