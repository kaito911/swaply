// app/listing/new/single-page.tsx
//
// Phase B: 出品 1 ページ化 本体。
//
// 設計:
//   - useReducer<ListingFormState> で 6 section の値を集約管理
//     (types.ts の ListingFormState / INITIAL_LISTING_FORM_STATE を single source of truth)
//   - ScrollView 縦積み、折り畳みなし。並び順は厳守:
//     Image → Work → Characters → Items → Condition → Want → 出品CTA
//   - 各 section header に入力済み✓ (バリデーション充足で表示)
//   - 最下部 PrimaryCTA「出品する」: 全必須充足時のみ有効、未充足なら残り必須を動的案内
//   - submit は confirm.tsx の DB 処理を完全流用 (cards INSERT + card_wanted_links bulk)
//
// 自動下書き保存:
//   - reducer state 変更を監視、debounce 800ms で saveDraft
//   - 画面離脱時 (beforeRemove) にも確定保存 + トースト「下書きに保存しました」
//     (トースト部品なしのため Alert.alert で代替)
//   - 出品成功時は draft を削除 (ゴミを残さない)
//   - 新規 (isNew='1') は最初の入力発生時に draft 保存が走り始める
//     (URL params の draftId を最初から使うため、初回入力で既存 saveDraft が走る)
//   - 再開 (isNew='0') は URL params の draftId を使い、既存 draft を state hydrate
//
// スコープ制約:
//   - 既存 7 画面 (image/work/characters/items/want/condition/confirm) は無変更
//   - DB 処理は confirm.tsx の Phase B-2 実装 (cards INSERT + addCardWantedLinks) を流用
//   - 完全な原子性 (cards + wanted_links の同一トランザクション) は将来 RPC 化で検討

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { ScreenHeader } from '@/components/ScreenHeader'
import { CharactersSection } from '@/components/listing/section/CharactersSection'
import { ConditionSection } from '@/components/listing/section/ConditionSection'
import { ImageSection } from '@/components/listing/section/ImageSection'
import { ItemsSection } from '@/components/listing/section/ItemsSection'
import {
  INITIAL_LISTING_FORM_STATE,
  type CharactersSectionValue,
  type ConditionSectionValue,
  type ImageSectionValue,
  type ItemsSectionValue,
  type ListingFormState,
  type WantMasterValue,
  type WorkSectionValue,
} from '@/components/listing/section/types'
import { WantMasterSection } from '@/components/listing/section/WantMasterSection'
import {
  KeyboardAwareScrollProvider,
  useKeyboardAwareScroll,
} from '@/components/KeyboardAwareScroll'
import { WorkSection } from '@/components/listing/section/WorkSection'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import { deleteDraft, loadDraft, saveDraft } from '@/lib/listingDrafts'
import { useToast } from '@/providers/ToastProvider'
import {
  getCharacterById,
  getItemTypeById,
  getMemberLabel,
  getWorkById,
} from '@/lib/master'
import { supabase, uploadCardImage } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// ─────────────────────────────────────────
// reducer
// ─────────────────────────────────────────

type Action =
  | { type: 'HYDRATE'; state: ListingFormState }
  | { type: 'SET_IMAGE'; value: ImageSectionValue }
  | { type: 'SET_WORK'; value: WorkSectionValue }
  | { type: 'SET_CHARACTERS'; value: CharactersSectionValue }
  | { type: 'SET_ITEMS'; value: ItemsSectionValue }
  | { type: 'SET_CONDITION'; value: ConditionSectionValue }
  | { type: 'SET_WANT'; value: WantMasterValue }

function reducer(state: ListingFormState, action: Action): ListingFormState {
  switch (action.type) {
    case 'HYDRATE':
      return action.state
    case 'SET_IMAGE':
      return { ...state, image: action.value }
    case 'SET_WORK':
      return { ...state, work: action.value }
    case 'SET_CHARACTERS':
      return { ...state, characters: action.value }
    case 'SET_ITEMS':
      return { ...state, itemTypes: action.value }
    case 'SET_CONDITION':
      return { ...state, condition: action.value }
    case 'SET_WANT':
      return { ...state, want: action.value }
    default:
      return state
  }
}

// ─────────────────────────────────────────
// validation (section 完了✓判定 + 必須未充足の動的案内)
// ─────────────────────────────────────────

/** section ごとの充足判定。true = ✓ 表示、false = 未入力 */
function isImageDone(v: ImageSectionValue): boolean {
  return v.frontUri != null && v.frontUri !== ''
}
function isWorkDone(v: WorkSectionValue): boolean {
  return v != null
}
function isCharactersDone(v: CharactersSectionValue): boolean {
  return v.length >= 1
}
function isItemsDone(v: ItemsSectionValue): boolean {
  return v.length >= 1
}
function isConditionDone(): boolean {
  // condition の必須項目は無し (want_description も allows_adjustment も任意)
  // Phase B では常に✓とする (want.tsx / condition.tsx の既存挙動と整合)
  return true
}
function isWantDone(v: WantMasterValue): boolean {
  // 求グループ + 求メンバー が必須 (グッズ種別は任意)
  return v.works.length >= 1 && v.characters.length >= 1
}

/**
 * 未充足の必須項目名を配列で返す (順序は section の並び順)。
 * 空配列なら全必須充足 (submit 可)。
 */
function missingRequired(state: ListingFormState): string[] {
  const missing: string[] = []
  if (!isImageDone(state.image)) missing.push('写真')
  if (!isWorkDone(state.work)) missing.push('作品名')
  if (!isCharactersDone(state.characters)) missing.push(getMemberLabel(state.work?.category ?? null))
  if (!isItemsDone(state.itemTypes)) missing.push('種別')
  if (state.want.works.length === 0) missing.push('求グループ')
  else if (state.want.characters.length === 0)
    missing.push(`求${getMemberLabel(getWorkById(state.want.works[0])?.category ?? null)}`)
  return missing
}

/**
 * PrimaryCTA disabled 時に出す案内文言。詰問調でなく案内調。
 * 例: 「写真と作品名を入れたら出品できます」
 */
function buildMissingHint(missing: string[]): string {
  if (missing.length === 0) return ''
  if (missing.length === 1) return `${missing[0]}を入れたら出品できます`
  if (missing.length === 2) return `${missing[0]}と${missing[1]}を入れたら出品できます`
  const last = missing[missing.length - 1]
  const rest = missing.slice(0, -1).join('、')
  return `${rest}と${last}を入れたら出品できます`
}

// ─────────────────────────────────────────
// helpers (submit 変換)
// ─────────────────────────────────────────

function characterDisplay(id: string): string {
  return getCharacterById(id)?.display_name_ja ?? id
}
function itemTypeDisplay(id: string): string {
  return getItemTypeById(id)?.display_name_ja ?? id
}

/**
 * cards.name 列に投入する表示名を生成する (confirm.tsx の buildSetName を移植)。
 * 例: 「鬼滅の刃 - 炭治郎、禰豆子、善逸 (アクスタ)」
 */
function buildSetName(state: ListingFormState): string {
  if (state.work == null) return '無題の出品'
  const work = getWorkById(state.work.workId)
  const workDisplayName = work?.display_name_ja ?? state.work.workId
  const charNames = state.characters.map(characterDisplay)
  const typeNames = state.itemTypes.map(itemTypeDisplay)

  const parts: string[] = []
  if (workDisplayName !== '') parts.push(workDisplayName)
  if (charNames.length > 0) {
    parts.push(
      charNames.length <= 3
        ? charNames.join('、')
        : `${charNames.slice(0, 3).join('、')} 他${charNames.length - 3}名`,
    )
  }
  if (typeNames.length > 0) {
    parts.push(`(${typeNames.join('・')})`)
  }
  return parts.join(' - ')
}

// ─────────────────────────────────────────
// screen
// ─────────────────────────────────────────

const DRAFT_DEBOUNCE_MS = 800

export default function ListingNewSinglePageScreen() {
  const params = useLocalSearchParams<{
    draftId: string
    isNew: string
  }>()
  const navigation = useNavigation()
  const { userId, loading: authLoading } = useAuth()
  const { showToast } = useToast()
  // ① 候補ドロップダウンのキーボード被り対策 (メインフォームの ScrollView に注入)。
  const { scrollRef, onScroll, ensureVisible } = useKeyboardAwareScroll()

  const draftId = params.draftId
  const isNew = params.isNew === '1'

  const [state, dispatch] = useReducer(reducer, INITIAL_LISTING_FORM_STATE)
  const [hydrated, setHydrated] = useState<boolean>(isNew)
  const [submitting, setSubmitting] = useState(false)
  // ② 出品前の確認画面を表示中か (bulk の STEP4 確認と体験を揃える)。
  //   「出品する」で true → 確認ビュー → 「この内容で出品する」で既存 handleSubmit を呼ぶ。
  const [confirming, setConfirming] = useState(false)

  // reducer state を常に最新の ref で保持 (unmount 時の flush 用)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // 保存中フラグ (unmount 時の重複保存回避)
  const submittedRef = useRef(false)

  // ── 1. hydrate ──
  // 再開の場合は既存 draft を読み込んで state を復元
  useEffect(() => {
    if (isNew) return
    if (draftId == null || draftId === '') return
    let cancelled = false
    void loadDraft(draftId).then((draft) => {
      if (cancelled) return
      if (draft != null) {
        dispatch({ type: 'HYDRATE', state: draft.state })
      }
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [draftId, isNew])

  // ── 2. debounce 自動保存 ──
  // hydrate 完了後、state 変更のたびに debounce 800ms で saveDraft
  useEffect(() => {
    if (!hydrated) return
    if (draftId == null || draftId === '') return
    const t = setTimeout(() => {
      void saveDraft(draftId, state)
    }, DRAFT_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [state, hydrated, draftId])

  // ── 3. 離脱時の確定保存 + トースト ──
  // navigation の beforeRemove で保存 (戻る / スワイプ / router.back 全部拾う)。
  // 保存完了後に showToast で軽量通知 (OK タップ不要、2.5s で自動消滅)。
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      // 出品成功 (submittedRef=true) では draft は既に削除済のため保存しない
      if (submittedRef.current) return
      if (draftId == null || draftId === '') return
      void saveDraft(draftId, stateRef.current).then(() => {
        showToast('下書きに保存しました')
      })
    })
    return unsubscribe
  }, [navigation, draftId, showToast])

  // ── 4. submit ──
  const handleSubmit = useCallback(async () => {
    if (submitting || authLoading) return
    if (userId == null) {
      Alert.alert('エラー', 'ログイン情報が取得できません')
      return
    }
    const missing = missingRequired(state)
    if (missing.length > 0) return
    if (state.work == null) return // TS narrowing (missingRequired が保証済)

    try {
      setSubmitting(true)

      // 表面画像アップロード
      let resolvedImageUrl: string | null = null
      const frontUri = state.image.frontUri
      if (frontUri != null && frontUri !== '' && !frontUri.startsWith('http')) {
        try {
          resolvedImageUrl = await uploadCardImage({ userId, imageUri: frontUri })
        } catch (error) {
          console.error('[single-page] uploadCardImage failed', error)
          resolvedImageUrl = null
        }
      } else if (frontUri != null && frontUri.startsWith('http')) {
        resolvedImageUrl = frontUri
      }

      // 裏面画像アップロード (任意)
      let resolvedImageBackUrl: string | null = null
      const backUri = state.image.backUri
      if (backUri != null && backUri !== '') {
        if (!backUri.startsWith('http')) {
          try {
            resolvedImageBackUrl = await uploadCardImage({
              userId,
              imageUri: backUri,
              fileName: `back-${Date.now()}.jpg`,
            })
          } catch (error) {
            console.error('[single-page] uploadCardImage (back) failed', error)
            resolvedImageBackUrl = null
          }
        } else {
          resolvedImageBackUrl = backUri
        }
      }

      // cards INSERT (confirm.tsx toInsertRow と同構造)
      const row = {
        owner_user_id: userId,
        name: buildSetName(state),
        category: state.work.category,
        work_id: state.work.workId,
        characters: state.characters,
        item_types: state.itemTypes,
        image_url: resolvedImageUrl,
        image_back_url: resolvedImageBackUrl,
        description: null,
        status: 'active',
        is_public: true, // 顔2: 通常出品は公開 (商品棚=false は顔2本体で別途)
        condition: null,
        want_description:
          state.condition.want_description !== ''
            ? state.condition.want_description
            : null,
        allows_mail: true,
        allows_handoff: false,
        allows_adjustment: state.condition.allows_adjustment,
        adjustment_max: state.condition.allows_adjustment
          ? state.condition.adjustment_max
          : null,
        // 求の master 構造化 (PR-1a: cards.want_* を正とする。既存列、DDL 不要)。
        // wanted_cards + card_wanted_links への書込は廃止 (案 X を上書き)。
        want_works: state.want.works,
        want_characters: state.want.characters,
        want_item_types: state.want.itemTypes,
        // legacy K-POP 列
        group_name: null,
        member_name: null,
        series: null,
      }

      // 求は cards.want_* に含めて 1 回の INSERT で完結
      // (card_wanted_links への二次書込は廃止 = 部分成功分岐も不要)。
      const { error: cardError } = await supabase.from('cards').insert(row)
      if (cardError) throw cardError

      // 成功: draft 削除 → 出品完了 → mypage
      submittedRef.current = true
      await deleteDraft(draftId)
      Alert.alert('出品完了', '出品が完了しました。', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/mypage' as never),
        },
      ])
    } catch (err) {
      console.error('[single-page][handleSubmit]', err)
      const message =
        typeof err === 'object' &&
        err != null &&
        'message' in err &&
        typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : '出品に失敗しました。'
      Alert.alert('出品エラー', message)
    } finally {
      setSubmitting(false)
    }
  }, [submitting, authLoading, userId, state, draftId])

  // ── derive ──
  const missing = useMemo(() => missingRequired(state), [state])
  const canSubmit = missing.length === 0 && !submitting
  const missingHint = buildMissingHint(missing)

  const workIdForCharacters = state.work?.workId ?? ''

  // hydrate 中はスピナー (再開経路のみ)
  if (!hydrated) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="出品" />
        <View style={styles.centerBox}>
          <Ionicons
            name="hourglass-outline"
            size={24}
            color={colors.textTertiary}
          />
          <Text style={styles.hintText}>下書きを読み込んでいます</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ② 出品前の確認画面 (bulk の STEP4 と体験統一)。入力内容を一覧プレビュー →
  //   「この内容で出品する」で既存 handleSubmit を呼ぶ (insert 処理は不変)。
  if (confirming) {
    const workName =
      state.work != null
        ? getWorkById(state.work.workId)?.display_name_ja ?? state.work.workId
        : ''
    const memberLabel = getMemberLabel(state.work?.category ?? null)
    const charText = state.characters.map(characterDisplay).join('、')
    const typeText = state.itemTypes.map(itemTypeDisplay).join('・')
    const noteText = state.condition.want_description
    const wantWorkName = state.want.works
      .map((id) => getWorkById(id)?.display_name_ja ?? id)
      .join('、')
    const wantMemberLabel = getMemberLabel(
      getWorkById(state.want.works[0])?.category ?? null,
    )
    const wantCharText = state.want.characters.map(characterDisplay).join('、')
    const wantTypeText = state.want.itemTypes.map(itemTypeDisplay).join('・')
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="出品内容の確認" onBack={() => setConfirming(false)} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.confirmLead}>この内容で出品します。修正する場合は「戻る」。</Text>

          {(state.image.frontUri != null || state.image.backUri != null) && (
            <View style={styles.confirmImageRow}>
              {state.image.frontUri != null && state.image.frontUri !== '' && (
                <Image source={{ uri: state.image.frontUri }} style={styles.confirmImage} />
              )}
              {state.image.backUri != null && state.image.backUri !== '' && (
                <Image source={{ uri: state.image.backUri }} style={styles.confirmImage} />
              )}
            </View>
          )}

          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>作品 / グループ</Text>
            <Text style={styles.confirmValue}>{workName !== '' ? workName : '—'}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>{memberLabel}</Text>
            <Text style={styles.confirmValue}>{charText !== '' ? charText : '—'}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>グッズ種類</Text>
            <Text style={styles.confirmValue}>{typeText !== '' ? typeText : '—'}</Text>
          </View>
          {noteText !== '' && (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>補足</Text>
              <Text style={styles.confirmValue}>{noteText}</Text>
            </View>
          )}
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>求グループ</Text>
            <Text style={styles.confirmValue}>
              {wantWorkName !== '' ? wantWorkName : '—'}
            </Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>求{wantMemberLabel}</Text>
            <Text style={styles.confirmValue}>
              {wantCharText !== '' ? wantCharText : '—'}
            </Text>
          </View>
          {wantTypeText !== '' && (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>求グッズ種別</Text>
              <Text style={styles.confirmValue}>{wantTypeText}</Text>
            </View>
          )}

          <View style={styles.submitWrap}>
            <PrimaryCTA
              label="この内容で出品する"
              onPress={handleSubmit}
              loading={submitting}
              size="lg"
            />
            <Pressable
              style={styles.confirmBackLink}
              onPress={() => setConfirming(false)}
              disabled={submitting}
            >
              <Text style={styles.confirmBackLinkText}>修正する（戻る）</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="出品" />
      <KeyboardAwareScrollProvider value={ensureVisible}>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
          {/* 非公式サービス免責 (常時1行・控えめ・著作権 Day1) */}
          <Text style={styles.disclaimer}>公式グッズのみ対象・非公式サービスです</Text>

          {/* ① 写真 */}
          <SectionHeader
            index={1}
            title="写真"
            done={isImageDone(state.image)}
          />
          <ImageSection
            value={state.image}
            onChange={(v) => dispatch({ type: 'SET_IMAGE', value: v })}
          />

          <View style={styles.sectionDivider} />

          {/* ② 作品 */}
          <SectionHeader
            index={2}
            title="作品 / グループ"
            done={isWorkDone(state.work)}
          />
          <WorkSection
            value={state.work}
            onChange={(v) => dispatch({ type: 'SET_WORK', value: v })}
          />

          <View style={styles.sectionDivider} />

          {/* ③ メンバー/キャラ (work.category 由来で出し分け) */}
          <SectionHeader
            index={3}
            title={getMemberLabel(state.work?.category ?? null)}
            done={isCharactersDone(state.characters)}
          />
          <CharactersSection
            value={state.characters}
            onChange={(v) => dispatch({ type: 'SET_CHARACTERS', value: v })}
            workId={workIdForCharacters}
            userId={userId}
          />

          <View style={styles.sectionDivider} />

          {/* ④ 種別 */}
          <SectionHeader
            index={4}
            title="種別"
            done={isItemsDone(state.itemTypes)}
          />
          <ItemsSection
            value={state.itemTypes}
            onChange={(v) => dispatch({ type: 'SET_ITEMS', value: v })}
            userId={userId}
          />

          <View style={styles.sectionDivider} />

          {/* ⑤ 状態・調整金 */}
          <SectionHeader
            index={5}
            title="求の詳細・調整金"
            done={isConditionDone()}
            optional
          />
          <ConditionSection
            value={state.condition}
            onChange={(v) => dispatch({ type: 'SET_CONDITION', value: v })}
          />

          <View style={styles.sectionDivider} />

          {/* ⑥ 求 (最後) */}
          <SectionHeader
            index={6}
            title="求"
            done={isWantDone(state.want)}
          />
          <WantMasterSection
            value={state.want}
            onChange={(v) => dispatch({ type: 'SET_WANT', value: v })}
            userId={userId}
            offerWork={state.work}
            offerItemTypes={state.itemTypes}
          />

          {/* 出品 CTA */}
          <View style={styles.submitWrap}>
            {!canSubmit && missingHint !== '' && (
              <Text style={styles.missingHint}>{missingHint}</Text>
            )}
            <PrimaryCTA
              label="出品する"
              onPress={() => setConfirming(true)}
              disabled={!canSubmit}
              size="lg"
            />
          </View>
      </ScrollView>
      </KeyboardAwareScrollProvider>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// sub-components
// ─────────────────────────────────────────

function SectionHeader({
  index,
  title,
  done,
  optional = false,
}: {
  index: number
  title: string
  done: boolean
  optional?: boolean
}) {
  return (
    <View style={sectionHeaderStyles.wrap}>
      <View style={sectionHeaderStyles.numberBadge}>
        <Text style={sectionHeaderStyles.numberText}>{index}</Text>
      </View>
      <Text style={sectionHeaderStyles.title}>{title}</Text>
      {optional && (
        <Text style={sectionHeaderStyles.optional}>（任意）</Text>
      )}
      {done && (
        <View style={sectionHeaderStyles.checkBadge}>
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={colors.primary}
          />
        </View>
      )}
    </View>
  )
}

const sectionHeaderStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  numberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  optional: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  checkBadge: {
    marginLeft: 'auto',
  },
})

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  // 非公式サービス免責キャプション (控えめ・視認可)
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.xl,
  },
  submitWrap: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  // ② 出品前確認ビュー
  confirmLead: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  confirmImageRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  confirmImage: {
    width: 96,
    height: 128,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  confirmRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 3,
  },
  confirmLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textTertiary,
  },
  confirmValue: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  confirmBackLink: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  confirmBackLinkText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    textDecorationLine: 'underline',
  },
  missingHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  hintText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
})
