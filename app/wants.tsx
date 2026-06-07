// app/wants.tsx
// 「求リスト」一覧画面 (DB テーブル名は wanted_cards、UI 命名は「求リスト」)。
//
// いいね (liked_cards、♡ ボタン保存) とは別概念:
//   - wanted_cards (本画面) = 自分が交換で求める商品の管理
//   - liked_cards          = 他人の出品を ♡ で保存 (純 UI 用途、別画面 /likes)
// 両者は DB テーブル・画面・責務すべて分離する。
//
// アクセス動線:
//   1. mypage 設定リンク (commit 8 で「求リスト」label に整理予定)
//   2. (Phase B 以降) 出品作成時の求選択モーダルからも遷移
import { ScreenHeader } from '@/components/ScreenHeader'
import { addWantedCard, archiveWantedCard, fetchMyWantedCards } from '@/lib/supabase'
import { WantedCard } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
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

function formatDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}/${mm}/${dd}`
}

export default function WantsScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [wants, setWants] = useState<WantedCard[]>([])
  const [loading, setLoading] = useState(true)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  // 「+ 追加」モーダル state
  const [showAddModal, setShowAddModal] = useState(false)
  const [formCardName, setFormCardName] = useState('')
  const [formGroupName, setFormGroupName] = useState('')
  const [formMemberName, setFormMemberName] = useState('')
  const [formSeries, setFormSeries] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const handleArchive = (want: WantedCard) => {
    Alert.alert(
      '求リストから削除しますか？',
      `「${want.card_name}」を求リストから外します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              setArchivingId(want.id)
              await archiveWantedCard(want.id)
              setWants((prev) => prev.filter((w) => w.id !== want.id))
            } catch {
              Alert.alert('エラー', '削除に失敗しました')
            } finally {
              setArchivingId(null)
            }
          },
        },
      ],
    )
  }

  const resetForm = () => {
    setFormCardName('')
    setFormGroupName('')
    setFormMemberName('')
    setFormSeries('')
  }

  const handleOpenAdd = () => {
    resetForm()
    setShowAddModal(true)
  }

  const handleCancelAdd = () => {
    if (submitting) return
    setShowAddModal(false)
    resetForm()
  }

  const handleSubmitAdd = async () => {
    if (userId == null) return
    const cardName = formCardName.trim()
    if (cardName === '') return
    try {
      setSubmitting(true)
      await addWantedCard({
        userId,
        cardName,
        groupName: formGroupName.trim() !== '' ? formGroupName.trim() : null,
        memberName: formMemberName.trim() !== '' ? formMemberName.trim() : null,
        series: formSeries.trim() !== '' ? formSeries.trim() : null,
      })
      setShowAddModal(false)
      resetForm()
      await load()
    } catch {
      Alert.alert('エラー', '追加に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader title="求リスト" />
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  const canSubmit = formCardName.trim() !== '' && !submitting

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScreenHeader title="求リスト" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 説明文 */}
        <Text style={styles.note}>
          交換で求めている商品を登録しておくと、出品時に選べます。
        </Text>

        {/* + 追加 ボタン */}
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
            <Text style={styles.emptyTitle}>求リストはまだ空です</Text>
            <Text style={styles.emptySub}>
              上の「求商品を追加」から登録できます。
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {wants.map((want) => {
              const isArchiving = archivingId === want.id
              const sub = [want.series, want.group_name, want.member_name]
                .filter(Boolean)
                .join(' · ')

              return (
                <View key={want.id} style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {want.card_name}
                    </Text>
                    {sub.length > 0 && (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {sub}
                      </Text>
                    )}
                    <Text style={styles.dateText}>{formatDate(want.created_at)}</Text>
                  </View>

                  <Pressable
                    style={[styles.removeButton, isArchiving && styles.removeButtonDisabled]}
                    onPress={() => handleArchive(want)}
                    disabled={isArchiving}
                  >
                    <Text style={styles.removeButtonText}>
                      {isArchiving ? '...' : '削除'}
                    </Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* 「+ 追加」モーダル */}
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
              交換で求めている商品を登録します。商品名は必須、その他は任意です。
            </Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>商品名 *</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 炭治郎 アクスタ"
                value={formCardName}
                onChangeText={setFormCardName}
                autoCorrect={false}
                editable={!submitting}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>グループ / 作品</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 鬼滅の刃 / TREASURE"
                value={formGroupName}
                onChangeText={setFormGroupName}
                autoCorrect={false}
                editable={!submitting}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>キャラ / メンバー</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 竈門炭治郎 / ハルト"
                value={formMemberName}
                onChangeText={setFormMemberName}
                autoCorrect={false}
                editable={!submitting}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>シリーズ</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 第1弾 / A ver."
                value={formSeries}
                onChangeText={setFormSeries}
                autoCorrect={false}
                editable={!submitting}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalCancelButton, submitting && styles.modalButtonDisabled]}
                onPress={handleCancelAdd}
                disabled={submitting}
              >
                <Text style={styles.modalCancelButtonText}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSubmitButton,
                  !canSubmit && styles.modalButtonDisabled,
                ]}
                onPress={handleSubmitAdd}
                disabled={!canSubmit}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7FB',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontSize: 13,
    lineHeight: 20,
    color: '#71717A',
    marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },
  addButtonPressed: {
    opacity: 0.7,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#18181B',
    textAlign: 'center',
  },
  emptySub: {
    marginTop: 8,
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    gap: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECE8FA',
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#18181B',
  },
  cardSub: {
    marginTop: 3,
    fontSize: 11,
    color: '#8A8499',
  },
  dateText: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textTertiary,
  },
  removeButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FAFAFA',
  },
  removeButtonDisabled: {
    opacity: 0.4,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
  },
  modalSub: {
    fontSize: 12,
    color: '#71717A',
    lineHeight: 18,
    marginBottom: 4,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#18181B',
    backgroundColor: '#FAFAFA',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#52525B',
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalSubmitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalButtonDisabled: {
    opacity: 0.4,
  },
})
