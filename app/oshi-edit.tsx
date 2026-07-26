// app/oshi-edit.tsx
// 推し編集画面
// マイページ → 推し編集 で遷移
//
// 入力はチップ/slug ベースに統一 (他の master 入力と同じ部品を流用):
//   - グループ: WorkSection (master_works autocomplete + 自由入力)。返り値 workId (slug/自由入力) を保存。
//   - メンバー: MultiSelectAutocomplete を controlled で「単数」流用 (character slug を保存)。
//     ★member は 1 行 1 人。onChange で常に末尾 1 件のみ採用し、複数選択 UI にしない。
//     ★master_characters が 0 件の作品ではメンバー選択ステップ自体を出さない。
//   - 保存は既存の text 列 (group_name / member_name) に slug をそのまま入れる (列追加なし・OTA 完結)。
//   - 表示側は slug → display_name_ja に変換して見せる (生 slug を出さない)。
import { addUserOshi, deleteUserOshi, fetchUserOshi } from '@/lib/supabase'
import { UserOshi, MasterCharacter } from '@/lib/types'
import {
  getCharacterById,
  getCharacterSuggestions,
  getWorkById,
} from '@/lib/master'
import { WorkSection } from '@/components/listing/section/WorkSection'
import type { WorkSectionValue } from '@/components/listing/section/types'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import {
  KeyboardAwareScrollProvider,
  useKeyboardAwareScroll,
} from '@/components/KeyboardAwareScroll'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { PrimaryCTA } from '@/components/PrimaryCTA'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/** slug (または自由入力文字列) を表示名へ。master 未ヒット時は素通り (自由入力/旧データ)。 */
function groupLabelOf(groupSlug: string): string {
  return getWorkById(groupSlug)?.display_name_ja ?? groupSlug
}
function memberLabelOf(memberSlug: string): string {
  return getCharacterById(memberSlug)?.display_name_ja ?? memberSlug
}

export default function OshiEditScreen() {
  const { session, loading: authLoading } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [items, setItems] = useState<UserOshi[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // グループ = WorkSection の値 (slug or 自由入力)。メンバー = 単数の master character。
  const [work, setWork] = useState<WorkSectionValue>(null)
  const [memberChar, setMemberChar] = useState<MasterCharacter | null>(null)

  // 候補ドロップダウンをキーボード被りから守る (Provider 外だと no-op のため明示 provide)。
  const { scrollRef, onScroll, ensureVisible } = useKeyboardAwareScroll()

  // 選択中グループに master_characters が存在するときだけメンバーステップを出す。
  //   getCharacterSuggestions('', {workId}) は空文字で「全件」を返す (入力が短いから空ではない)。
  //   自由入力グループ (master 未登録) は charactersByWork に無く 0 件 → 自動的に非表示。
  const memberOptionsAvailable =
    work != null && getCharacterSuggestions('', { workId: work.workId }).length > 0

  const resetForm = () => {
    setWork(null)
    setMemberChar(null)
    setShowForm(false)
  }

  useFocusEffect(
    useCallback(() => {
      if (authLoading) return
      if (userId == null) { // ★ updated: userId null のとき setLoading(false) を呼ぶ
        setLoading(false)
        return
      }
      setLoading(true)
      fetchUserOshi(userId)
        .then(setItems)
        .finally(() => setLoading(false))
    }, [userId, authLoading])
  )

  const handleAdd = async () => {
    if (work == null || userId == null) return

    try {
      setSaving(true)
      const item = await addUserOshi({
        userId,
        groupName: work.workId, // ★slug (自由入力時は自由入力文字列) をそのまま保存
        memberName: memberChar?.id ?? null, // ★character slug、未選択なら null (グループのみ)
      })
      setItems((prev) => [...prev, item])
      resetForm()
    } catch (error) {
      console.error('[OshiEditScreen][handleAdd]', error)
      Alert.alert('エラー', '登録に失敗しました。同じ推しがすでに登録されている可能性があります。')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (item: UserOshi) => {
    const groupLabel = groupLabelOf(item.group_name)
    const label = item.member_name != null
      ? `${groupLabel} / ${memberLabelOf(item.member_name)}`
      : groupLabel
    Alert.alert(
      '削除しますか？',
      `「${label}」を推しから削除します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUserOshi(item.id)
              setItems((prev) => prev.filter((i) => i.id !== item.id))
            } catch (error) {
              console.error('[OshiEditScreen][handleDelete]', error)
              Alert.alert('エラー', '削除に失敗しました。')
            }
          },
        },
      ]
    )
  }

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.customHeader}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>推し編集</Text>
        <View style={styles.headerRight} />
      </View>

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
            <View style={styles.descCard}>
              <Text style={styles.descText}>
                登録した推しの出品を、ホームでまとめて表示します。
              </Text>
            </View>

            {!showForm ? (
              <Pressable
                style={styles.addButton}
                onPress={() => setShowForm(true)}
              >
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
                  <Pressable
                    style={styles.cancelButton}
                    onPress={resetForm}
                    disabled={saving}
                  >
                    <Text style={styles.cancelButtonText}>キャンセル</Text>
                  </Pressable>
                  <PrimaryCTA
                    label="登録する"
                    onPress={handleAdd}
                    loading={saving}
                    disabled={work == null}
                    size="lg"
                    style={{ flex: 2 }}
                  />
                  {/* 隣 cancelButton は 44h のまま (今回スコープ外)。
                      lg=56h との段差は実機で要確認、必要なら md に落とす候補。 */}
                </View>
              </View>
            )}

            {items.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="heart-outline" size={40} color={colors.border} />
                <Text style={styles.emptyText}>まだ推しが登録されていません</Text>
              </View>
            ) : (
              <View style={styles.listCard}>
                <Text style={styles.listLabel}>登録済み（{items.length}件）</Text>
                {items.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.itemRow,
                      index < items.length - 1 && styles.itemRowBorder,
                    ]}
                  >
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemGroup}>{groupLabelOf(item.group_name)}</Text>
                      {item.member_name != null && (
                        <Text style={styles.itemMember}>{memberLabelOf(item.member_name)}</Text>
                      )}
                    </View>
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => handleDelete(item)}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </KeyboardAwareScrollProvider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: {
    flex: 1,
    backgroundColor: '#F7F7FB',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7FB',
  },
  // ★ added: カスタムヘッダー
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 36,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  headerRight: {
    width: 36,
  },
  content: {
    padding: spacing.base,
    paddingBottom: 60,
    gap: spacing.md,
  },
  descCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  descText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
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
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F4F3FF',
  },
  itemMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemGroup: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemMember: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  deleteButton: {
    padding: 4,
    flexShrink: 0,
  },
})
