// components/OshiPicker.tsx
//
// 推しの選択フォーム (グループ + メンバー1人) を共有化したコンポーネント。
// app/oshi-edit.tsx から「振る舞い不変」で抽出し、oshi-edit とオンボーディングで再利用する。
//
// 内包するもの (呼出側は用意不要):
//   - キーボード被り対策 (KeyboardAwareScroll: 候補ドロップダウンが KB に隠れないよう
//     入力欄を可視域上部へ寄せる)。MSA/WorkSection は Context 経由で ensureVisible を consume する。
//   - グループ = WorkSection (slug/自由入力)、メンバー = MultiSelectAutocomplete を単数化して 1 人。
//   - 保存 = addUserOshi ('登録する' 押下時の確定式)。成功で onAdded(item) を通知。
//
// header / footer は本コンポーネント内の ScrollView 内に描画する
//   (oshi-edit の説明カード・登録済み一覧を同一スクロールに載せ、従来の挙動を保つ)。
import { addUserOshi } from '@/lib/supabase'
import { UserOshi, MasterCharacter } from '@/lib/types'
import { getCharacterSuggestions } from '@/lib/master'
import { WorkSection } from '@/components/listing/section/WorkSection'
import type { WorkSectionValue } from '@/components/listing/section/types'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import {
  KeyboardAwareScrollProvider,
  useKeyboardAwareScroll,
} from '@/components/KeyboardAwareScroll'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { Ionicons } from '@expo/vector-icons'
import React, { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

interface OshiPickerProps {
  userId: string | null
  /** addUserOshi 成功時に通知 (呼出側で一覧追記 / 次ステップ遷移などに使う)。 */
  onAdded?: (item: UserOshi) => void
  /** スクロール上部に差し込むノード (oshi-edit の説明カード等)。 */
  header?: React.ReactNode
  /** スクロール下部に差し込むノード (oshi-edit の登録済み一覧等)。 */
  footer?: React.ReactNode
  /** フォームを最初から開いた状態にする (オンボーディング)。既定は閉じて「推しを追加する」トグル。 */
  initiallyOpen?: boolean
  /** 「推しを追加する」トグル + 「キャンセル」を出すか (oshi-edit=true)。false でフォーム常時開放 (オンボ)。 */
  showCollapseToggle?: boolean
  /** 登録ボタンのラベル (既定「登録する」)。 */
  submitLabel?: string
}

export function OshiPicker({
  userId,
  onAdded,
  header,
  footer,
  initiallyOpen = false,
  showCollapseToggle = true,
  submitLabel = '登録する',
}: OshiPickerProps) {
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(initiallyOpen)

  // グループ = WorkSection の値 (slug or 自由入力)。メンバー = 単数の master character。
  const [work, setWork] = useState<WorkSectionValue>(null)
  const [memberChar, setMemberChar] = useState<MasterCharacter | null>(null)

  // 候補ドロップダウンをキーボード被りから守る (Provider 外だと no-op のため明示 provide)。
  const { scrollRef, onScroll, ensureVisible } = useKeyboardAwareScroll()

  // 選択中グループに master_characters が存在するときだけメンバーステップを出す。
  //   getCharacterSuggestions('', {workId}) は空文字で「全件」を返す。
  //   自由入力グループ (master 未登録) は charactersByWork に無く 0 件 → 自動的に非表示。
  const memberOptionsAvailable =
    work != null && getCharacterSuggestions('', { workId: work.workId }).length > 0

  const resetForm = () => {
    setWork(null)
    setMemberChar(null)
    // トグル式 (oshi-edit) のときはフォームを閉じる。常時開放 (オンボ) では開いたまま。
    if (showCollapseToggle) setShowForm(false)
  }

  const handleAdd = async () => {
    if (work == null || userId == null) return
    try {
      setSaving(true)
      const item = await addUserOshi({
        userId,
        groupName: work.workId, // ★slug (自由入力時は自由入力文字列) をそのまま保存
        memberName: memberChar?.id ?? null, // ★character slug、未選択なら null (グループのみ)
      })
      onAdded?.(item)
      resetForm()
    } catch (error) {
      console.error('[OshiPicker][handleAdd]', error)
      Alert.alert('エラー', '登録に失敗しました。同じ推しがすでに登録されている可能性があります。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <KeyboardAwareScrollProvider value={ensureVisible}>
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {header}

          {showCollapseToggle && !showForm ? (
            <Pressable style={styles.addButton} onPress={() => setShowForm(true)}>
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={styles.addButtonText}>推しを追加する</Text>
            </Pressable>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>推しを登録する</Text>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>グループ・作品名 *</Text>
                <WorkSection
                  value={work}
                  onChange={(next) => {
                    setWork(next)
                    setMemberChar(null) // 作品が変わればメンバー選択はリセット
                  }}
                />
              </View>

              {work != null && memberOptionsAvailable && (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>メンバー名（任意・1人）</Text>
                  <MultiSelectAutocomplete<MasterCharacter>
                    selected={memberChar != null ? [memberChar] : []}
                    onChange={(next) =>
                      // ★controlled で単数化: 常に末尾 1 件のみ採用 (複数選択 UI にしない)
                      setMemberChar(next.length > 0 ? next[next.length - 1] : null)
                    }
                    fetchSuggestions={(input) =>
                      getCharacterSuggestions(input, { workId: work.workId })
                    }
                    getKey={(c) => c.id}
                    renderOption={(c) => (
                      <Text style={styles.optionText}>{c.display_name_ja}</Text>
                    )}
                    renderChip={(c) => (
                      <Text style={styles.chipText}>{c.display_name_ja}</Text>
                    )}
                    placeholder="例: 炭治郎"
                    softLimit={2} /* 単数のためヒントは出ない (0/1 件のみ) */
                  />
                </View>
              )}

              <View style={styles.formActions}>
                {showCollapseToggle && (
                  <Pressable
                    style={styles.cancelButton}
                    onPress={resetForm}
                    disabled={saving}
                  >
                    <Text style={styles.cancelButtonText}>キャンセル</Text>
                  </Pressable>
                )}
                <PrimaryCTA
                  label={submitLabel}
                  onPress={handleAdd}
                  loading={saving}
                  disabled={work == null}
                  size="lg"
                  style={{ flex: showCollapseToggle ? 2 : 1 }}
                />
              </View>
            </View>
          )}

          {footer}
        </ScrollView>
      </KeyboardAwareScrollProvider>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.base,
    paddingBottom: 60,
    gap: spacing.md,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
  },
  addButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  formTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  fieldBlock: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  optionText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
})
