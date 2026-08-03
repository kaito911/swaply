// app/venue/post.tsx
//
// 会場「出品」フル画面ルート (旧 app/venue/[id].tsx の出品 RN Modal を置換)。
// 縦に長い譲/求 + MSA 候補直下展開 + sticky CTA が収まらない問題を、フル画面化で解消。
// DB/RPC/マッチロジックは不変 (addSupplyPost をそのまま利用、入力の器のみ変更)。
//
// params: venueId (必須), workId (会場の作品 slug、'' = NULL 会場)。
//   キャラ候補を会場作品で絞るために workId を受け取る (venue 再 fetch を回避)。
import { VenueComposerScreen } from '@/components/venue/VenueComposerScreen'
import { FreeTextChipsRow } from '@/components/venue/FreeTextChipsRow'
import { MultiSelectAutocomplete } from '@/components/MultiSelectAutocomplete'
import { addSupplyPost, uploadCardImage } from '@/lib/supabase'
import type { MasterCharacter, MasterItemType } from '@/lib/types'
import {
  getCharacterSuggestions,
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

export default function VenuePostScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null
  const params = useLocalSearchParams<{ venueId?: string; workId?: string }>()
  const venueId = typeof params.venueId === 'string' ? params.venueId : null
  const workId =
    typeof params.workId === 'string' && params.workId !== ''
      ? params.workId
      : null

  const [postCard, setPostCard] = useState('')
  const [postCardDirty, setPostCardDirty] = useState(false)
  const [postWantItemTypesDirty, setPostWantItemTypesDirty] = useState(false)
  const [postImageUri, setPostImageUri] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)

  const [postCharacters, setPostCharacters] = useState<MasterCharacter[]>([])
  const [postCharacterFreeTexts, setPostCharacterFreeTexts] = useState<string[]>([])
  const [postItemTypes, setPostItemTypes] = useState<MasterItemType[]>([])
  const [postItemTypeFreeTexts, setPostItemTypeFreeTexts] = useState<string[]>([])
  const [postWantCharacters, setPostWantCharacters] = useState<MasterCharacter[]>([])
  const [postWantCharacterFreeTexts, setPostWantCharacterFreeTexts] = useState<string[]>([])
  const [postWantItemTypes, setPostWantItemTypes] = useState<MasterItemType[]>([])
  const [postWantItemTypeFreeTexts, setPostWantItemTypeFreeTexts] = useState<string[]>([])

  // 譲 (メンバー/キャラ + 種別) から商品名を自動生成。dirty 後は手編集を尊重 (現行式踏襲)。
  useEffect(() => {
    if (postCardDirty) return
    const chars = [
      ...postCharacters.map((c) => c.display_name_ja),
      ...postCharacterFreeTexts,
    ]
    const items = postItemTypes.map((t) => t.display_name_ja)
    setPostCard([...chars, ...items].join(' '))
  }, [postCardDirty, postCharacters, postCharacterFreeTexts, postItemTypes])

  // 求種別は譲種別をデフォルト継承。求種別を手で触るまで追従 (現行挙動踏襲)。
  useEffect(() => {
    if (postWantItemTypesDirty) return
    setPostWantItemTypes(postItemTypes)
  }, [postWantItemTypesDirty, postItemTypes])

  const fetchOfferCharacterSuggestions = useCallback(
    (input: string): MasterCharacter[] =>
      workId == null
        ? getCharacterSuggestionsAcrossWorks(input)
        : getCharacterSuggestions(input, { workId }),
    [workId],
  )
  // ④修正: 求メンバー候補も譲と同じく会場 work_id で固定 (単一グループ会場では
  //   他グループの同名キャラを候補から排除しマッチ不成立を防ぐ)。work_id null の
  //   NULL 会場 (複数グループ) では従来どおり作品横断にフォールバック。
  const fetchWantCharacterSuggestions = useCallback(
    (input: string): MasterCharacter[] =>
      workId == null
        ? getCharacterSuggestionsAcrossWorks(input)
        : getCharacterSuggestions(input, { workId }),
    [workId],
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
    if (asset?.uri != null) setPostImageUri(asset.uri)
  }

  const handleSubmitPost = async () => {
    if (postCard.trim() === '' || userId == null || venueId == null) return
    try {
      setPosting(true)
      let uploadedUrl: string | null = null
      if (postImageUri != null) {
        try {
          const ext = postImageUri.split('.').pop()?.split('?')[0] ?? 'jpg'
          uploadedUrl = await uploadCardImage({
            userId,
            imageUri: postImageUri,
            fileName: `venue-supply/${Date.now()}.${ext}`,
          })
        } catch (uploadErr) {
          console.error('[VenuePost][upload]', uploadErr)
          Alert.alert('エラー', '画像のアップロードに失敗しました')
          return
        }
      }

      await addSupplyPost({
        venueId,
        userId,
        cardName: postCard.trim(),
        groupName: null,
        wantCard: null,
        imageUrl: uploadedUrl,
        workId,
        characters: [...postCharacters.map((c) => c.id), ...postCharacterFreeTexts],
        itemTypes: [...postItemTypes.map((t) => t.id), ...postItemTypeFreeTexts],
        wantCharacters: [
          ...postWantCharacters.map((c) => c.id),
          ...postWantCharacterFreeTexts,
        ],
        wantItemTypes: [
          ...postWantItemTypes.map((t) => t.id),
          ...postWantItemTypeFreeTexts,
        ],
      })
      // 会場ホームは useFocusEffect(reloadAll) で戻り時に供給板を再取得する。
      router.back()
    } catch (error) {
      console.error('[VenuePost][submit]', error)
      Alert.alert('エラー', '投稿に失敗しました')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VenueComposerScreen
      title="この会場で出す"
      ctaLabel="出品する"
      onSubmit={handleSubmitPost}
      submitting={posting}
      submitDisabled={postCard.trim() === ''}
    >
      {/* 写真 (任意) */}
      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>写真（任意）</Text>
        {postImageUri != null ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: postImageUri }} style={styles.imagePreview} resizeMode="cover" />
            <View style={styles.imageActions}>
              <Pressable style={styles.imageActionButton} onPress={handlePickImage}>
                <Text style={styles.imageActionText}>変更</Text>
              </Pressable>
              <Pressable style={styles.imageActionButton} onPress={() => setPostImageUri(null)}>
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

      {/* ── 譲 ── */}
      <SectionTag label="譲" tone="give" />

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>メンバー / キャラ（任意）</Text>
        <MultiSelectAutocomplete<MasterCharacter>
          selected={postCharacters}
          onChange={setPostCharacters}
          fetchSuggestions={fetchOfferCharacterSuggestions}
          getKey={(c) => c.id}
          renderOption={renderCharacterOption}
          renderChip={(c) => <Text style={styles.msaChipLabel}>{c.display_name_ja}</Text>}
          placeholder="例: ジヒョン, ハルト"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={makeAddFreeText(setPostCharacterFreeTexts)}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにないキャラを追加できます。運営が確認次第マスタに追加されます。"
        />
        <FreeTextChipsRow
          items={postCharacterFreeTexts}
          onRemove={(t) => setPostCharacterFreeTexts((prev) => prev.filter((x) => x !== t))}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>種類（任意）</Text>
        <MultiSelectAutocomplete<MasterItemType>
          selected={postItemTypes}
          onChange={setPostItemTypes}
          fetchSuggestions={fetchItemTypeSuggestions}
          getKey={(t) => t.id}
          renderOption={renderItemTypeOption}
          renderChip={(t) => <Text style={styles.msaChipLabel}>{t.display_name_ja}</Text>}
          placeholder="例: トレカ, アクスタ"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={makeAddFreeText(setPostItemTypeFreeTexts)}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにない種別を追加できます。運営が確認次第マスタに追加されます。"
        />
        <FreeTextChipsRow
          items={postItemTypeFreeTexts}
          onRemove={(t) => setPostItemTypeFreeTexts((prev) => prev.filter((x) => x !== t))}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>商品名 *</Text>
        <TextInput
          style={styles.input}
          placeholder="例：ハルト A ver. トレカ"
          value={postCard}
          onChangeText={(text) => {
            if (!postCardDirty) setPostCardDirty(true)
            setPostCard(text)
          }}
          autoCorrect={false}
        />
      </View>

      {/* ── 求 ── */}
      <SectionTag label="求" tone="want" />

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>
          メンバー / キャラ（任意{workId == null ? '・作品横断' : ''}）
        </Text>
        <MultiSelectAutocomplete<MasterCharacter>
          selected={postWantCharacters}
          onChange={setPostWantCharacters}
          fetchSuggestions={fetchWantCharacterSuggestions}
          getKey={(c) => c.id}
          renderOption={renderCharacterOption}
          renderChip={(c) => <Text style={styles.msaChipLabel}>{c.display_name_ja}</Text>}
          placeholder="例: ジヒョン, ハルト"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={makeAddFreeText(setPostWantCharacterFreeTexts)}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにないキャラを追加できます。運営が確認次第マスタに追加されます。"
        />
        <FreeTextChipsRow
          items={postWantCharacterFreeTexts}
          onRemove={(t) =>
            setPostWantCharacterFreeTexts((prev) => prev.filter((x) => x !== t))
          }
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>種別（任意）</Text>
        <MultiSelectAutocomplete<MasterItemType>
          selected={postWantItemTypes}
          onChange={(next) => {
            setPostWantItemTypesDirty(true)
            setPostWantItemTypes(next)
          }}
          fetchSuggestions={fetchItemTypeSuggestions}
          getKey={(t) => t.id}
          renderOption={renderItemTypeOption}
          renderChip={(t) => <Text style={styles.msaChipLabel}>{t.display_name_ja}</Text>}
          placeholder="例: トレカ, アクスタ"
          minInputChars={2}
          softLimit={10}
          freeTextEnabled
          onFreeText={makeAddFreeText(setPostWantItemTypeFreeTexts)}
          freeTextModalTitle="フリーテキストで追加"
          freeTextModalBody="マスタにない種別を追加できます。運営が確認次第マスタに追加されます。"
        />
        <FreeTextChipsRow
          items={postWantItemTypeFreeTexts}
          onRemove={(t) =>
            setPostWantItemTypeFreeTexts((prev) => prev.filter((x) => x !== t))
          }
        />
      </View>
    </VenueComposerScreen>
  )
}

// ── 譲/求 セクションタグ (コーラル/ブルー、UI は器・タグと CTA のみ色) ──
function SectionTag({ label, tone }: { label: string; tone: 'give' | 'want' }) {
  const isGive = tone === 'give'
  return (
    <View style={[styles.sectionTag, isGive ? styles.tagGive : styles.tagWant]}>
      <Text style={[styles.sectionTagText, isGive ? styles.tagGiveText : styles.tagWantText]}>
        {label}
      </Text>
    </View>
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
  // section tag
  sectionTag: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginTop: spacing.sm,
  },
  tagGive: { backgroundColor: '#FDE7EE' },
  tagWant: { backgroundColor: colors.tagInfoBg },
  sectionTagText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  tagGiveText: { color: colors.primary },
  tagWantText: { color: colors.tagInfoText },
  // image picker
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
  // MSA option / chip
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
