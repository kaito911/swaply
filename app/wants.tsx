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
import { WantSuggestInput } from '@/components/WantSuggestInput'
import { addWantedCard, archiveWantedCard, fetchMyWantedCards } from '@/lib/supabase'
import { getWorkById, type SearchSuggestion } from '@/lib/master'
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
  // WantSuggestInput の入力欄テキスト (4 form fields とは独立、suggestion 検索専用)
  const [suggestInput, setSuggestInput] = useState('')

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
    setSuggestInput('')
  }

  // WantSuggestInput からの候補 tap を form field に振り分ける。
  // ルール (B-0 採用方針 + 修正版):
  //   - work          → formGroupName (work.category 関わらず group/作品 欄に統一)
  //                     + formCardName が空なら work.display_name_ja で埋める (上書きしない)
  //   - character     → formMemberName + 親 work が解決できれば formGroupName も
  //                     + formCardName が空なら character.display_name_ja で埋める (上書きしない)
  //   - item_type     → formCardName (商品名指定の意図が強いため上書き OK)
  //   - series        → 該当 master なし、自由入力欄のまま (B-0 スコープ外)
  // 「空判定」は trim() === '' で行う (空白だけの入力は空扱い)。
  // ユーザーは選択後も 4 fields を手動編集できる (suggestion は補助、最終決定は親フォーム)。
  const handleSelectSuggestion = useCallback((s: SearchSuggestion) => {
    if (s.type === 'work') {
      setFormGroupName(s.data.display_name_ja)
      // 商品名が空なら work 名で埋める (既に値がある場合は上書きしない)
      setFormCardName((prev) => (prev.trim() === '' ? s.data.display_name_ja : prev))
      return
    }
    if (s.type === 'character') {
      setFormMemberName(s.data.display_name_ja)
      // 親 work が master cache から取れれば group_name にも自動 fill
      const work = getWorkById(s.data.work_id)
      if (work != null) {
        setFormGroupName(work.display_name_ja)
      }
      // 商品名が空なら character 名で埋める (既に値がある場合は上書きしない)
      setFormCardName((prev) => (prev.trim() === '' ? s.data.display_name_ja : prev))
      return
    }
    // item_type は商品名指定の意図が強いため上書き OK
    setFormCardName(s.data.display_name_ja)
  }, [])

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
            {/* スクロール領域 (タイトル + 候補検索 + 4 form fields)
                keyboardShouldPersistTaps="handled" でキーボード表示中もサジェスト
                tap を取りこぼさない。modalActions は sticky 下部で常時表示。 */}
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>求商品を追加</Text>
              <Text style={styles.modalSub}>
                交換で求めている商品を登録します。商品名は必須、その他は任意です。
              </Text>

              {/* 候補検索 (任意): tap で下のフォームに自動入力 */}
              <View style={styles.suggestBlock}>
                <Text style={styles.fieldLabel}>候補から検索（任意）</Text>
                <WantSuggestInput
                  value={suggestInput}
                  onChangeValue={setSuggestInput}
                  onSelectSuggestion={handleSelectSuggestion}
                  placeholder="例: ハルト, 鬼滅, アクスタ"
                />
                <Text style={styles.suggestHint}>
                  候補を選ぶと下のフォームに入ります。直接入力も可能です。
                </Text>
              </View>

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
            </ScrollView>

            {/* sticky 下部: キャンセル / 追加するボタン */}
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
    paddingTop: 20,
    paddingBottom: 24,
    // モーダル高さ上限 (キーボード表示時に画面外へ逃げない保険)。
    // ScrollView がこの高さ内で縦スクロールする。
    maxHeight: '90%',
  },
  modalScroll: {
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
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
  suggestBlock: {
    gap: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE8FA',
    marginBottom: 4,
  },
  suggestHint: {
    fontSize: 11,
    color: '#8A8499',
    lineHeight: 16,
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
    marginTop: 12,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#ECE8FA',
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
