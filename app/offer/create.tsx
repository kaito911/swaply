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
import { colors, fontSize, radius, spacing } from '@/constants/theme'
import { createOffer, fetchCard, fetchUserCards } from '@/lib/supabase'
import { Card } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'

export default function OfferCreateScreen() {
  const { session } = useAuthContext()
  const { cardId } = useLocalSearchParams<{ cardId?: string | string[] }>()

  const [targetCard, setTargetCard] = useState<Card | null>(null)
  const [myCards, setMyCards] = useState<Card[]>([])
  const [selectedMyCardId, setSelectedMyCardId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [screenError, setScreenError] = useState<string | null>(null)

  const userId = session?.user?.id ?? null

  const resolvedCardId = useMemo(() => {
    if (Array.isArray(cardId)) return cardId[0] ?? null
    return cardId ?? null
  }, [cardId])

  const selectedMyCard = useMemo(() => {
    if (selectedMyCardId == null) return null
    return myCards.find((card) => card.id === selectedMyCardId) ?? null
  }, [myCards, selectedMyCardId])

  const isOwnTarget = useMemo(() => {
    if (!targetCard || !userId) return false
    return targetCard.owner_user_id === userId
  }, [targetCard, userId])

  const targetIsActive = targetCard?.status === 'active'
  const selectedMyCardIsActive = selectedMyCard?.status === 'active'

  useEffect(() => {
    let mounted = true

    const load = async () => {
      if (!userId) {
        if (mounted) {
          setTargetCard(null)
          setMyCards([])
          setSelectedMyCardId(null)
          setScreenError('ログイン情報が確認できません')
          setLoading(false)
        }
        return
      }

      if (!resolvedCardId) {
        if (mounted) {
          setTargetCard(null)
          setMyCards([])
          setSelectedMyCardId(null)
          setScreenError('交換対象の出品IDが見つかりません')
          setLoading(false)
        }
        return
      }

      try {
        setLoading(true)
        setScreenError(null)

        const [target, mine] = await Promise.all([
          fetchCard(resolvedCardId),
          fetchUserCards(userId, 'active'),
        ])

        if (!mounted) return

        const filteredMine = mine.filter((card) => card.id !== resolvedCardId)

        setTargetCard(target)
        setMyCards(filteredMine)

        if (filteredMine.length > 0) {
          const stillSelectable = filteredMine.some(
            (card) => card.id === selectedMyCardId
          )

          setSelectedMyCardId(
            stillSelectable ? selectedMyCardId : filteredMine[0].id
          )
        } else {
          setSelectedMyCardId(null)
        }

        if (!target) {
          setScreenError('交換対象の出品が見つかりません')
          return
        }

        if (!target.owner_user_id) {
          setScreenError('出品者情報が不正です')
          return
        }
      } catch (error) {
        console.error('[OfferCreateScreen][load]', error)

        if (!mounted) return

        setTargetCard(null)
        setMyCards([])
        setSelectedMyCardId(null)
        setScreenError('交換提案画面の読み込みに失敗しました')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [resolvedCardId, selectedMyCardId, userId])

  const handleSubmit = async () => {
    if (!userId) {
      Alert.alert('エラー', 'ログイン情報が確認できません')
      return
    }

    if (!targetCard) {
      Alert.alert('エラー', '交換対象の出品が見つかりません')
      return
    }

    if (!targetCard.owner_user_id) {
      Alert.alert('エラー', '出品者情報が不正です')
      return
    }

    if (isOwnTarget) {
      Alert.alert('エラー', '自分の出品には提案できません')
      return
    }

    if (!targetIsActive) {
      Alert.alert('エラー', 'この出品は現在交換提案できません')
      return
    }

    if (!selectedMyCard) {
      Alert.alert(
        'カードを選択してください',
        '交換に出すあなたのカードを1枚選んでください'
      )
      return
    }

    if (!selectedMyCardIsActive) {
      Alert.alert('エラー', '選択したあなたのカードは現在提案に使用できません')
      return
    }

    const trimmedMessage = message.trim()

    const parsedAdjustment =
      adjustmentAmount.trim().length === 0
        ? null
        : Number(adjustmentAmount.replace(/[^\d]/g, ''))

    if (parsedAdjustment !== null && Number.isNaN(parsedAdjustment)) {
      Alert.alert('入力エラー', '調整金は数字で入力してください')
      return
    }

    if (
      !targetCard.allows_adjustment &&
      parsedAdjustment !== null &&
      parsedAdjustment > 0
    ) {
      Alert.alert('入力エラー', 'この出品は調整金なしでのみ提案できます')
      return
    }

    if (
      targetCard.allows_adjustment &&
      targetCard.adjustment_max != null &&
      parsedAdjustment != null &&
      parsedAdjustment > targetCard.adjustment_max
    ) {
      Alert.alert(
        '入力エラー',
        `調整金は上限 ¥${targetCard.adjustment_max.toLocaleString()} までです`
      )
      return
    }

    try {
      setSubmitting(true)

      await createOffer({
        proposerId: userId,
        receiverId: targetCard.owner_user_id,
        proposerCardId: selectedMyCard.id,
        receiverCardId: targetCard.id,
        adjustmentAmount: parsedAdjustment,
        message: trimmedMessage.length > 0 ? trimmedMessage : null,
      })

      Alert.alert('提案を送信しました', '取引タブで状態を確認できます', [
        {
          text: 'OK',
          onPress: () => {
            router.replace('/(tabs)/propose' as never)
          },
        },
      ])
    } catch (error) {
      console.error('[OfferCreateScreen][handleSubmit]', error)
      Alert.alert('エラー', '交換提案の送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (screenError || !resolvedCardId || !targetCard) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorTitle}>
          {screenError ?? '交換対象の出品が見つかりません'}
        </Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>戻る</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <Text style={styles.title}>交換を提案する</Text>
          <Text style={styles.subtitle}>
            相手の出品に対して、あなたのカードを選んで提案を送ります
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>相手の出品</Text>

          <View style={styles.targetCard}>
            {targetCard.image_url ? (
              <Image source={{ uri: targetCard.image_url }} style={styles.targetImage} />
            ) : (
              <View style={[styles.targetImage, styles.imagePlaceholder]}>
                <Text style={styles.imagePlaceholderText}>📷</Text>
              </View>
            )}

            <View style={styles.targetBody}>
              <Text style={styles.targetName}>{targetCard.name}</Text>

              <Text style={styles.targetMeta}>
                {[
                  targetCard.group_name,
                  targetCard.member_name,
                  targetCard.series,
                ]
                  .filter((v): v is string => v != null && v.length > 0)
                  .join(' · ') || 'カテゴリ未設定'}
              </Text>

              <View style={styles.conditionList}>
                <View style={styles.conditionRow}>
                  <Ionicons
                    name={
                      targetCard.allows_adjustment
                        ? 'checkmark-circle'
                        : 'close-circle-outline'
                    }
                    size={16}
                    color={
                      targetCard.allows_adjustment
                        ? colors.trustGreen
                        : colors.textTertiary
                    }
                  />
                  <Text style={styles.conditionText}>
                    {targetCard.allows_adjustment
                      ? `調整金あり（上限 ¥${(targetCard.adjustment_max ?? 0).toLocaleString()}）`
                      : '調整金なし'}
                  </Text>
                </View>

                <View style={styles.conditionRow}>
                  <Ionicons
                    name={targetCard.allows_mail ? 'mail-outline' : 'close-circle-outline'}
                    size={16}
                    color={
                      targetCard.allows_mail
                        ? colors.trustBlue
                        : colors.textTertiary
                    }
                  />
                  <Text style={styles.conditionText}>
                    {targetCard.allows_mail ? '郵送可' : '郵送不可'}
                  </Text>
                </View>

                <View style={styles.conditionRow}>
                  <Ionicons
                    name={
                      targetCard.allows_handoff
                        ? 'hand-left-outline'
                        : 'close-circle-outline'
                    }
                    size={16}
                    color={
                      targetCard.allows_handoff
                        ? colors.trustGreen
                        : colors.textTertiary
                    }
                  />
                  <Text style={styles.conditionText}>
                    {targetCard.allows_handoff ? '手渡し可' : '手渡し不可'}
                  </Text>
                </View>

                <View style={styles.conditionRow}>
                  <Ionicons
                    name={targetIsActive ? 'checkmark-circle' : 'alert-circle-outline'}
                    size={16}
                    color={
                      targetIsActive ? colors.trustGreen : colors.textTertiary
                    }
                  />
                  <Text style={styles.conditionText}>
                    {targetIsActive ? '提案受付中' : '現在は提案不可'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>あなたが出すカード</Text>
          <Text style={styles.helperText}>
            提案に含めるカードを1枚選択してください
          </Text>

          {isOwnTarget ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>自分の出品には提案できません</Text>
              <Text style={styles.emptyBody}>
                別の相手の出品を選んで交換提案を作成してください。
              </Text>
            </View>
          ) : myCards.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>出品中のカードがありません</Text>
              <Text style={styles.emptyBody}>
                先にカードを出品すると交換提案を送れます。
              </Text>
            </View>
          ) : (
            <View style={styles.myCardList}>
              {myCards.map((card) => {
                const selected = card.id === selectedMyCardId
                const active = card.status === 'active'

                return (
                  <Pressable
                    key={card.id}
                    style={[
                      styles.selectableCard,
                      selected && styles.selectableCardSelected,
                      !active && styles.selectableCardDisabled,
                    ]}
                    onPress={() => {
                      if (!active) return
                      setSelectedMyCardId(card.id)
                    }}
                  >
                    {card.image_url ? (
                      <Image source={{ uri: card.image_url }} style={styles.myCardImage} />
                    ) : (
                      <View style={[styles.myCardImage, styles.imagePlaceholder]}>
                        <Text style={styles.imagePlaceholderText}>📷</Text>
                      </View>
                    )}

                    <View style={styles.selectableBody}>
                      <Text style={styles.selectableTitle} numberOfLines={2}>
                        {card.name}
                      </Text>

                      <Text style={styles.selectableMeta} numberOfLines={1}>
                        {[
                          card.group_name,
                          card.member_name,
                          card.series,
                        ]
                          .filter((v): v is string => v != null && v.length > 0)
                          .join(' · ') || 'カテゴリ未設定'}
                      </Text>

                      <Text style={styles.cardStateText}>
                        {active ? '提案に使用可能' : '現在は使用不可'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.radioOuter,
                        selected && styles.radioOuterSelected,
                      ]}
                    >
                      {selected ? <View style={styles.radioInner} /> : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>調整金</Text>
          <Text style={styles.helperText}>
            {targetCard.allows_adjustment
              ? '必要な場合のみ入力してください'
              : 'この出品は調整金なしのみ対応です'}
          </Text>

          <TextInput
            value={adjustmentAmount}
            onChangeText={setAdjustmentAmount}
            placeholder={targetCard.allows_adjustment ? '例: 300' : '入力不可'}
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            editable={targetCard.allows_adjustment}
            style={[
              styles.input,
              !targetCard.allows_adjustment && styles.inputDisabled,
            ]}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>メッセージ</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="例: 初めまして。こちらのカードとの交換を希望しています。"
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.textarea]}
            maxLength={300}
          />
          <Text style={styles.counterText}>{message.length}/300</Text>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>

      <View style={styles.ctaWrap}>
        <PrimaryCTA
          label={submitting ? '送信中...' : 'この内容で提案する'}
          onPress={handleSubmit}
          disabled={
            submitting ||
            isOwnTarget ||
            !targetIsActive ||
            myCards.length === 0 ||
            selectedMyCard == null ||
            !selectedMyCardIsActive
          }
          size="lg"
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
    paddingTop: spacing.lg,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  backButton: {
    marginTop: spacing.base,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
  },
  headerBlock: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  helperText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  targetCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  targetImage: {
    width: '100%',
    height: 220,
    backgroundColor: colors.backgroundMuted,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 36,
  },
  targetBody: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  targetName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  targetMeta: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  conditionList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  conditionText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  emptyBox: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  myCardList: {
    gap: spacing.sm,
  },
  selectableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  selectableCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F5F3FF',
  },
  selectableCardDisabled: {
    opacity: 0.55,
  },
  myCardImage: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
  },
  selectableBody: {
    flex: 1,
    gap: 4,
  },
  selectableTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  selectableMeta: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  cardStateText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
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
  inputDisabled: {
    backgroundColor: colors.backgroundMuted,
    color: colors.textTertiary,
  },
  textarea: {
    minHeight: 116,
  },
  counterText: {
    alignSelf: 'flex-end',
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  ctaWrap: {
    padding: spacing.base,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomSpace: {
    height: 40,
  },
})