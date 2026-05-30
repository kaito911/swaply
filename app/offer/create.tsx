// app/offer/create.tsx
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PrimaryCTA } from '@/components/PrimaryCTA'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import {
  MAX_PROPOSER_CARDS_PER_OFFER,
  createOffer,
  fetchCard,
  fetchMyWantedCards,
  fetchUserCards,
} from '@/lib/supabase'
import { Card, WantedCard, WantMatchScore } from '@/lib/types'
import { scoreWantMatchV2 } from '@/lib/matcher' // ★ Step 3 commit 3: v1 → v2 切替
import { useAuthContext } from '@/providers/AuthProvider'

type AdjustmentPayer = 'proposer' | 'receiver'

function shippingLabel(card: Card): string {
  if (card.allows_mail && card.allows_handoff) return '郵送可・手渡し可'
  if (card.allows_mail) return '郵送可・手渡し不可'
  if (card.allows_handoff) return '郵送不可・手渡し可'
  return '郵送不可・手渡し不可'
}

function adjustmentLabel(card: Card): string {
  if (!card.allows_adjustment) return '調整金なし'
  if (card.adjustment_max != null) {
    return `調整金あり（上限 ¥${card.adjustment_max.toLocaleString()}）`
  }
  return '調整金あり（上限未設定）'
}

// ─────────────────────────────────────────
// 自分カードと相手の want_description の軽い関連スコア
// 自由記述のため厳密な意味解析はせず、部分一致チェックのみ
// ─────────────────────────────────────────

function wantMatchScore(card: Card, wantDesc: string): number {
  const lower = wantDesc.toLowerCase()
  let score = 0

  // name: 最重要（固有名詞一致が最も確実）
  if (lower.includes(card.name.toLowerCase())) score += 3

  // member_name: 次点（メンバー名一致は実用的）
  if (card.member_name != null && lower.includes(card.member_name.toLowerCase())) score += 2

  // group_name: グループ一致
  if (card.group_name != null && lower.includes(card.group_name.toLowerCase())) score += 2

  // series: 補助
  if (card.series != null && lower.includes(card.series.toLowerCase())) score += 1

  return score
}

// スコア降順でソート。want_description が null/空なら元の順序を維持。
function sortMyCardsByRelevance(cards: Card[], wantDesc: string | null): Card[] {
  if (wantDesc == null || wantDesc.trim() === '') return cards
  return [...cards].sort(
    (a, b) => wantMatchScore(b, wantDesc) - wantMatchScore(a, wantDesc)
  )
}

// 「求に近い」ラベル表示判定
function isNearWant(card: Card, wantDesc: string | null): boolean {
  if (wantDesc == null || wantDesc.trim() === '') return false
  return wantMatchScore(card, wantDesc) > 0
}

// ★ added: WantMatchScore → 表示文言（none は null）
function getMatchReasonLabel(score: WantMatchScore): string | null {
  if (score === 'strong') return 'あなたの求と一致'
  if (score === 'medium') return '同メンバーで交換しやすい'
  if (score === 'weak') return 'あなたの求に近い'
  return null
}

type HintLevel = 'strong' | 'medium' | 'weak'

// ★ updated: 相手視点（自分のカードが相手のwantに刺さるか）
// β1 複数枚提案対応: 選択中の myCards 全体で最良 score の組み合わせを表示。
function getHint(
  myCards: Card[],
  targetWants: WantedCard[],
): { level: HintLevel; text: string } | null {
  if (myCards.length === 0) return null
  if (targetWants.length === 0) return null

  let bestWant: WantedCard = targetWants[0]
  let bestMatch: WantMatchScore = 'none'

  for (const myCard of myCards) {
    for (const want of targetWants) {
      const s = scoreWantMatchV2(myCard, want)
      if (s === 'strong') {
        bestWant = want
        return { level: 'strong', text: '💡 相手の求と一致しています' }
      }
      // strong は上で早期 return 済のため、ここでは medium / weak のみ考慮
      if (s === 'medium' && bestMatch !== 'medium') {
        bestWant = want
        bestMatch = 'medium'
      } else if (s === 'weak' && bestMatch === 'none') {
        bestWant = want
        bestMatch = 'weak'
      }
    }
  }

  if (bestMatch === 'medium') {
    return { level: 'medium', text: '💡 相手の求に近いカードです' }
  }

  // weak / none — bestWant の group_name + member_name を具体表示
  const parts = [bestWant.group_name, bestWant.member_name]
    .filter((v): v is string => v != null && v !== '')
    .join(' ')
  if (parts !== '') {
    return { level: 'weak', text: `💡 相手の求：${parts}` }
  }
  return null
}

// ─────────────────────────────────────────

export default function OfferCreateScreen() {
  const { user } = useAuthContext()
  const { cardId, myCardId } = useLocalSearchParams<{ cardId?: string | string[]; myCardId?: string | string[] }>()

  const [targetCard, setTargetCard] = useState<Card | null>(null)
  const [myCards, setMyCards] = useState<Card[]>([])
  // β1 複数枚提案: 1〜5 枚選択可、順序は selectedMyCardIds で保持。
  const [selectedMyCardIds, setSelectedMyCardIds] = useState<string[]>([])

  const [showDiff, setShowDiff] = useState(false)
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentPayer, setAdjustmentPayer] = useState<AdjustmentPayer>('proposer')
  const [chkDiff, setChkDiff] = useState(false)

  const [showMessage, setShowMessage] = useState(false)
  const [message, setMessage] = useState('')

  const [chkTerms, setChkTerms] = useState(false)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  // ★ added: targetCard と自分の wants の一致スコア
  const [bestMatchScore, setBestMatchScore] = useState<WantMatchScore>('none')
  const [myWants, setMyWants] = useState<WantedCard[]>([])
  const [targetWants, setTargetWants] = useState<WantedCard[]>([]) // ★ updated

  const userId = user?.id ?? null

  const resolvedCardId = useMemo(() => {
    if (Array.isArray(cardId)) return cardId[0] ?? null
    return cardId ?? null
  }, [cardId])

  const resolvedMyCardId = useMemo(() => {
    if (Array.isArray(myCardId)) return myCardId[0] ?? null
    return myCardId ?? null
  }, [myCardId])

  // selectedMyCardIds に沿った Card 配列 (順序保持)
  const selectedMyCards = useMemo(() => {
    const map = new Map(myCards.map((c) => [c.id, c]))
    const result: Card[] = []
    for (const id of selectedMyCardIds) {
      const found = map.get(id)
      if (found != null) result.push(found)
    }
    return result
  }, [myCards, selectedMyCardIds])

  const isOwnTarget = useMemo(() => {
    if (targetCard == null || userId == null) return false
    return targetCard.owner_user_id === userId
  }, [targetCard, userId])

  const targetIsActive = targetCard?.status === 'active'

  const canSend =
    !isOwnTarget &&
    targetIsActive &&
    selectedMyCards.length > 0 &&
    chkTerms &&
    (!showDiff || chkDiff) &&
    !submitting

  // 単一カード tap → 選択/解除 toggle、5 枚到達済で追加しようとしたら Alert。
  const toggleMyCardSelection = (cardId: string) => {
    setSelectedMyCardIds((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId)
      }
      if (prev.length >= MAX_PROPOSER_CARDS_PER_OFFER) {
        Alert.alert(
          '選択枚数の上限です',
          `最大${MAX_PROPOSER_CARDS_PER_OFFER}枚まで選択できます`
        )
        return prev
      }
      return [...prev, cardId]
    })
  }

  useEffect(() => {
    let mounted = true

    const load = async () => {
      if (userId == null) {
        if (mounted) {
          setScreenError('ログイン情報が確認できません')
          setLoading(false)
        }
        return
      }

      if (resolvedCardId == null) {
        if (mounted) {
          setScreenError('交換対象の出品IDが見つかりません')
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)
        setScreenError(null)

        // ★ updated: target を先取得 → owner_user_id 確定後に残りを並列fetch
        const target = await fetchCard(resolvedCardId)

        if (!mounted) return

        if (target == null) {
          setScreenError('交換対象の出品が見つかりません')
          setLoading(false)
          return
        }

        if (target.owner_user_id == null) {
          setScreenError('出品者情報が不正です')
          setLoading(false)
          return
        }

        const [mine, fetchedMyWants, fetchedTargetWants] = await Promise.all([
          fetchUserCards(userId, 'active'),
          fetchMyWantedCards(userId),
          fetchMyWantedCards(target.owner_user_id), // ★ updated: 相手のwant
        ])

        if (!mounted) return

        const filteredMine = mine.filter((c) => c.id !== resolvedCardId && c.image_url != null)

        // ★ updated: 相手視点でソート（targetWantsに刺さる順）、同順位内は want_description スコアを維持
        const wantScoreRank: Record<WantMatchScore, number> = { strong: 3, medium: 2, weak: 1, none: 0 }
        const sortedMine = [...filteredMine].sort((a, b) => {
          const getBestRank = (card: Card): number =>
            wantScoreRank[fetchedTargetWants.reduce<WantMatchScore>((best, want) => {
              const s = scoreWantMatchV2(card, want)
              if (s === 'strong') return 'strong'
              if (s === 'medium' && best !== 'strong') return 'medium'
              if (s === 'weak' && best === 'none') return 'weak'
              return best
            }, 'none')]
          const rankDiff = getBestRank(b) - getBestRank(a)
          if (rankDiff !== 0) return rankDiff
          // 同順位内: 既存の want_description スコアをタイブレーカーに使用
          const wantDesc = target.want_description
          if (wantDesc == null || wantDesc.trim() === '') return 0
          return wantMatchScore(b, wantDesc) - wantMatchScore(a, wantDesc)
        })

        // ★ added: 同一カード(name + member_name + series)で重複排除し、最大10件に制限
        const seenKeys = new Set<string>()
        const displayedMine: Card[] = []
        for (const c of sortedMine) {
          const key = `${c.name} ${c.member_name ?? ''} ${c.series ?? ''}`
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          displayedMine.push(c)
          if (displayedMine.length >= 10) break
        }

        setTargetCard(target)
        setMyCards(displayedMine)

        // ★ added: targetCard と自分の WantedCards の一致スコアを算出
        const best = fetchedMyWants.reduce<WantMatchScore>((acc, want) => {
          const s = scoreWantMatchV2(target, want)
          if (s === 'strong') return 'strong'
          if (s === 'medium' && acc !== 'strong') return 'medium'
          if (s === 'weak' && acc === 'none') return 'weak'
          return acc
        }, 'none')
        setBestMatchScore(best)
        setMyWants(fetchedMyWants)
        setTargetWants(fetchedTargetWants) // ★ updated

        if (displayedMine.length > 0) {
          setSelectedMyCardIds((prev) => {
            // 既存の選択 (再フォーカス等) で displayedMine 内に残っているものは維持
            const validPrev = prev.filter((id) => displayedMine.some((c) => c.id === id))
            if (validPrev.length > 0) return validPrev
            // ①レーンから myCardId が渡された場合、アクティブ一覧内にあれば優先選択
            if (resolvedMyCardId != null && displayedMine.some((c) => c.id === resolvedMyCardId)) {
              return [resolvedMyCardId]
            }
            return [displayedMine[0].id]
          })
        } else {
          setSelectedMyCardIds([])
        }
      } catch (error) {
        console.error('[OfferCreateScreen][load]', error)
        if (mounted) {
          setScreenError('交換提案画面の読み込みに失敗しました')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [resolvedCardId, resolvedMyCardId, userId])

  const handleSubmit = async () => {
    if (userId == null || targetCard == null || targetCard.owner_user_id == null) return
    if (isOwnTarget) {
      Alert.alert('エラー', '自分の出品には提案できません')
      return
    }
    if (!targetIsActive) {
      Alert.alert('エラー', 'この出品は現在交換提案できません')
      return
    }
    if (selectedMyCards.length === 0) {
      Alert.alert('エラー', '交換に出すカードを1枚以上選んでください')
      return
    }
    if (selectedMyCards.length > MAX_PROPOSER_CARDS_PER_OFFER) {
      Alert.alert(
        'エラー',
        `交換に出すカードは最大${MAX_PROPOSER_CARDS_PER_OFFER}枚までです`
      )
      return
    }

    const rawAmount =
      showDiff && adjustmentAmount.trim().length > 0
        ? Number(adjustmentAmount.replace(/[^\d]/g, ''))
        : null

    if (rawAmount !== null && Number.isNaN(rawAmount)) {
      Alert.alert('入力エラー', '調整金は数字で入力してください')
      return
    }

    if (
      targetCard.allows_adjustment &&
      targetCard.adjustment_max != null &&
      rawAmount != null &&
      rawAmount > targetCard.adjustment_max
    ) {
      Alert.alert(
        '入力エラー',
        `調整金は上限 ¥${targetCard.adjustment_max.toLocaleString()} までです`
      )
      return
    }

    // 提案者支払 → 負、受信者支払 → 正（counter.tsx と同じ符号規約）
    const parsedAdjustment: number | null =
      rawAmount == null || rawAmount === 0
        ? null
        : adjustmentPayer === 'proposer'
        ? -rawAmount
        : rawAmount

    try {
      setSubmitting(true)

      await createOffer({
        proposerId: userId,
        receiverId: targetCard.owner_user_id,
        proposerCardIds: selectedMyCards.map((c) => c.id),
        receiverCardId: targetCard.id,
        adjustmentAmount: parsedAdjustment,
        // TODO: adjustmentPayer（UI実装済み。createOffer API拡張後に接続）
        message: message.trim().length > 0 ? message.trim() : null,
      })

      setShowSuccess(true)
    } catch (error) {
      console.error('[OfferCreateScreen][handleSubmit]', error)
      Alert.alert('エラー', '交換提案の送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  // PrimaryCTA タップ時に呼ばれる。軽い確認を1ステップ挟み、
  // 「送信する」を選んだ場合のみ handleSubmit を実行する。
  const handleConfirmAndSubmit = () => {
    Alert.alert(
      'この内容で送信しますか？',
      '相手が承認すると交換が成立します',
      [
        { text: '戻る', style: 'cancel' },
        { text: '送信する', onPress: handleSubmit },
      ]
    )
  }

  // ── Loading ──────────────────────────────
  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  // ── Error ────────────────────────────────
  if (screenError != null || resolvedCardId == null || targetCard == null) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.errorTitle}>
          {screenError ?? '交換対象の出品が見つかりません'}
        </Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>戻る</Text>
        </Pressable>
      </View>
    )
  }

  // ── Success ──────────────────────────────
  if (showSuccess) {
    const handle = targetCard.owner?.handle ?? null
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.successWrap}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>提案を送りました！</Text>
          {handle != null && (
            <Text style={styles.successSub}>@{handle} の返答を待っています</Text>
          )}
          <PrimaryCTA
            label="ホームに戻る"
            onPress={() => router.replace('/(tabs)/home' as never)}
            size="lg"
            style={styles.successCta}
          />
        </View>
      </SafeAreaView>
    )
  }

  // ── Main ─────────────────────────────────
  const owner = targetCard.owner ?? null
  const wantDesc = targetCard.want_description

  // ★ added: CTA直上ラベル文言（none のとき null）
  const matchReasonLabel = getMatchReasonLabel(bestMatchScore)
  const hint = getHint(selectedMyCards, targetWants)
  const selectedCount = selectedMyCards.length
  const primarySelected = selectedMyCards[0] ?? null
  const extraSelectedCount = Math.max(selectedCount - 1, 0)

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 交換内容の確認 ── */}
        <View style={styles.sectionLabelRow}>
          <Text style={styles.sectionLabel}>交換内容の確認</Text>
        </View>

        {/* ExchangeRow */}
        <View style={styles.exchangeRow}>
          {/* Left: target card */}
          <View style={styles.targetCol}>
            <Text style={styles.targetColLabel}>欲しいカード</Text>
            <View style={styles.targetImageWrap}>
              {targetCard.image_url != null ? (
                <Image
                  source={{ uri: targetCard.image_url }}
                  style={styles.targetImage}
                />
              ) : (
                <View style={[styles.targetImage, styles.imagePlaceholder]}>
                  <Ionicons name="image-outline" size={24} color={colors.textTertiary} />
                </View>
              )}
            </View>
            <Text style={styles.targetName} numberOfLines={2}>
              {targetCard.name}
            </Text>
            <View style={styles.conditionList}>
              <View style={styles.conditionRow}>
                <Ionicons name="send-outline" size={11} color={colors.textSecondary} />
                <Text style={styles.conditionText}>{shippingLabel(targetCard)}</Text>
              </View>
              <View style={styles.conditionRow}>
                <Ionicons
                  name={targetCard.allows_adjustment ? 'cash-outline' : 'remove-outline'}
                  size={11}
                  color={
                    targetCard.allows_adjustment ? colors.trustGreen : colors.textTertiary
                  }
                />
                <Text
                  style={[
                    styles.conditionText,
                    !targetCard.allows_adjustment && styles.conditionTextMuted,
                  ]}
                >
                  {adjustmentLabel(targetCard)}
                </Text>
              </View>
            </View>

            {/* 相手の求 — 何を欲しがっているかを明示 */}
            {wantDesc != null && (
              <View style={styles.wantDescRow}>
                <Text style={styles.wantDescLabel}>求</Text>
                <Text style={styles.wantDescValue} numberOfLines={3}>
                  {wantDesc}
                </Text>
              </View>
            )}

            {/* Owner Trust（成立数・発送率） */}
            {owner != null && (
              <View style={styles.ownerStats}>
                <View style={styles.ownerStatItem}>
                  <Text style={styles.ownerStatValue}>{owner.trade_count}</Text>
                  <Text style={styles.ownerStatLabel}>成立</Text>
                </View>
                <View style={styles.ownerStatDivider} />
                <View style={styles.ownerStatItem}>
                  <Text
                    style={[
                      styles.ownerStatValue,
                      owner.ship_rate >= 95
                        ? styles.ownerStatValueGreen
                        : owner.ship_rate < 90
                        ? styles.ownerStatValueWarn
                        : null,
                    ]}
                  >
                    {owner.ship_rate}%
                  </Text>
                  <Text style={styles.ownerStatLabel}>発送率</Text>
                </View>
              </View>
            )}
          </View>

          {/* Center: ⇄ */}
          <View style={styles.arrowCol}>
            <View style={styles.arrowCircle}>
              <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
            </View>
          </View>

          {/* Right: my card picker (β1 複数枚対応: 1〜5 枚 toggle) */}
          <View style={styles.myPickerCol}>
            <Text style={styles.myColLabel}>あなたが出すカード</Text>

            {isOwnTarget ? (
              <View style={styles.emptyPickerBox}>
                <Text style={styles.emptyPickerText}>自分の出品には{'\n'}提案できません</Text>
              </View>
            ) : myCards.length === 0 ? (
              <View style={styles.emptyPickerBox}>
                <Text style={styles.emptyPickerText}>出品中のカードが{'\n'}ありません</Text>
              </View>
            ) : (
              <>
                <Text style={styles.selectedLabel}>
                  選択中：{selectedCount}枚（最大{MAX_PROPOSER_CARDS_PER_OFFER}）
                </Text>

                {myCards.map((card) => {
                  const isSelected = selectedMyCardIds.includes(card.id)
                  return (
                    <Pressable
                      key={card.id}
                      style={[
                        styles.pickerItem,
                        isSelected && styles.pickerItemSelected,
                      ]}
                      onPress={() => toggleMyCardSelection(card.id)}
                    >
                      {card.image_url != null ? (
                        <Image
                          source={{ uri: card.image_url }}
                          style={styles.pickerThumb}
                        />
                      ) : (
                        <View style={[styles.pickerThumb, styles.imagePlaceholder]}>
                          <Ionicons
                            name="image-outline"
                            size={12}
                            color={colors.textTertiary}
                          />
                        </View>
                      )}
                      <View style={styles.pickerMeta}>
                        <Text
                          style={[
                            styles.pickerName,
                            isSelected && styles.pickerNameSelected,
                          ]}
                          numberOfLines={2}
                        >
                          {card.name}
                        </Text>
                        {isNearWant(card, wantDesc) && (
                          <View style={styles.nearWantBadge}>
                            <Text style={styles.nearWantBadgeText}>求に近い</Text>
                          </View>
                        )}
                      </View>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                        color={isSelected ? colors.primary : colors.border}
                      />
                    </Pressable>
                  )
                })}
              </>
            )}
          </View>
        </View>

        {/* ── 調整金（任意） ── */}
        <View style={styles.section}>
          <Pressable
            style={styles.toggleRow}
            onPress={() => {
              setShowDiff((prev) => {
                if (prev) {
                  setAdjustmentAmount('')
                  setChkDiff(false)
                }
                return !prev
              })
            }}
          >
            <Ionicons
              name={showDiff ? 'remove-circle-outline' : 'add-circle-outline'}
              size={18}
              color={colors.primary}
            />
            <Text style={styles.toggleLabel}>
              {showDiff ? '調整金を取り消す' : '調整金を提案する（任意）'}
            </Text>
          </Pressable>

          {showDiff && (
            <>
              <Text style={styles.payerLabel}>支払う方向</Text>
              <View style={styles.payerRow}>
                <Pressable
                  style={[
                    styles.payerBtn,
                    styles.payerBtnLeft,
                    adjustmentPayer === 'proposer' && styles.payerBtnSelected,
                  ]}
                  onPress={() => setAdjustmentPayer('proposer')}
                >
                  <Text
                    style={[
                      styles.payerBtnText,
                      adjustmentPayer === 'proposer' &&
                        styles.payerBtnTextSelected,
                    ]}
                  >
                    あなた → 相手
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.payerBtn,
                    styles.payerBtnRight,
                    adjustmentPayer === 'receiver' && styles.payerBtnSelected,
                  ]}
                  onPress={() => setAdjustmentPayer('receiver')}
                >
                  <Text
                    style={[
                      styles.payerBtnText,
                      adjustmentPayer === 'receiver' &&
                        styles.payerBtnTextSelected,
                    ]}
                  >
                    相手 → あなた
                  </Text>
                </Pressable>
              </View>

              <TextInput
                value={adjustmentAmount}
                onChangeText={setAdjustmentAmount}
                placeholder="例: 500"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                style={styles.input}
                maxLength={4}
              />
              <Text style={styles.counterText}>
                {targetCard.adjustment_max != null
                  ? `上限 ¥${targetCard.adjustment_max.toLocaleString()}`
                  : '上限未設定'}
              </Text>

              <Pressable
                style={styles.checkRow}
                onPress={() => setChkDiff((prev) => !prev)}
              >
                <View style={[styles.checkbox, chkDiff && styles.checkboxChecked]}>
                  {chkDiff && (
                    <Ionicons name="checkmark" size={12} color={colors.textInverse} />
                  )}
                </View>
                <Text style={styles.checkText}>
                  調整金の発生に同意します
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* ── メッセージ（コラプシブル） ── */}
        <View style={styles.section}>
          <Pressable
            style={styles.toggleRow}
            onPress={() => {
              setShowMessage((prev) => {
                if (prev) setMessage('')
                return !prev
              })
            }}
          >
            <Ionicons
              name={showMessage ? 'remove-circle-outline' : 'add-circle-outline'}
              size={18}
              color={colors.primary}
            />
            <Text style={styles.toggleLabel}>
              {showMessage ? 'メッセージをキャンセル' : '一言添える（任意）'}
            </Text>
          </Pressable>

          {showMessage && (
            <>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="例: よろしくお願いします！"
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.textarea]}
                maxLength={150}
              />
              <Text style={styles.counterText}>{message.length}/150</Text>
            </>
          )}
        </View>

        {/* ── 同意チェックボックス ── */}
        <View style={styles.section}>
          <Pressable
            style={styles.checkRow}
            onPress={() => setChkTerms((prev) => !prev)}
          >
            <View style={[styles.checkbox, chkTerms && styles.checkboxChecked]}>
              {chkTerms && (
                <Ionicons name="checkmark" size={12} color={colors.textInverse} />
              )}
            </View>
            <Text style={styles.checkText}>
              同時発送・72時間以内の発送・追跡番号必須のルールに同意します
            </Text>
          </Pressable>
        </View>

        {/* CTA area */}
        <View style={styles.ctaWrap}>
        {/* 交換内容サマリ (β1 複数枚: 先頭 1 枚 + 残数バッジ) */}
        {primarySelected != null && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              {primarySelected.image_url != null ? (
                <Image
                  source={{ uri: primarySelected.image_url }}
                  style={styles.summaryThumb}
                />
              ) : (
                <View style={[styles.summaryThumb, styles.imagePlaceholder]}>
                  <Ionicons name="image-outline" size={12} color={colors.textTertiary} />
                </View>
              )}
              <Text style={styles.summaryName} numberOfLines={1}>
                {primarySelected.name}
              </Text>
              {extraSelectedCount > 0 && (
                <View style={styles.summaryExtraBadge}>
                  <Text style={styles.summaryExtraBadgeText}>+{extraSelectedCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.summaryArrow}>⇄</Text>
            <View style={styles.summaryCard}>
              {targetCard.image_url != null ? (
                <Image
                  source={{ uri: targetCard.image_url }}
                  style={styles.summaryThumb}
                />
              ) : (
                <View style={[styles.summaryThumb, styles.imagePlaceholder]}>
                  <Ionicons name="image-outline" size={12} color={colors.textTertiary} />
                </View>
              )}
              <Text style={styles.summaryName} numberOfLines={1}>
                {targetCard.name}
              </Text>
            </View>
          </View>
        )}

        {hint != null && (
          <Text style={styles.hintText} numberOfLines={1}>
            {hint.text}
          </Text>
        )}

        {/* ★ added: 成立理由ラベル — PrimaryCTA の直上、bestMatchScore !== 'none' のときのみ */}
        {matchReasonLabel != null && (
          <Text style={styles.matchReasonNote} numberOfLines={1}>
            {matchReasonLabel}
          </Text>
        )}

        {/* β1 期待値補正: 通常の交換提案フローは郵送交換のみ対応 (accept_offer_atomic_v3
            が trade_mode='mail' 固定 + ship_deadline_at 72h + shipments 必須生成のため)。
            手渡し・会場交換は今後の専用導線で対応予定。 */}
        <Text style={styles.shippingExpectationNote}>
          ※ β1 では、通常の交換提案は郵送交換として進行します。{'\n'}
          成立後、発送先情報の共有と発送手続きが必要です。
        </Text>

        <PrimaryCTA
          label="提案を送る"
          onPress={handleConfirmAndSubmit}
          loading={submitting}
          disabled={!canSend}
          size="lg"
        />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Center states ──────────────────────
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  backButton: {
    marginTop: spacing.base,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },

  // ── Success ────────────────────────────
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  successEmoji: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  successSub: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  successCta: {
    width: '100%',
  },

  // ── NavBar ─────────────────────────────
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  navBack: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  navSpacer: {
    width: 36,
  },

  // ── Scroll ─────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },

  // ── Section label ──────────────────────
  sectionLabelRow: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },

  // ── ExchangeRow ────────────────────────
  exchangeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.base,
    marginBottom: spacing.lg,
  },

  // Target column (left)
  targetCol: {
    width: 104,
  },
  targetColLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.trustGreen,
    marginBottom: spacing.xs,
  },
  targetImageWrap: {
    borderWidth: 2,
    borderColor: colors.trustGreen,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  targetImage: {
    width: '100%',
    height: 80,
    backgroundColor: colors.backgroundMuted,
  },
  targetName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  conditionList: {
    // spacing via marginBottom on conditionRow
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  conditionText: {
    fontSize: 10,
    color: colors.textSecondary,
    marginLeft: 3,
    flex: 1,
    lineHeight: 14,
  },
  conditionTextMuted: {
    color: colors.textTertiary,
  },

  // 相手の求フィールド
  wantDescRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 5,
  },
  wantDescLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginRight: 4,
    marginTop: 1,
  },
  wantDescValue: {
    flex: 1,
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
  },

  // Owner Trust stats
  ownerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  ownerStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  ownerStatValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  ownerStatValueGreen: {
    color: colors.trustGreen,
  },
  ownerStatValueWarn: {
    color: colors.warning,
  },
  ownerStatLabel: {
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 1,
  },
  ownerStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },

  // Arrow column (center)
  arrowCol: {
    width: 40,
    alignItems: 'center',
    paddingTop: 32,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // My picker column (right)
  myPickerCol: {
    flex: 1,
  },
  myColLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  emptyPickerBox: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  emptyPickerText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },

  // 選択中ラベル
  selectedLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
    marginBottom: 3,
  },

  // 確定行
  confirmedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.xs,
  },
  confirmedImage: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundMuted,
  },
  confirmedMeta: {
    flex: 1,
    marginLeft: spacing.xs,
    marginRight: spacing.xs,
  },
  confirmedName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },

  // 変更リスト
  changeLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  pickerItemSelected: {
    backgroundColor: '#F5F3FF',
    borderBottomColor: colors.primary,
  },
  pickerNameSelected: {
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  pickerThumb: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundMuted,
  },
  pickerMeta: {
    flex: 1,
    marginLeft: spacing.xs,
  },
  pickerName: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
  },

  // 「求に近い」バッジ — 控えめな補助表示
  nearWantBadge: {
    alignSelf: 'flex-start',
    marginTop: 3,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.full,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  nearWantBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },

  // ── Sections ───────────────────────────
  section: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.primary,
    marginLeft: spacing.xs,
  },

  // Input
  input: {
    minHeight: 52,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: spacing.base,
    paddingVertical: 14,
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  textarea: {
    minHeight: 80,
  },
  counterText: {
    alignSelf: 'flex-end',
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },

  // Payer selector（state保持のためスタイルも保持）
  payerLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  payerRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  payerBtn: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundCard,
  },
  payerBtnLeft: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  payerBtnRight: {
    // no extra border needed
  },
  payerBtnSelected: {
    backgroundColor: '#F5F3FF',
  },
  payerBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  payerBtnTextSelected: {
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },

  // Checkbox
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginLeft: spacing.sm,
  },

  bottomSpace: {
    height: 100,
  },

  // ── CTA wrap ───────────────────────────
  ctaWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  // サマリ行
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryThumb: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundMuted,
  },
  summaryName: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  summaryArrow: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    marginHorizontal: spacing.xs,
  },
  summaryExtraBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: spacing.xs,
  },
  summaryExtraBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },

  // ヒント表示（ctaConfirmLabel の直上）
  hintText: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },

  // CTA直前の確認ラベル
  ctaConfirmLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },

  // ★ added: 成立理由ラベル（PrimaryCTA直上）
  matchReasonNote: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  // β1 期待値補正: 郵送交換のみ対応であることを CTA 直前に明示
  shippingExpectationNote: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: spacing.sm,
  },

  // Shared
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
