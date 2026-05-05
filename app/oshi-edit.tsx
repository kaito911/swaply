// app/oshi-edit.tsx
// 推し編集画面
// マイページ → 推し編集 で遷移
import { addUserOshi, deleteUserOshi, fetchUserOshi } from '@/lib/supabase'
import { UserOshi } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
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
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function OshiEditScreen() {
  const { session, loading: authLoading } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [items, setItems] = useState<UserOshi[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [groupName, setGroupName] = useState('')
  const [memberName, setMemberName] = useState('')

  const resetForm = () => {
    setGroupName('')
    setMemberName('')
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
    const trimmedGroup = groupName.trim()
    if (trimmedGroup === '' || userId == null) return

    try {
      setSaving(true)
      const item = await addUserOshi({
        userId,
        groupName: trimmedGroup,
        memberName: memberName.trim() !== '' ? memberName.trim() : null,
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
    const label = item.member_name != null
      ? `${item.group_name} / ${item.member_name}`
      : item.group_name
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
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.descCard}>
            <Text style={styles.descText}>
              推し登録はフィルターとおすすめ精度の向上にのみ使います。TrustやMatchingの優遇には影響しません。
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
                <Text style={styles.fieldLabel}>グループ名 *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例：TREASURE"
                  value={groupName}
                  onChangeText={setGroupName}
                  autoCorrect={false}
                  autoFocus
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>メンバー名（任意）</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例：ジュンギュ"
                  value={memberName}
                  onChangeText={setMemberName}
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formActions}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={resetForm}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>キャンセル</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.saveButton,
                    (groupName.trim() === '' || saving) && styles.saveButtonDisabled,
                  ]}
                  onPress={handleAdd}
                  disabled={groupName.trim() === '' || saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>登録する</Text>
                  )}
                </Pressable>
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
                    <Text style={styles.itemGroup}>{item.group_name}</Text>
                    {item.member_name != null && (
                      <Text style={styles.itemMember}>{item.member_name}</Text>
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.background,
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
  saveButton: {
    flex: 2,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  saveButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
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
