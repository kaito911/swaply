// components/listing/section/WantMasterSection.tsx
//
// PR-1a: single-page (単品出品) の求入力を master 構造化する section。
//
// 設計方針 (道2 / 6-6 メモ上書き後の新方針):
//   - 求は「出品時に毎回 master サジェスト入力」。cards.want_works[] / want_characters[] /
//     want_item_types[] を正とする (wanted_cards + card_wanted_links は使わない)。
//   - 新規 primitive は作らず、譲側の既存 section を流用:
//       求グループ  = WorkSection      ({workId, category} を返す)
//       求メンバー  = CharactersSection (workId スコープで master_characters を絞る・複数可)
//       求グッズ種別 = ItemsSection      (種別は work 非依存・任意)
//   - 「譲と同シリーズのグッズを求む」チェック: ON で求 work = 譲 work_id を流用し、
//     求メンバーは【譲グループ (work_id)】基準で絞る (譲メンバー基準ではない = コンプ狙い成立)。
//
// bulk.tsx はこの component を使わない (従来 WantSection のまま)。PR-1b で別途移行。
//
// 内部 state について:
//   WorkSection / CharactersSection は mount 時に value から hydrate し、以降は内部 state を
//   source of truth とする (親 value 変更に自動追従しない) 設計。そのため求 work が変わる場面
//   (同シリーズ toggle / 求グループ変更 / 譲 work 追従) では CharactersSection を key で remount し、
//   同時に親 value.characters を [] にリセットして roster 齟齬を防ぐ。

import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { getItemTypeById, getMemberLabel, getWorkById } from '@/lib/master'
import { Ionicons } from '@expo/vector-icons'
import React, { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { CharactersSection } from './CharactersSection'
import { ItemsSection } from './ItemsSection'
import { WorkSection } from './WorkSection'
import type { WantMasterValue, WorkSectionValue } from './types'

export type WantMasterSectionProps = {
  value: WantMasterValue
  onChange: (next: WantMasterValue) => void
  /** キーワード履歴記録用。未認証 (null) の場合は記録スキップ */
  userId: string | null
  /** 譲の作品/グループ (「同シリーズ」流用元)。譲未選択なら null */
  offerWork: WorkSectionValue
  /**
   * 譲のグッズ種別 (master ID 配列)。「同シリーズ」ON 時に want_item_types へ流用する。
   * 同シリーズ = 同作品・同種別で他メンバーを集める (コンプ狙い) 用途のため。
   */
  offerItemTypes: string[]
  /**
   * 「同シリーズ」ON 時の求グッズ種別ロック表示の上書きラベル (任意)。
   * bulk のように「譲種別が出品ごとに異なり単一値を持てない」文脈で
   * 「各グッズと同じ種別」等の汎用文言を出すために使う。
   * 未指定時は offerItemTypes の名前 (single-page の従来挙動) を表示する。
   */
  sameSeriesItemTypeLabel?: string
}

export function WantMasterSection({
  value,
  onChange,
  userId,
  offerWork,
  offerItemTypes,
  sameSeriesItemTypeLabel,
}: WantMasterSectionProps) {
  const sameSeries = value.sameSeriesAsOffer
  const offerWorkId = offerWork?.workId ?? ''
  const hasOfferWork = offerWorkId !== ''

  // 求メンバーを絞る実効 work_id:
  //   同シリーズ ON → 譲 work_id / OFF → 求グループで選んだ work_id
  const effectiveWorkId = sameSeries ? offerWorkId : value.works[0] ?? ''

  // 同シリーズ ON 中に譲 work / 譲種別が変わったら求 works・itemTypes を追従。
  // work が変わった場合のみ characters をリセット (別 roster)。
  // work と itemTypes を 1 回の onChange でまとめて更新し、二重 effect による
  // stale closure 上書きを避ける。guard (差分あり時のみ発火) で反復ループを防ぐ。
  useEffect(() => {
    if (!sameSeries) return
    const desiredWorks = hasOfferWork ? [offerWorkId] : []
    const workChanged = (value.works[0] ?? '') !== (desiredWorks[0] ?? '')
    const itemsSame =
      value.itemTypes.length === offerItemTypes.length &&
      value.itemTypes.every((v, i) => v === offerItemTypes[i])
    if (workChanged || !itemsSame) {
      onChange({
        ...value,
        works: desiredWorks,
        characters: workChanged ? [] : value.characters,
        itemTypes: offerItemTypes,
      })
    }
    // value/onChange は guard 済のため依存に含めない (含めると余計な再実行)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameSeries, offerWorkId, offerItemTypes])

  const handleToggleSameSeries = () => {
    if (!hasOfferWork && !sameSeries) return // 譲 work 未選択時は ON にできない
    if (!sameSeries) {
      // ON: 求 work = 譲 work、求種別 = 譲種別を流用、求メンバーはリセット
      //     (譲グループ基準で選び直す = コンプ狙い)。
      onChange({
        ...value,
        sameSeriesAsOffer: true,
        works: hasOfferWork ? [offerWorkId] : [],
        characters: [],
        itemTypes: offerItemTypes,
      })
    } else {
      // OFF: 求 work / 求メンバー / 求種別をクリア (独立選択に戻す)
      onChange({
        ...value,
        sameSeriesAsOffer: false,
        works: [],
        characters: [],
        itemTypes: [],
      })
    }
  }

  // 求グループ (WorkSection) の controlled value を works[0] から復元。
  // free text want work の category は round-trip で失われ得るが (want_works は id のみ保存)、
  // 表示用の再選択で足りるため other 既定で許容。
  const wantWorkValue: WorkSectionValue =
    value.works.length > 0
      ? {
          workId: value.works[0],
          category: getWorkById(value.works[0])?.category ?? 'other',
        }
      : null

  const handleWantWorkChange = (wv: WorkSectionValue) => {
    const nextWorkId = wv?.workId ?? ''
    const workChanged = nextWorkId !== (value.works[0] ?? '')
    onChange({
      ...value,
      works: wv != null ? [wv.workId] : [],
      // 求グループが変わったら求メンバーをリセット (別 roster)
      characters: workChanged ? [] : value.characters,
    })
  }

  const handleCharactersChange = (next: string[]) => {
    onChange({ ...value, characters: next })
  }

  const handleItemTypesChange = (next: string[]) => {
    onChange({ ...value, itemTypes: next })
  }

  const effectiveCategory = getWorkById(effectiveWorkId)?.category ?? null
  const memberLabel = getMemberLabel(effectiveCategory)
  const offerWorkName = hasOfferWork
    ? getWorkById(offerWorkId)?.display_name_ja ?? offerWorkId
    : ''
  const offerItemTypeNames = offerItemTypes
    .map((id) => getItemTypeById(id)?.display_name_ja ?? id)
    .join('・')

  return (
    <View style={styles.wrap}>
      {/* 「譲と同シリーズ」チェック */}
      <Pressable
        onPress={handleToggleSameSeries}
        disabled={!hasOfferWork && !sameSeries}
        style={({ pressed }) => [
          styles.checkRow,
          pressed && styles.checkRowPressed,
          !hasOfferWork && !sameSeries && styles.checkRowDisabled,
        ]}
      >
        <View style={[styles.checkbox, sameSeries && styles.checkboxOn]}>
          {sameSeries && (
            <Ionicons name="checkmark" size={14} color={colors.textInverse} />
          )}
        </View>
        <View style={styles.checkTextWrap}>
          <Text style={styles.checkLabel}>譲と同シリーズのグッズを求む</Text>
          <Text style={styles.checkSub}>
            {hasOfferWork
              ? `ON で「${offerWorkName}」を求グループに使います`
              : '先に「作品 / グループ」を選ぶと使えます'}
          </Text>
        </View>
      </Pressable>

      {/* 求グループ (同シリーズ OFF 時のみ手動選択) */}
      {sameSeries ? (
        <View style={styles.lockedGroup}>
          <Text style={styles.fieldLabel}>求グループ</Text>
          <View style={styles.lockedGroupCard}>
            <Ionicons name="link-outline" size={16} color={colors.primary} />
            <Text style={styles.lockedGroupName}>
              {offerWorkName !== '' ? offerWorkName : '譲の作品と同じ'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>求グループ *</Text>
          <WorkSection value={wantWorkValue} onChange={handleWantWorkChange} />
        </View>
      )}

      {/* 求メンバー (求グループの work_id で絞る・必須・複数可) */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>求{memberLabel} *</Text>
        {effectiveWorkId === '' ? (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>
              先に求グループを選ぶと{memberLabel}を選べます
            </Text>
          </View>
        ) : (
          <CharactersSection
            // work が変わったら remount して roster を差し替える
            key={`want-chars-${effectiveWorkId}`}
            value={value.characters}
            onChange={handleCharactersChange}
            workId={effectiveWorkId}
            userId={userId}
          />
        )}
      </View>

      {/* 求グッズ種別: 同シリーズ ON は譲種別を流用しロック表示、OFF は任意入力 */}
      {sameSeries ? (
        <View style={styles.lockedGroup}>
          <Text style={styles.fieldLabel}>求グッズ種別</Text>
          <View style={styles.lockedGroupCard}>
            <Ionicons name="link-outline" size={16} color={colors.primary} />
            <Text style={styles.lockedGroupName}>
              {sameSeriesItemTypeLabel ??
                (offerItemTypeNames !== '' ? offerItemTypeNames : '譲と同じ種別')}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>求グッズ種別（任意）</Text>
          <ItemsSection
            value={value.itemTypes}
            onChange={handleItemTypesChange}
            userId={userId}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  checkRowPressed: { opacity: 0.7 },
  checkRowDisabled: { opacity: 0.5 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  checkLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  checkSub: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  field: { gap: spacing.sm },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  lockedGroup: { gap: spacing.sm },
  lockedGroupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.backgroundMuted,
  },
  lockedGroupName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  hintBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  hintText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
})
