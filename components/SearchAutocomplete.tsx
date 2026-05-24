// components/SearchAutocomplete.tsx
//
// 検索画面 (Phase 0.5b) 専用 autocomplete component。
// MSA (出品 form 用) との役割分離:
//   - キャラ + アイテムを 1 入力欄でセクション見出し型に表示
//   - freeTextEnabled=false 相当、代わりに「このまま検索 →」ボタンと Enter キーで
//     onSubmitFreeText を起動 (確定事項 R9: 役割統一)
//   - inputText を制御 props 化 (R10: Enter 確定後の保持を親で制御)
//   - softLimit 概念なし (検索では小数チップ前提)
//   - master ready 検知を内部で実施 (R14: search.tsx の props 肥大化回避)
//
// 設計判断:
//   - 選択チップは primary (navy) 一色 (キャラ/アイテム視覚区別はせず、見出しで分ける思想は候補側のみ)
//   - 候補チップは tagNeutral (slate) で控えめ、タップで primary 選択チップに昇格
//   - チップ × 削除: 親の onChange callback で配列から除外
//   - 連続選択モード: チップタップ → 入力欄クリア + 候補リスト維持 (MSA と同等)
//   - 重複防止: 既選択を candidates から filter
//   - master 未 ready 時: 候補セクション完全非表示、placeholder 「キーワードで検索」、入力欄のみ有効
//   - onSubmitFreeText は「ユーザーが意図的にフリーテキスト確定したシグナル」
//     (実装上は search.tsx の input ベース useEffect で既に fallback ライブ検索が走っているため
//      呼んでも追加効果は限定的だが、将来 user_keyword_history 記録 source='search_input' 等の拡張点として明示)

import { Ionicons } from '@expo/vector-icons'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import {
  getCharacterSuggestionsAcrossWorks,
  getItemTypeSuggestions,
  isMasterCacheReady,
} from '@/lib/master'
import type { MasterCharacter, MasterItemType } from '@/lib/types'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

export interface SearchAutocompleteProps {
  /** 選択中のキャラ master 配列 */
  selectedCharacters: MasterCharacter[]
  /** キャラ選択変更コールバック (追加・削除両方) */
  onChangeCharacters: (next: MasterCharacter[]) => void

  /** 選択中のアイテム種別 master 配列 */
  selectedItemTypes: MasterItemType[]
  /** アイテム種別選択変更コールバック */
  onChangeItemTypes: (next: MasterItemType[]) => void

  /** 入力欄テキスト (制御 props、親で state 管理) */
  inputText: string
  onChangeInputText: (text: string) => void

  /**
   * Enter キーまたは「『XXX』のまま検索 →」ボタン押下時に呼ばれる。
   * 「ユーザーが意図的にフリーテキスト確定したシグナル」として親側で活用する想定。
   */
  onSubmitFreeText: (text: string) => void

  /** 入力欄の placeholder。master 未 ready 時は内部で「キーワードで検索」に上書き */
  placeholder?: string
  /** 候補表示の最低入力文字数 (default 2) */
  minInputChars?: number
  /** キャラ候補の上限 (default 10) */
  characterLimit?: number
  /** アイテム種別候補の上限 (default 10) */
  itemTypeLimit?: number
}

export function SearchAutocomplete(props: SearchAutocompleteProps) {
  const minInputChars = props.minInputChars ?? 2
  const characterLimit = props.characterLimit ?? 10
  const itemTypeLimit = props.itemTypeLimit ?? 10

  // master ready を内部で reactive 化。
  // 起動時 isMasterCacheReady() = false の可能性に備え、100ms poll を最大 5 秒。
  const [masterReady, setMasterReady] = useState(() => isMasterCacheReady())
  useEffect(() => {
    if (masterReady) return
    const intervalId = setInterval(() => {
      if (isMasterCacheReady()) {
        setMasterReady(true)
        clearInterval(intervalId)
      }
    }, 100)
    const timeoutId = setTimeout(() => clearInterval(intervalId), 5000)
    return () => {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
    }
  }, [masterReady])

  // 候補計算 (sync、master cache 前提)
  const trimmedInput = props.inputText.trim()
  const showSuggest =
    masterReady && trimmedInput.length >= minInputChars

  const characterCandidates = useMemo<MasterCharacter[]>(() => {
    if (!showSuggest) return []
    const selectedIds = new Set(props.selectedCharacters.map((c) => c.id))
    return getCharacterSuggestionsAcrossWorks(trimmedInput, characterLimit).filter(
      (c) => !selectedIds.has(c.id),
    )
  }, [showSuggest, trimmedInput, props.selectedCharacters, characterLimit])

  const itemTypeCandidates = useMemo<MasterItemType[]>(() => {
    if (!showSuggest) return []
    const selectedIds = new Set(props.selectedItemTypes.map((t) => t.id))
    return getItemTypeSuggestions(trimmedInput, { limit: itemTypeLimit }).filter(
      (t) => !selectedIds.has(t.id),
    )
  }, [showSuggest, trimmedInput, props.selectedItemTypes, itemTypeLimit])

  const hasCandidates =
    characterCandidates.length > 0 || itemTypeCandidates.length > 0
  const showFreeTextFallback = showSuggest && !hasCandidates

  // ── handlers ──

  const handleSelectCharacter = (c: MasterCharacter) => {
    props.onChangeCharacters([...props.selectedCharacters, c])
    props.onChangeInputText('')
  }

  const handleRemoveCharacter = (c: MasterCharacter) => {
    props.onChangeCharacters(
      props.selectedCharacters.filter((x) => x.id !== c.id),
    )
  }

  const handleSelectItemType = (t: MasterItemType) => {
    props.onChangeItemTypes([...props.selectedItemTypes, t])
    props.onChangeInputText('')
  }

  const handleRemoveItemType = (t: MasterItemType) => {
    props.onChangeItemTypes(
      props.selectedItemTypes.filter((x) => x.id !== t.id),
    )
  }

  const handleSubmitFreeText = () => {
    const text = trimmedInput
    if (text === '') return
    props.onSubmitFreeText(text)
  }

  // ── render ──

  const effectivePlaceholder = masterReady
    ? props.placeholder ?? 'キャラ・アイテム名で検索'
    : 'キーワードで検索'

  const hasSelected =
    props.selectedCharacters.length > 0 || props.selectedItemTypes.length > 0

  return (
    <View style={styles.wrap}>
      {/* 選択チップ群 (キャラ + アイテム、横並び flexWrap) */}
      {hasSelected && (
        <View style={styles.selectedChipsRow}>
          {props.selectedCharacters.map((c) => (
            <View key={`char-${c.id}`} style={styles.selectedChip}>
              <Text style={styles.selectedChipLabel} numberOfLines={1}>
                {c.display_name_ja}
              </Text>
              <Pressable
                onPress={() => handleRemoveCharacter(c)}
                hitSlop={8}
                style={styles.selectedChipClear}
              >
                <Ionicons name="close" size={12} color={colors.textInverse} />
              </Pressable>
            </View>
          ))}
          {props.selectedItemTypes.map((t) => (
            <View key={`item-${t.id}`} style={styles.selectedChip}>
              <Text style={styles.selectedChipLabel} numberOfLines={1}>
                {t.display_name_ja}
              </Text>
              <Pressable
                onPress={() => handleRemoveItemType(t)}
                hitSlop={8}
                style={styles.selectedChipClear}
              >
                <Ionicons name="close" size={12} color={colors.textInverse} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* 入力欄 */}
      <View style={styles.inputBar}>
        <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
        <TextInput
          value={props.inputText}
          onChangeText={props.onChangeInputText}
          placeholder={effectivePlaceholder}
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={handleSubmitFreeText}
          style={styles.input}
          clearButtonMode="while-editing"
        />
      </View>

      {/* 候補 / 該当なし (master ready かつ minInputChars 以上のときのみ) */}
      {showSuggest && (
        <View style={styles.suggestList}>
          {characterCandidates.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>キャラ</Text>
              <View style={styles.candidateChipsRow}>
                {characterCandidates.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => handleSelectCharacter(c)}
                    style={({ pressed }) => [
                      styles.candidateChip,
                      pressed && styles.candidateChipPressed,
                    ]}
                  >
                    <Text style={styles.candidateChipLabel}>
                      {c.display_name_ja}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {itemTypeCandidates.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>アイテム</Text>
              <View style={styles.candidateChipsRow}>
                {itemTypeCandidates.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => handleSelectItemType(t)}
                    style={({ pressed }) => [
                      styles.candidateChip,
                      pressed && styles.candidateChipPressed,
                    ]}
                  >
                    <Text style={styles.candidateChipLabel}>
                      {t.display_name_ja}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {showFreeTextFallback && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>該当なし</Text>
              <Pressable
                onPress={handleSubmitFreeText}
                style={({ pressed }) => [
                  styles.freeTextBtn,
                  pressed && styles.freeTextBtnPressed,
                ]}
              >
                <Text style={styles.freeTextBtnLabel} numberOfLines={1}>
                  「{trimmedInput}」のまま検索
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={colors.primary}
                />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },

  // 選択チップ (primary 一色)
  selectedChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    paddingVertical: 4,
    maxWidth: 200,
  },
  selectedChipLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textInverse,
    flexShrink: 1,
  },
  selectedChipClear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
  },
  section: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  candidateChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  candidateChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.tagNeutralBorder,
    backgroundColor: colors.tagNeutralBg,
  },
  candidateChipPressed: {
    backgroundColor: colors.backgroundMuted,
    borderColor: colors.primary,
  },
  candidateChipLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.tagNeutralText,
  },

  // 該当なし + フリーテキストボタン
  emptyState: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  freeTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
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
    flexShrink: 1,
  },
})
