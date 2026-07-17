// components/WantSuggestInput.tsx
//
// 求リスト追加モーダル (app/wants.tsx) 専用の suggestion 入力コンポーネント。
//
// 設計方針:
//   - 検索画面の SearchAutocomplete とは別物 (multi-select chip vs single-row fill の UX 差)
//   - lib/master.ts の low-level API (getUnifiedSearchSuggestions /
//     getSearchSuggestionTypeLabel / getSearchSuggestionSubLabel) は流用
//   - 候補 tap で親に SearchSuggestion を渡す。親が form field を auto-fill する
//   - 候補 tap 後は入力欄をクリアして連続選択を可能にする (SearchAutocomplete と同じ)
//   - 自由テキスト編集は親モーダルの既存フォームで完結 (本コンポーネントは suggestion 専用)
//   - master ready のポーリングは内部で実施 (起動直後の race を吸収、5 秒で timeout)
//
// SearchAutocomplete (components/SearchAutocomplete.tsx) は touch しない (検索画面挙動温存)。

import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import {
  getSearchSuggestionSubLabel,
  getUnifiedSearchSuggestions,
  isMasterCacheReady,
  type SearchSuggestion,
} from '@/lib/master'
import { Ionicons } from '@expo/vector-icons'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

export interface WantSuggestInputProps {
  /** 入力欄の制御値 (親 state 管理) */
  value: string
  onChangeValue: (text: string) => void

  /** 候補 tap 時のコールバック。親が SearchSuggestion から form field を auto-fill する */
  onSelectSuggestion: (s: SearchSuggestion) => void

  /** placeholder。master 未 ready 時は内部で「キーワードを入力」に上書き */
  placeholder?: string
  /** 候補表示の最低入力文字数 (default 2) */
  minInputChars?: number
  /** 候補上限 (default 15) */
  suggestionLimit?: number
}

export function WantSuggestInput(props: WantSuggestInputProps) {
  const minInputChars = props.minInputChars ?? 2
  const suggestionLimit = props.suggestionLimit ?? 15

  // master ready の reactive 検知 (SearchAutocomplete と同パターン、100ms poll / 5s timeout)
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

  const trimmedInput = props.value.trim()
  const showSuggest = masterReady && trimmedInput.length >= minInputChars

  const candidates = useMemo<SearchSuggestion[]>(() => {
    if (!showSuggest) return []
    return getUnifiedSearchSuggestions(trimmedInput, suggestionLimit)
  }, [showSuggest, trimmedInput, suggestionLimit])

  const hasCandidates = candidates.length > 0
  const showFreeTextHint = showSuggest && !hasCandidates

  const handleSelect = (s: SearchSuggestion) => {
    props.onSelectSuggestion(s)
    // 連続選択のため入力欄クリア (例: character → item_type を続けて選ぶ)
    props.onChangeValue('')
  }

  const effectivePlaceholder = masterReady
    ? props.placeholder ?? 'グループ・作品・メンバー/キャラ・グッズ種別で検索'
    : 'キーワードを入力'

  return (
    <View style={styles.wrap}>
      {/* 入力欄 */}
      <View style={styles.inputBar}>
        <Ionicons name="search-outline" size={18} color={colors.textTertiary} />
        <TextInput
          value={props.value}
          onChangeText={props.onChangeValue}
          placeholder={effectivePlaceholder}
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.input}
          clearButtonMode="while-editing"
        />
      </View>

      {/* 候補 / 該当なし */}
      {showSuggest && (
        <View style={styles.suggestList}>
          {hasCandidates &&
            candidates.map((s) => (
              <Pressable
                key={`${s.type}-${s.data.id}`}
                onPress={() => handleSelect(s)}
                style={({ pressed }) => [
                  styles.candidateRow,
                  pressed && styles.candidateRowPressed,
                ]}
              >
                <Text style={styles.candidateName} numberOfLines={1}>
                  {s.data.display_name_ja}
                </Text>
                <Text style={styles.candidateSubLabel} numberOfLines={1}>
                  {getSearchSuggestionSubLabel(s)}
                </Text>
              </Pressable>
            ))}

          {showFreeTextHint && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                該当する候補がありません。下のフォームに自由入力でも追加できます。
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
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
  suggestList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    overflow: 'hidden',
    maxHeight: 260,
  },
  candidateRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  candidateRowPressed: {
    backgroundColor: colors.backgroundMuted,
  },
  candidateName: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  candidateSubLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  emptyState: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
})
