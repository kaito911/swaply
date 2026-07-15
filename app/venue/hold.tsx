// app/venue/hold.tsx
//
// 会場「交換提案 (Hold申請)」フル画面ルート (旧 app/venue/[id].tsx の hold RN Modal を置換)。
// DB/RPC 不変 (createVenueHold をそのまま利用、proposerCard は string のまま)。
//
// params (すべて string): venueId / postId / receiverId / cardName (相手の譲) /
//   posterName (相手ハンドル) / wantDisplay (相手の求、無ければ '') / myCardPreset (双方向
//   マッチレーンからのプリセット、無ければ '')。
//   相手 supply_post の全オブジェクトは渡さず、Hold 生成 + 圧縮カード表示に必要な最小フィールドのみ。
import { VenueComposerScreen } from '@/components/venue/VenueComposerScreen'
import { FreeTextChipsRow } from '@/components/venue/FreeTextChipsRow'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import { createVenueHold, uploadCardImage } from '@/lib/supabase'
import type { MasterCharacter, MasterItemType } from '@/lib/types'
import {
  getCharacterSuggestionsAcrossWorks,
  getItemTypeSuggestions,
  recordListingKeyword,
} from '@/lib/master'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuthContext } from '@/providers/AuthProvider'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { ensureMediaPermission } from '@/lib/ensureMediaPermission'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

function paramStr(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? ''
  return v ?? ''
}

export default function VenueHoldScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null
  const raw = useLocalSearchParams()
  const venueId = paramStr(raw.venueId) || null
  const postId = paramStr(raw.postId) || null
  const receiverId = paramStr(raw.receiverId) || null
  const cardName = paramStr(raw.cardName)
  const posterName = paramStr(raw.posterName)
  const wantDisplay = paramStr(raw.wantDisplay)
  const myCardPreset = paramStr(raw.myCardPreset)

  // 譲 (自分が出す): MSA メンバー/種類 → 商品名を自動生成 (proposerCard は string)。
  // preset があれば商品名を preset で初期化し dirty 扱い (双方向マッチの利便を維持)。
  const [myCardInput, setMyCardInput] = useState(myCardPreset)
  const [myCardDirty, setMyCardDirty] = useState(myCardPreset !== '')
  const [holdCharacters, setHoldCharacters] = useState<MasterCharacter[]>([])
  const [holdCharacterFreeTexts, setHoldCharacterFreeTexts] = useState<string[]>([])
  const [holdItemTypes, setHoldItemTypes] = useState<MasterItemType[]>([])
  const [holdItemTypeFreeTexts, setHoldItemTypeFreeTexts] = useState<string[]>([])

  const [holdImageUri, setHoldImageUri] = useState<string | null>(null)
  const [holdAgreed, setHoldAgreed] = useState(false)
  const [submittingHold, setSubmittingHold] = useState(false)

  useEffect(() => {
    if (myCardDirty) return
    const chars = [
      ...holdCharacters.map((c) => c.display_name_ja),
      ...holdCharacterFreeTexts,
    ]
    const items = holdItemTypes.map((t) => t.display_name_ja)
    setMyCardInput([...chars, ...items].join(' '))
  }, [myCardDirty, holdCharacters, holdCharacterFreeTexts, holdItemTypes])

  const fetchCharacterSuggestions = useCallback(
    (input: string): MasterCharacter[] => getCharacterSuggestionsAcrossWorks(input),
    [],
  )
  const fetchItemTypeSuggestions = useCallback(
    (input: string): MasterItemType[] => getItemTypeSuggestions(input),
    [],
  )
  const makeAddFreeText =
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => (text: string) => {
      const trimmed = text.trim()
      if (trimmed === '') return
      setter((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
      if (userId != null) void recordListingKeyword(userId, trimmed)
    }

  const handlePickImage = async () => {
    if (!(await ensureMediaPermission('library'))) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (asset?.uri != null) setHoldImageUri(asset.uri)
  }

  const handleSubmitHold = async () => {
    if (
      venueId == null ||
      postId == null ||
      receiverId == null ||
      userId == null ||
      myCardInput.trim() === '' ||
      !holdAgreed
    )
      return
    try {
      setSubmittingHold(true)
      let uploadedUrl: string | null = null
      if (holdImageUri != null) {
        try {
          const ext = holdImageUri.split('.').pop()?.split('?')[0] ?? 'jpg'
          uploadedUrl = await uploadCardImage({
            userId,
            imageUri: holdImageUri,
            fileName: `venue-hold/${Date.now()}.${ext}`,
          })
        } catch (uploadErr) {
          console.error('[VenueHold][upload]', uploadErr)
          Alert.alert('エラー', '画像のアップロードに失敗しました')
          return
        }
      }

      await createVenueHold({
        venueId,
        proposerId: userId,
        receiverId,
        proposerCard: myCardInput.trim(),
        receiverCard: cardName,
        supplyPostId: postId,
        proposerImageUrl: uploadedUrl,
      })
      // 成功: 会場ホームは useFocusEffect で最新化。自分の会場交換一覧へ誘導。
      Alert.alert('交換の提案を送りました', '相手の承認待ちです。相手が承認すると成立します。', [
        {
          text: '自分の会場交換を見る',
          onPress: () =>
            router.replace({ pathname: '/venue/holds', params: { venueId } } as never),
        },
        { text: '閉じる', onPress: () => router.back(), style: 'cancel' },
      ])
    } catch (error) {
      console.error('[VenueHold][submit]', error)
      Alert.alert('エラー', '提案の送信に失敗しました')
    } finally {
      setSubmittingHold(false)
    }
  }

  return (
    <VenueComposerScreen
      title="交換を提案"
      ctaLabel="交換を提案する"
      onSubmit={handleSubmitHold}
      submitting={submittingHold}
      submitDisabled={!holdAgreed || myCardInput.trim() === ''}
    >
      {/* 相手の譲/求を1行圧縮した固定カード */}
      <View style={styles.targetCard}>
        <Text style={styles.targetPoster}>@{posterName || 'ユーザー'}</Text>
        <Text style={styles.targetLine} numberOfLines={2}>
          <Text style={styles.targetTag}>譲 </Text>
          {cardName || '—'}
          {wantDisplay !== '' ? (
            <>
              {'   '}
              <Text style={styles.targetTagWant}>求 </Text>
              {wantDisplay}
            </>
          ) : null}
        </Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>提案 → 相手が承認 → イベント当日中に会場で交換。</Text>
      </View>

      {/* あなたが出す */}
      <Text style={styles.sectionLead}>あなたが出すグッズ</Text>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>メンバー / キャラ（任意）</Text>
        <MultiSelectAutocomplete<MasterCharacter>
          selected={holdCharacters}
          onChange={setHoldCharacters}
          fetchSuggestions={fetchCharacterSuggestions}
          getKey={(c) => c.id}
          renderOption={renderCharacterOption}
          renderChip={(c) => <Text style={styles.msaChipLabel}>{c.display_name_ja}</Text>}
          placeholder="例: ジヒョン, ハルト"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={makeAddFreeText(setHoldCharacterFreeTexts)}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにないキャラを追加できます。運営が確認次第マスタに追加されます。"
        />
        <FreeTextChipsRow
          items={holdCharacterFreeTexts}
          onRemove={(t) => setHoldCharacterFreeTexts((prev) => prev.filter((x) => x !== t))}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>種類（任意）</Text>
        <MultiSelectAutocomplete<MasterItemType>
          selected={holdItemTypes}
          onChange={setHoldItemTypes}
          fetchSuggestions={fetchItemTypeSuggestions}
          getKey={(t) => t.id}
          renderOption={renderItemTypeOption}
          renderChip={(t) => <Text style={styles.msaChipLabel}>{t.display_name_ja}</Text>}
          placeholder="例: トレカ, アクスタ"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={makeAddFreeText(setHoldItemTypeFreeTexts)}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにない種別を追加できます。運営が確認次第マスタに追加されます。"
        />
        <FreeTextChipsRow
          items={holdItemTypeFreeTexts}
          onRemove={(t) => setHoldItemTypeFreeTexts((prev) => prev.filter((x) => x !== t))}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>商品名 *</Text>
        <TextInput
          style={styles.input}
          placeholder="例：ハルト A ver."
          value={myCardInput}
          onChangeText={(text) => {
            if (!myCardDirty) setMyCardDirty(true)
            setMyCardInput(text)
          }}
          autoCorrect={false}
        />
      </View>

      {/* 写真 (任意) */}
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>写真（任意）</Text>
        {holdImageUri != null ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: holdImageUri }} style={styles.imagePreview} resizeMode="cover" />
            <View style={styles.imageActions}>
              <Pressable style={styles.imageActionButton} onPress={handlePickImage}>
                <Text style={styles.imageActionText}>変更</Text>
              </Pressable>
              <Pressable style={styles.imageActionButton} onPress={() => setHoldImageUri(null)}>
                <Text style={styles.imageActionText}>削除</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.imagePickerButton} onPress={handlePickImage}>
            <Ionicons name="image-outline" size={20} color={colors.primary} />
            <Text style={styles.imagePickerText}>画像を選択</Text>
          </Pressable>
        )}
      </View>

      {/* 会場内その場交換の同意 */}
      <Pressable style={styles.agreeRow} onPress={() => setHoldAgreed((v) => !v)}>
        <View style={[styles.checkbox, holdAgreed && styles.checkboxChecked]}>
          {holdAgreed && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
        </View>
        <Text style={styles.agreeText}>
          会場内でその場で交換する条件で提案します。承認後は時間内に必ず交換します。
        </Text>
      </Pressable>
    </VenueComposerScreen>
  )
}

function renderCharacterOption(c: MasterCharacter) {
  return (
    <View>
      <Text style={styles.msaOptionMain}>{c.display_name_ja}</Text>
      {c.display_name_en != null && c.display_name_en !== '' && (
        <Text style={styles.msaOptionSub}>{c.display_name_en}</Text>
      )}
    </View>
  )
}
function renderItemTypeOption(t: MasterItemType) {
  return (
    <View>
      <Text style={styles.msaOptionMain}>{t.display_name_ja}</Text>
      {t.display_name_en != null && t.display_name_en !== '' && (
        <Text style={styles.msaOptionSub}>{t.display_name_en}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  targetCard: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  targetPoster: { fontSize: fontSize.xs, color: colors.textTertiary },
  targetLine: { fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: 20 },
  targetTag: { fontWeight: fontWeight.bold, color: colors.primary },
  targetTagWant: { fontWeight: fontWeight.bold, color: colors.tagInfoText },
  infoBox: {
    backgroundColor: colors.tagInfoBg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  infoText: { fontSize: fontSize.xs, color: colors.tagInfoText, lineHeight: 16 },
  sectionLead: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  fieldBlock: { gap: spacing.xs },
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
    backgroundColor: colors.backgroundCard,
  },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.backgroundCard,
  },
  imagePickerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  imagePreviewWrap: { gap: spacing.xs },
  imagePreview: {
    width: '50%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  imageActions: { flexDirection: 'row', gap: spacing.sm },
  imageActionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageActionText: { fontSize: fontSize.sm, color: colors.textSecondary },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  agreeText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  msaOptionMain: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  msaOptionSub: { fontSize: fontSize.xs, color: colors.textTertiary },
  msaChipLabel: {
    // item3: チップ背景 coral 固定のためラベルは白 (coral-on-coral 不可視を回避)。
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
  },
})
