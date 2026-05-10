// components/MultiSelectAutocomplete.tsx
//
// Generic multi-select autocomplete component (Step 3 commit 2)。
//
// 設計方針 (refactor_plan v1.11 章 3.14、Step 3 Phase 2 §2):
//   - 連続選択モード: 1 個選んでも閉じない、選択済 chip 表示、× で個別削除
//   - フリーテキスト fallback: 該当なし時に「『xxx』を追加」ボタン → 確認モーダル
//   - ソフト上限 10 個 (デフォルト): 超過時はヒント表示のみ、選択は許容
//   - 既選択 item は候補から除外
//   - sync/async どちらの fetchSuggestions も対応
//
// 出品 form (work / characters / item_types) で使用、search.tsx の単一選択 UI とは独立。

import { Ionicons } from '@expo/vector-icons'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

export interface MultiSelectAutocompleteProps<T> {
  /** 現在選択されている item の配列 */
  selected: T[]

  /** 選択変更コールバック (追加・削除両方) */
  onChange: (next: T[]) => void

  /** 入力に応じた候補取得 (sync/async どちらも対応) */
  fetchSuggestions: (input: string) => Promise<T[]> | T[]

  /** item から一意の key を取得 */
  getKey: (item: T) => string

  /** 候補リスト 1 行のレンダリング */
  renderOption: (item: T) => React.ReactNode

  /** 選択チップ 1 個のレンダリング (× ボタンは外側で付与) */
  renderChip: (item: T) => React.ReactNode

  /** プレースホルダー文言 */
  placeholder?: string

  /** 候補表示の最低入力文字数 (default: 2) */
  minInputChars?: number

  /** ソフト上限 (超過時にヒント表示、選択は許容、default: 10) */
  softLimit?: number

  /** ソフト上限超過時のヒント文言 */
  softLimitHint?: string

  /** フリーテキスト追加機能を有効化 (default: false) */
  freeTextEnabled?: boolean

  /** フリーテキスト追加時のコールバック */
  onFreeText?: (text: string) => void

  /** フリーテキスト確認モーダルのタイトル */
  freeTextModalTitle?: string

  /** フリーテキスト確認モーダルの本文 */
  freeTextModalBody?: string

  /** 入力欄の disabled 状態 */
  disabled?: boolean
}

export function MultiSelectAutocomplete<T>(props: MultiSelectAutocompleteProps<T>) {
  const minChars = props.minInputChars ?? 2
  const softLimit = props.softLimit ?? 10

  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [showFreeTextModal, setShowFreeTextModal] = useState(false)

  // fetchSuggestions の結果反映 (sync/async どちらでも)
  useEffect(() => {
    let cancelled = false

    if (input.length < minChars) {
      setSuggestions([])
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.resolve(props.fetchSuggestions(input))
      .then((result) => {
        if (cancelled) return
        // 既選択 item を候補から除外
        const selectedKeys = new Set(props.selected.map(props.getKey))
        const filtered = result.filter((s) => !selectedKeys.has(props.getKey(s)))
        setSuggestions(filtered)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[MultiSelectAutocomplete] fetchSuggestions', err)
        setSuggestions([])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [input, props.selected, minChars, props])

  const handleSelectItem = (item: T) => {
    props.onChange([...props.selected, item])
    setInput('') // 入力欄 clear、autocomplete は閉じない (連続選択モード)
  }

  const handleRemoveItem = (item: T) => {
    const key = props.getKey(item)
    props.onChange(props.selected.filter((s) => props.getKey(s) !== key))
  }

  const handleFreeTextConfirm = () => {
    const text = input.trim()
    if (text === '') return
    props.onFreeText?.(text)
    setInput('')
    setShowFreeTextModal(false)
  }

  const showSuggestList = input.length >= minChars
  const showFreeTextButton =
    props.freeTextEnabled === true &&
    showSuggestList &&
    !loading &&
    suggestions.length === 0 &&
    input.trim().length >= minChars
  const overSoftLimit = props.selected.length >= softLimit

  return (
    <View>
      {/* 選択済 chips */}
      {props.selected.length > 0 && (
        <View style={styles.chipsRow}>
          {props.selected.map((item) => (
            <View key={props.getKey(item)} style={styles.chip}>
              <View style={styles.chipContent}>{props.renderChip(item)}</View>
              <Pressable
                onPress={() => handleRemoveItem(item)}
                hitSlop={8}
                style={styles.chipClear}
              >
                <Ionicons name="close" size={14} color={colors.textInverse} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* ソフト上限ヒント */}
      {overSoftLimit && (
        <Text style={styles.softLimitHint}>
          {props.softLimitHint ??
            `項目が多すぎると検索精度が落ちます (${props.selected.length} 件選択中)`}
        </Text>
      )}

      {/* 入力欄 */}
      <View style={styles.inputBar}>
        <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={props.placeholder}
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
          autoCapitalize="none"
          editable={!props.disabled}
          style={styles.input}
          clearButtonMode="while-editing"
        />
      </View>

      {/* 候補リスト */}
      {showSuggestList && (
        <View style={styles.suggestList}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : suggestions.length > 0 ? (
            // 注: 親 ScrollView との VirtualizedList nesting 警告回避のため
            //     FlatList ではなく ScrollView + map 実装。
            //     LIMIT 20 (master.ts 既定) で windowing 不要、β1 範囲では perf 問題なし。
            <ScrollView
              style={styles.suggestListInner}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {suggestions.map((item) => (
                <Pressable
                  key={props.getKey(item)}
                  onPress={() => handleSelectItem(item)}
                  style={({ pressed }) => [
                    styles.suggestItem,
                    pressed && styles.suggestItemPressed,
                  ]}
                >
                  {props.renderOption(item)}
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>該当なし</Text>
              {showFreeTextButton && (
                <Pressable
                  onPress={() => setShowFreeTextModal(true)}
                  style={({ pressed }) => [
                    styles.freeTextBtn,
                    pressed && styles.freeTextBtnPressed,
                  ]}
                >
                  <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                  <Text style={styles.freeTextBtnLabel}>
                    「{input.trim()}」をフリーテキストで追加
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {/* フリーテキスト確認モーダル */}
      <Modal
        visible={showFreeTextModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFreeTextModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {props.freeTextModalTitle ?? 'フリーテキストで追加'}
            </Text>
            <Text style={styles.modalBody}>
              {props.freeTextModalBody ??
                'マスタにあると検索でヒットしやすくなります。運営が確認次第、追加されます。'}
            </Text>
            <View style={styles.modalKeywordWrap}>
              <Text style={styles.modalKeyword}>「{input.trim()}」</Text>
            </View>
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setShowFreeTextModal(false)}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnCancel,
                  pressed && styles.modalBtnPressed,
                ]}
              >
                <Text style={styles.modalCancelLabel}>キャンセル</Text>
              </Pressable>
              <Pressable
                onPress={handleFreeTextConfirm}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  pressed && styles.modalBtnPressed,
                ]}
              >
                <Text style={styles.modalConfirmLabel}>追加する</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  // chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: 4,
  },
  chipContent: {
    // renderChip からの content をそのまま表示
  },
  chipClear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ソフト上限ヒント
  softLimitHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontStyle: 'italic',
  },
  // 入力欄
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.backgroundCard,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
  },
  // 候補リスト
  suggestList: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
  },
  suggestListInner: {
    maxHeight: 280,
  },
  loadingWrap: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  suggestItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestItemPressed: {
    backgroundColor: colors.backgroundMuted,
  },
  // 該当なし + フリーテキストボタン
  emptyState: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  freeTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  freeTextBtnPressed: {
    opacity: 0.7,
  },
  freeTextBtnLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  // モーダル
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalContent: {
    width: '100%',
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  modalBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  modalKeywordWrap: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
  },
  modalKeyword: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  modalBtnPressed: {
    opacity: 0.7,
  },
  modalBtnCancel: {
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnConfirm: {
    backgroundColor: colors.primary,
  },
  modalCancelLabel: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  modalConfirmLabel: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
  },
})
