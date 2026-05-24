// app/shelf.tsx
// 商品棚画面
// マイページ → 商品棚 で遷移
import { addShelfItem, deleteShelfItem, fetchShelfItems, fetchUserOshi } from '@/lib/supabase'
import { ShelfItem, UserOshi } from '@/lib/types'
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

export default function ShelfScreen() {
  const { session, loading: authLoading } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [items, setItems] = useState<ShelfItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [oshiItems, setOshiItems] = useState<UserOshi[]>([])

  const [cardName, setCardName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [memberName, setMemberName] = useState('')
  const [series, setSeries] = useState('')
  const [note, setNote] = useState('')

  const resetForm = () => {
    setCardName('')
    setGroupName('')
    setMemberName('')
    setSeries('')
    setNote('')
    setShowForm(false)
  }

  useFocusEffect(
    useCallback(() => {
      if (authLoading || userId == null) return
      setLoading(true)
      Promise.all([
        fetchShelfItems(userId),
        fetchUserOshi(userId),
      ]).then(([shelfData, oshiData]) => {
        setItems(shelfData)
        setOshiItems(oshiData)
      }).finally(() => setLoading(false))
    }, [userId, authLoading])
  )

  const handleAdd = async () => {
    const trimmedName = cardName.trim()
    if (trimmedName === '' || userId == null) return

    try {
      setSaving(true)
      const item = await addShelfItem({
        userId,
        cardName: trimmedName,
        groupName: groupName.trim() !== '' ? groupName.trim() : null,
        memberName: memberName.trim() !== '' ? memberName.trim() : null,
        series: series.trim() !== '' ? series.trim() : null,
        note: note.trim() !== '' ? note.trim() : null,
      })
      setItems((prev) => [item, ...prev])
      resetForm()
    } catch (error) {
      console.error('[ShelfScreen][handleAdd]', error)
      Alert.alert('エラー', '登録に失敗しました。同じカードがすでに登録されている可能性があります。')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (item: ShelfItem) => {
    Alert.alert(
      '削除しますか？',
      `「${item.card_name}」を商品棚から削除します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteShelfItem(item.id)
              setItems((prev) => prev.filter((i) => i.id !== item.id))
            } catch (error) {
              console.error('[ShelfScreen][handleDelete]', error)
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* 説明 */}
          <View style={styles.descCard}>
            <Text style={styles.descText}>
              所持しているカードを登録すると、成立しやすい交換候補に優先表示されます。出品とは別管理です。
            </Text>
          </View>

          {/* ── 推しセクション ── */}
          <View style={styles.oshiCard}>
            <View style={styles.oshiHeader}>
              <Text style={styles.oshiTitle}>推し</Text>
              <Pressable
                style={styles.oshiEditButton}
                onPress={() => router.push('/oshi-edit' as never)}
              >
                <Text style={styles.oshiEditText}>編集</Text>
              </Pressable>
            </View>
            {oshiItems.length === 0 ? (
              <Text style={styles.oshiEmpty}>
                推しを登録するとおすすめ精度が上がります
              </Text>
            ) : (
              <View style={styles.oshiChips}>
                {oshiItems.map((item) => (
                  <View key={item.id} style={styles.oshiChip}>
                    <Text style={styles.oshiChipText}>
                      {item.group_name}
                      {item.member_name != null ? ` / ${item.member_name}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* 追加ボタン / フォーム */}
          {!showForm ? (
            <Pressable
              style={styles.addButton}
              onPress={() => setShowForm(true)}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={styles.addButtonText}>カードを追加する</Text>
            </Pressable>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>カードを登録する</Text>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>カード名 *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例：ジュンギュ トレカ"
                  value={cardName}
                  onChangeText={setCardName}
                  autoCorrect={false}
                  autoFocus
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>グループ</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例：TREASURE"
                  value={groupName}
                  onChangeText={setGroupName}
                  autoCorrect={false}
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>メンバー</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例：ジュンギュ"
                  value={memberName}
                  onChangeText={setMemberName}
                  autoCorrect={false}
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>シリーズ</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例：REBOOT"
                  value={series}
                  onChangeText={setSeries}
                  autoCorrect={false}
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>メモ（任意）</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例：スリーブ保管中"
                  value={note}
                  onChangeText={setNote}
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
                    (cardName.trim() === '' || saving) && styles.saveButtonDisabled,
                  ]}
                  onPress={handleAdd}
                  disabled={cardName.trim() === '' || saving}
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

          {/* 一覧 */}
          {items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="albums-outline" size={40} color={colors.border} />
              <Text style={styles.emptyText}>まだカードが登録されていません</Text>
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
                    {(item.group_name != null || item.member_name != null) && (
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {[item.group_name, item.member_name].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.card_name}
                    </Text>
                    {item.series != null && (
                      <Text style={styles.itemSeries} numberOfLines={1}>
                        {item.series}
                      </Text>
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
  itemSub: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  itemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSeries: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  deleteButton: {
    padding: 4,
    flexShrink: 0,
  },
  oshiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  oshiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  oshiTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  oshiEditButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  oshiEditText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  oshiEmpty: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  oshiChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  oshiChip: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  oshiChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
})
