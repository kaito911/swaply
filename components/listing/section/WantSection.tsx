// components/listing/section/WantSection.tsx
//
// ★★ 現在未使用 (dead code)。ただし【意図的に温存・削除禁止】★★
//   求リストから選択する方式の旧 UI。道2で single-page (PR-1a) / bulk (PR-1b-1) とも
//   WantMasterSection（求の master 構造化・自由入力＋候補方式）へ移行済みで、
//   現在どの画面からも import/描画されていない。
//   それでも消さない理由: 将来「リスト選択方式」へ戻す候補として保持する事業資産。
//   商品マスタが十分成熟した時／事務所提携で公式画像を流用できるようになった時に、
//   本コンポーネントへ切り替え直す想定。「未参照だから消してよい」と誤判断しないこと。
//   関連: components/listing/section/types.ts の WantSectionValue、WantMasterSection.tsx。
//
// ── 以下は移行前 (Phase A) の設計メモ (履歴として保持) ──
// Phase A: 出品 1 ページ化 section 抽出。★最大再利用対象
// 元: app/listing/new/want.tsx (wanted_cards multi-select + 簡易追加モーダル)。
//
// 再利用/書き換え比率: 再利用 ~90% / 書き換え ~10%
//   - fetchMyWantedCards の load / toggleSelect / 追加モーダルの全ロジック: 完全流用
//   - 表示 (list / row / thumbnail / checkbox): 完全流用
//   - 空状態 (求リスト 0 件時の empty box) + 簡易追加モーダル: 完全流用
//   - 削除: SafeAreaView / ScreenHeader / handleNext / PrimaryCTA / router.push
//   - 追加: controlled 化 (value = wantedCardId[]、内部で Set 化して toggle)、
//     userId を props 化 (useAuth 直呼びから分離)
//
// hydration:
//   value を Set 化して checkbox 描画に使う。新規行を追加した場合は自動選択。

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { addWantedCard, fetchMyWantedCards } from '@/lib/supabase'
import type { WantedCard } from '@/lib/types'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import type { WantSectionValue } from './types'

export type WantSectionProps = {
  value: WantSectionValue
  onChange: (next: WantSectionValue) => void
  /** wanted_cards fetch/insert に必要。未認証 (null) の場合は空リスト表示 */
  userId: string | null
}

export function WantSection({ value, onChange, userId }: WantSectionProps) {
  const [wants, setWants] = useState<WantedCard[]>([])
  const [loading, setLoading] = useState(true)

  const [showAddModal, setShowAddModal] = useState(false)
  const [formCardName, setFormCardName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectedIds = useMemo(() => new Set(value), [value])

  const load = useCallback(async () => {
    if (userId == null) {
      setWants([])
      setLoading(false)
      return
    }
    setLoading(true)
    const data = await fetchMyWantedCards(userId)
    setWants(data)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

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
      setWants((prev) => [created, ...prev])
      // 新規行を自動選択 (want.tsx L152-153 の UX 継承)
      onChange([...selectedIds, created.id])
      setShowAddModal(false)
      setFormCardName('')
    } catch {
      Alert.alert('エラー', '追加に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmitAdd = formCardName.trim() !== '' && !submitting

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
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

      {/* 簡易追加モーダル (商品名のみ必須。詳細編集は /wants 画面で) */}
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
              <View style={styles.modalSubmitWrap}>
                <PrimaryCTA
                  label="追加する"
                  onPress={handleSubmitAdd}
                  loading={submitting}
                  disabled={!canSubmitAdd}
                  size="md"
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  center: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
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
  fieldBlock: { gap: 6 },
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
    alignItems: 'center',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
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
  modalSubmitWrap: {
    flex: 1,
  },
  modalButtonDisabled: {
    opacity: 0.4,
  },
})
