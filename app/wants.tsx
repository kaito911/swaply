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
import {
  addWantedCard,
  archiveWantedCard,
  fetchMyWantedCards,
  uploadCardImage,
} from '@/lib/supabase'
import { getWorkById, type SearchSuggestion } from '@/lib/master'
import { WantedCard } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useFocusEffect } from 'expo-router'
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

function formatDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}/${mm}/${dd}`
}

/**
 * group / member / item_type / series を空でないものだけ結合して商品名を合成する。
 * 例: { groupName: 'TREASURE', memberName: 'ハルト', itemTypeName: 'アクリルスタンド', series: '私服ver.' }
 *  → 'TREASURE ハルト アクリルスタンド 私服ver.'
 *
 * trim() === '' のものを除外、空白 1 個でつなぐ。
 */
function buildAutoCardName(params: {
  groupName: string
  memberName: string
  itemTypeName: string
  series: string
}): string {
  return [params.groupName, params.memberName, params.itemTypeName, params.series]
    .map((v) => v.trim())
    .filter((v) => v !== '')
    .join(' ')
}

// ─────────────────────────────────────────
// 参考画像 picker helpers (Phase B-1)
// 「ほしい商品の参考画像」用途、出品画像 (app/listing/new/image.tsx) とは別概念。
// allowsEditing + aspect [3,4] は listing と同じパターンを踏襲 (オタクグッズは縦長が多い)。
// ─────────────────────────────────────────

async function pickFromLibrary(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('権限が必要です', '写真ライブラリへのアクセスを許可してください。')
    return null
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset?.uri) {
    Alert.alert('画像エラー', '画像を取得できませんでした。')
    return null
  }
  return asset.uri
}

async function pickFromCamera(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('権限が必要です', 'カメラへのアクセスを許可してください。')
    return null
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [3, 4],
    quality: 0.8,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset?.uri) {
    Alert.alert('画像エラー', '画像を取得できませんでした。')
    return null
  }
  return asset.uri
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
  // item_type は wanted_cards にカラムなし (B-0 スコープ外)、UI state のみで保持して
  // 商品名 auto 合成に使う。submit 時は card_name に文字列として含まれる。
  const [selectedItemTypeName, setSelectedItemTypeName] = useState('')
  // ユーザーが商品名 TextInput を直接編集したら true に固定。以後 auto 合成は無効化。
  // resetForm で false に戻る。
  const [isCardNameManuallyEdited, setIsCardNameManuallyEdited] = useState(false)
  // Phase B-1: 参考画像のローカル URI (アップロード前)。submit 時に Storage へ upload
  // → wanted_cards.image_url に publicUrl を入れる。modal 閉じる / submit 成功で reset。
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null)

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
    setSelectedItemTypeName('')
    setIsCardNameManuallyEdited(false)
    setSelectedImageUri(null)
  }

  // 参考画像 picker handlers (Phase B-1)
  const handlePickFromLibrary = async () => {
    if (submitting) return
    const uri = await pickFromLibrary()
    if (uri != null) setSelectedImageUri(uri)
  }
  const handlePickFromCamera = async () => {
    if (submitting) return
    const uri = await pickFromCamera()
    if (uri != null) setSelectedImageUri(uri)
  }
  const handleRemoveImage = () => {
    if (submitting) return
    setSelectedImageUri(null)
  }

  // WantSuggestInput からの候補 tap を form field に振り分ける。
  // ルール (B-0 修正版):
  //   - work       → formGroupName だけ更新
  //   - character  → formMemberName + 親 work が解決できれば formGroupName も
  //   - item_type  → selectedItemTypeName (UI state、wanted_cards カラムなし)
  // 商品名の自動合成は下記の useEffect で 4 源 (group / member / item_type / series)
  // を見て一括処理する (suggestion / 手入力に関わらず単一の合成ロジックで管理)。
  const handleSelectSuggestion = useCallback((s: SearchSuggestion) => {
    if (s.type === 'work') {
      setFormGroupName(s.data.display_name_ja)
      return
    }
    if (s.type === 'character') {
      setFormMemberName(s.data.display_name_ja)
      // 親 work が master cache から取れれば group_name にも自動 fill
      const work = getWorkById(s.data.work_id)
      if (work != null) {
        setFormGroupName(work.display_name_ja)
      }
      return
    }
    // item_type は wanted_cards カラム不在、UI state のみで保持
    setSelectedItemTypeName(s.data.display_name_ja)
  }, [])

  // 商品名 auto 合成: group / member / item_type / series のいずれかが変わったら
  // 自動で商品名を再生成する。ユーザーが商品名を直接編集した後 (isCardNameManuallyEdited=true)
  // はこの自動更新を停止し、手入力を尊重する。
  useEffect(() => {
    if (isCardNameManuallyEdited) return
    const auto = buildAutoCardName({
      groupName: formGroupName,
      memberName: formMemberName,
      itemTypeName: selectedItemTypeName,
      series: formSeries,
    })
    setFormCardName(auto)
  }, [
    formGroupName,
    formMemberName,
    selectedItemTypeName,
    formSeries,
    isCardNameManuallyEdited,
  ])

  // 商品名 TextInput の直接編集ハンドラ: 編集を検知したら manualEdited=true に固定。
  const handleCardNameChange = (text: string) => {
    setFormCardName(text)
    setIsCardNameManuallyEdited(true)
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

    setSubmitting(true)

    // Phase B-1: 画像がある場合は Storage に upload してから addWantedCard。
    // upload 失敗時は addWantedCard を実行せず alert + 早期 return (wanted_cards を作らない)。
    let uploadedImageUrl: string | undefined = undefined
    if (selectedImageUri != null) {
      try {
        const ext = selectedImageUri.split('.').pop()?.split('?')[0] ?? 'jpg'
        // path 規約: ${userId}/wants/<timestamp>.<ext> (uploadCardImage の fileName 引数経由)
        const fileName = `wants/${Date.now()}.${ext}`
        uploadedImageUrl = await uploadCardImage({
          userId,
          imageUri: selectedImageUri,
          fileName,
        })
      } catch (e) {
        console.error('[wants][handleSubmitAdd][uploadImage]', e)
        Alert.alert('エラー', '画像のアップロードに失敗しました')
        setSubmitting(false)
        return
      }
    }

    try {
      await addWantedCard({
        userId,
        cardName,
        groupName: formGroupName.trim() !== '' ? formGroupName.trim() : null,
        memberName: formMemberName.trim() !== '' ? formMemberName.trim() : null,
        series: formSeries.trim() !== '' ? formSeries.trim() : null,
        imageUrl: uploadedImageUrl, // undefined なら addWantedCard で payload に含めない
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
                  {/* 参考画像 thumbnail (B-1、image_url がある行のみ表示) */}
                  {want.image_url != null && want.image_url !== '' && (
                    <Image
                      source={{ uri: want.image_url }}
                      style={styles.listThumb}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                  )}

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
                  placeholder="例: TREASURE ハルト アクリルスタンド"
                  value={formCardName}
                  onChangeText={handleCardNameChange}
                  autoCorrect={false}
                  editable={!submitting}
                />
                <Text style={styles.fieldHint}>
                  グループ / キャラ / グッズ種別 / シリーズから自動で組み立てます。直接編集も可能です。
                </Text>
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

              {/* 参考画像セクション (Phase B-1、任意)
                  「ほしい商品の参考画像」用途。出品画像とは別概念。 */}
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>参考画像を追加（任意）</Text>
                <Text style={styles.fieldHint}>
                  ほしい商品の参考画像として使います。出品画像ではありません。
                </Text>

                {selectedImageUri != null && (
                  <View style={styles.imagePreviewRow}>
                    <Image
                      source={{ uri: selectedImageUri }}
                      style={styles.imagePreview}
                      contentFit="cover"
                      transition={150}
                    />
                    <Pressable
                      style={[
                        styles.imageRemoveButton,
                        submitting && styles.imageRemoveButtonDisabled,
                      ]}
                      onPress={handleRemoveImage}
                      disabled={submitting}
                    >
                      <Text style={styles.imageRemoveButtonText}>削除</Text>
                    </Pressable>
                  </View>
                )}

                <View style={styles.imagePickButtonRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.imagePickButton,
                      pressed && styles.imagePickButtonPressed,
                      submitting && styles.imagePickButtonDisabled,
                    ]}
                    onPress={handlePickFromLibrary}
                    disabled={submitting}
                  >
                    <Ionicons name="image-outline" size={16} color={colors.primary} />
                    <Text style={styles.imagePickButtonText}>
                      {selectedImageUri != null ? '写真から変更' : '写真を選ぶ'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.imagePickButton,
                      pressed && styles.imagePickButtonPressed,
                      submitting && styles.imagePickButtonDisabled,
                    ]}
                    onPress={handlePickFromCamera}
                    disabled={submitting}
                  >
                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                    <Text style={styles.imagePickButtonText}>
                      {selectedImageUri != null ? 'カメラで再撮影' : 'カメラで撮る'}
                    </Text>
                  </Pressable>
                </View>
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
  listThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#FAFAFA',
    flexShrink: 0,
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
  fieldHint: {
    fontSize: 11,
    color: '#8A8499',
    lineHeight: 16,
    marginTop: 2,
  },

  // 参考画像セクション (modal 内、Phase B-1)
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  imageRemoveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FAFAFA',
  },
  imageRemoveButtonDisabled: {
    opacity: 0.4,
  },
  imageRemoveButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B',
  },
  imagePickButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  imagePickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: '#FFFFFF',
  },
  imagePickButtonPressed: {
    opacity: 0.7,
  },
  imagePickButtonDisabled: {
    opacity: 0.4,
  },
  imagePickButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
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
