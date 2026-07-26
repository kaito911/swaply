// app/listing/new/want.tsx
// Phase B-2 (commit 3): 求リストから選ぶ step
//
// 設計刷新 (採用方針 A):
//   - 既存の構造化自由入力 (master ID + free text の MultiSelectAutocomplete x3) を廃止し、
//     自分の求リスト (wanted_cards, active のみ) から複数選択する UX に置換
//   - 1 件以上選択必須、未選択時は「次へ」disabled
//   - 求リスト 0 件時はその場で簡易追加できる救済モーダルを内包
//
// 案 X: 既存 cards.want_* の扱い
//   - 新規出品では cards.want_* を空配列で投入 → card_wanted_links を正とする
//   - condition.tsx 互換のため want*Json は空配列 JSON で渡す
//   - matcher 互換は今回考えない (matcher v3 / card_wanted_links 連携は Phase 1 範囲外)
//
// 簡易追加モーダル方針 (commit 3 では簡素化):
//   - 商品名 (card_name) のみ必須
//   - グループ / メンバー / シリーズ / 参考画像は未入力 (詳細編集は /wants 画面で実施)
//   - 既存 /wants のモーダル (600 行、サジェスト + auto 合成 + 画像 picker) は再利用しない
//     → 共通コンポーネント抽出は別 commit で検討、commit 3 のスコープは「UI 置換」に限定
//
// 受け取る params (items.tsx から):
//   imageUri, imageBackUri, workId, category, charactersJson, itemTypesJson
// 渡す params (condition.tsx へ):
//   上記 + wantWorksJson='[]' / wantCharactersJson='[]' / wantItemTypesJson='[]' (空配列、案 X)
//        + selectedWantedCardIdsJson (新規、card_wanted_links 保存用、confirm.tsx で消費予定)

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import { addWantedCard, fetchMyWantedCards } from '@/lib/supabase'
import { WantedCard } from '@/lib/types'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ListingNewWantScreen() {
  const params = useLocalSearchParams<{
    imageUri: string
    imageBackUri?: string
    workId: string
    category: string
    charactersJson: string
    itemTypesJson: string
  }>()
  const { userId } = useAuth()

  const [wants, setWants] = useState<WantedCard[]>([])
  const [loading, setLoading] = useState(true)
  // 選択中 wanted_card.id の Set (順序保持不要、has() で高速判定)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 簡易追加モーダル state (commit 3 では商品名のみ必須)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formCardName, setFormCardName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 求リスト取得 (fetchMyWantedCards は内部で status='active' フィルタ済、archived は返らない)
  const load = useCallback(async () => {
    if (userId == null) {
      setWants([])
      setLoading(false)
      return
    }
    setLoading(true)
    // A1: この画面は到達不能な旧wizard死蔵コードだが、fetchMyWantedCards の throw化(STEP2)で
    //   未catch caller が残らないよう最小の try/catch/finally を入れる (無限スピナー防止)。
    try {
      const data = await fetchMyWantedCards(userId)
      setWants(data)
    } catch (e) {
      console.error('[listing/new/want][load]', e)
      setWants([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canProceed = selectedIds.size > 0

  const handleNext = () => {
    if (!canProceed) return
    const ids = Array.from(selectedIds)
    router.push({
      pathname: '/listing/new/condition' as never,
      params: {
        imageUri: params.imageUri ?? '',
        imageBackUri: params.imageBackUri ?? '',
        workId: params.workId,
        category: params.category,
        charactersJson: params.charactersJson,
        itemTypesJson: params.itemTypesJson,
        // 案 X: cards.want_* は新規空配列、condition.tsx の既存 parse 互換のため空 JSON で渡す
        wantWorksJson: '[]',
        wantCharactersJson: '[]',
        wantItemTypesJson: '[]',
        // 新規 (Phase B-2): 求リストから選んだ wanted_card ID 配列
        // confirm.tsx で消費して card_wanted_links に bulk INSERT 予定 (commit 4)
        selectedWantedCardIdsJson: JSON.stringify(ids),
      },
    })
  }

  // ── 簡易追加モーダル handlers ──
  const handleOpenAdd = () => {
    setFormCardName('')
    setShowAddModal(true)
  }
  const handleCancelAdd = () => {
    if (submitting) return
    setShowAddModal(false)
    setFormCardName('')
  }
  const handleSubmitAdd = async () => {
    if (userId == null) return
    const cardName = formCardName.trim()
    if (cardName === '') return
    try {
      setSubmitting(true)
      const created = await addWantedCard({
        userId,
        cardName,
        groupName: null,
        memberName: null,
        series: null,
      })
      // 新規行を一覧の先頭に追加 + 自動選択 (採用方針: 「追加後は自動で選択済」)
      setWants((prev) => [created, ...prev])
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.add(created.id)
        return next
      })
      setShowAddModal(false)
      setFormCardName('')
    } catch {
      Alert.alert('エラー', '追加に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmitAdd = formCardName.trim() !== '' && !submitting

  // ── render ──

  if (loading) {
    return (
      <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
        <ScreenHeader title="出品" subtitle="求 5/6" />
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.outerWrap} edges={['top', 'bottom']}>
      <ScreenHeader title="出品" subtitle="求 5/6" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 説明 */}
        <View style={styles.desc}>
          <Text style={styles.descTitle}>あなたの求リストから選択</Text>
          <Text style={styles.descSub}>
            この出品で受け付けたい求商品を 1 件以上選んでください。
          </Text>
        </View>

        {/* + 求商品を追加 ボタン (求リスト 0 件・非 0 件 共通で表示) */}
        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.addButtonPressed,
          ]}
          onPress={handleOpenAdd}
        >
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addButtonText}>求商品を追加</Text>
        </Pressable>

        {wants.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="list-outline" size={36} color={colors.border} />
            <Text style={styles.emptyTitle}>まだ求リストがありません</Text>
            <Text style={styles.emptySub}>
              出品するには、受け付けたい求商品を 1 件以上追加してください。
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {wants.map((want) => {
              const isSelected = selectedIds.has(want.id)
              const sub = [want.series, want.group_name, want.member_name]
                .filter((v): v is string => v != null && v !== '')
                .join(' · ')

              return (
                <Pressable
                  key={want.id}
                  style={({ pressed }) => [
                    styles.row,
                    isSelected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => toggleSelect(want.id)}
                >
                  {want.image_url != null && want.image_url !== '' ? (
                    <Image
                      source={{ uri: want.image_url }}
                      style={styles.thumb}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <Ionicons name="image-outline" size={18} color={colors.border} />
                    </View>
                  )}

                  <View style={styles.rowMeta}>
                    <Text style={styles.cardName} numberOfLines={2}>
                      {want.card_name}
                    </Text>
                    {sub.length > 0 && (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {sub}
                      </Text>
                    )}
                  </View>

                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxChecked,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                    )}
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* 「次へ」CTA */}
      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label={
            canProceed
              ? `次へ（${selectedIds.size} 件選択中）`
              : '求商品を 1 件以上選んでください'
          }
          onPress={handleNext}
          disabled={!canProceed}
          size="lg"
        />
      </View>

      {/* 簡易追加モーダル (commit 3 範囲: 商品名のみ必須、画像 / サジェストなし) */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={handleCancelAdd}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>求商品を追加</Text>
            <Text style={styles.modalSub}>
              商品名のみ必須です。詳細情報や参考画像は、後で「求リスト」画面から編集できます。
            </Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>商品名 *</Text>
              <TextInput
                style={styles.input}
                placeholder="例: TREASURE ハルト アクリルスタンド"
                value={formCardName}
                onChangeText={setFormCardName}
                autoCorrect={false}
                editable={!submitting}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[
                  styles.modalCancelButton,
                  submitting && styles.modalButtonDisabled,
                ]}
                onPress={handleCancelAdd}
                disabled={submitting}
              >
                <Text style={styles.modalCancelButtonText}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSubmitButton,
                  !canSubmitAdd && styles.modalButtonDisabled,
                ]}
                onPress={handleSubmitAdd}
                disabled={!canSubmitAdd}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitButtonText}>追加する</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  outerWrap: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 説明
  desc: {
    gap: spacing.xs,
  },
  descTitle: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  descSub: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },

  // + 求商品を追加
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.backgroundCard,
  },
  addButtonPressed: {
    opacity: 0.7,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },

  // 空状態
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },

  // 求リスト row
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.backgroundMuted,
  },
  rowPressed: {
    opacity: 0.8,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardSub: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
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

  // 簡易追加モーダル
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 32,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalSubmitButtonText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  modalButtonDisabled: {
    opacity: 0.4,
  },
})
