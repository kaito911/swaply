import { HeaderActions } from '@/components/HeaderActions'
import { ScreenHeader } from '@/components/ScreenHeader'
import { UnreadBadge } from '@/components/UnreadBadge'
import { FEATURE_FLAGS } from '@/constants/feature-flags'
import { colors } from '@/constants/theme'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { acceptOffer, declineOffer, fetchMyOffers } from '@/lib/supabase'
import {
  OFFER_STATUS_LABELS,
  TRADE_STATUS_LABELS,
  type Offer,
  type OfferStatus,
  type TradeStatus,
} from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { useBadge } from '@/providers/BadgeProvider'

// ─────────────────────────────────────────
// Trust サマリー行（受信/送信カード共通）
// ─────────────────────────────────────────

// ─────────────────────────────────────────

type OfferTabKey = 'proposal' | 'inProgress'

type ProposalSubTabKey = 'received' | 'sent'

type OfferWithTrade = Offer & {
  trade?: {
    id: string
    status: TradeStatus
  } | null
}

type SimpleProfileLike = {
  display_name?: string | null
  handle?: string | null
}

export default function ProposeScreen() {
  const { session } = useAuthContext()
  const { refreshBadge, tradeUnreadCounts } = useBadge()

  const [activeTab, setActiveTab] = useState<OfferTabKey>('proposal')
  const [proposalSubTab, setProposalSubTab] = useState<ProposalSubTabKey>('received')
  const [offers, setOffers] = useState<OfferWithTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actingOfferId, setActingOfferId] = useState<string | null>(null)
  const [openingTradeOfferId, setOpeningTradeOfferId] = useState<string | null>(null)

  const userId = session?.user?.id ?? null

  const loadOffers = useCallback(
    async (isRefresh = false) => {
      if (!userId) {
        setOffers([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      try {
        if (isRefresh) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        const data = (await fetchMyOffers(userId)) as OfferWithTrade[]
        setOffers(data)
      } catch (error) {
        console.error('[ProposeScreen][loadOffers]', error)
        Alert.alert('エラー', '取引一覧の取得に失敗しました')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [userId]
  )

  useFocusEffect(
    useCallback(() => {
      void loadOffers()
      // PR-DM b-3: フォーカス時に未読 Map も再取得 (③行バッジの鮮度)。
      //   既存 Context の refreshBadge を呼ぶだけ (新規 fetcher/リスナーは足さない)。
      void refreshBadge()
    }, [loadOffers, refreshBadge])
  )

  // 提案サブタブ「届いた提案」: 自分が受信した pending
  const receivedOffers = useMemo(() => {
    return offers.filter(
      (offer) =>
        offer.status === 'pending' &&
        offer.target_card?.owner_user_id === userId
    )
  }, [offers, userId])

  // 提案サブタブ「送信した提案」: 自分が送信した pending
  const sentOffers = useMemo(() => {
    return offers.filter(
      (offer) =>
        offer.status === 'pending' &&
        offer.proposer_user_id === userId
    )
  }, [offers, userId])

  // 受信 pending を「対象商品 (target_card_id) ごと」に件数集計。
  //   承認時に v3 が同一商品の競合 pending を自動 declined にするため、
  //   「他に N 件の提案がある」注記と承認 Alert の警告に使う (最小案・DB変更なし)。
  const receivedCountByCard = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of receivedOffers) {
      const cid = o.target_card?.id
      if (cid == null) continue
      m.set(cid, (m.get(cid) ?? 0) + 1)
    }
    return m
  }, [receivedOffers])

  // 取引中タブ: trade が動いているもの、または accepted 直後で trade 未生成のもの
  const inProgressOffers = useMemo(() => {
    return offers.filter((offer) => {
      const tradeStatus = offer.trade?.status
      if (
        tradeStatus === 'pending' ||
        tradeStatus === 'in_transit' ||
        tradeStatus === 'partially_received' ||
        tradeStatus === 'disputed'
      ) {
        return true
      }
      return offer.status === 'accepted' && offer.trade == null
    })
  }, [offers])

  const visibleOffers = useMemo(() => {
    if (activeTab === 'proposal') {
      return proposalSubTab === 'received' ? receivedOffers : sentOffers
    }
    if (activeTab === 'inProgress') return inProgressOffers
    return []
  }, [activeTab, proposalSubTab, receivedOffers, sentOffers, inProgressOffers])

  const handleAccept = useCallback(
    // otherCount = 同じ商品に来ている「この提案以外」の受信 pending 件数。
    //   >0 のとき、承認で自動辞退される旨を Alert 本文で予告する (驚き防止・最小案)。
    (offerId: string, otherCount = 0) => {
      const body =
        otherCount > 0
          ? `承認すると、同じ商品への他の ${otherCount} 件の提案は自動的に辞退されます。`
          : '承認すると取引が開始され、進行中タブで発送と受取確認を管理できます。'
      Alert.alert(
        'この提案を承認しますか？',
        body,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '承認',
            onPress: async () => {
              try {
                setActingOfferId(offerId)
                await acceptOffer(offerId)
                await loadOffers(true)
                setActiveTab('inProgress')
                await refreshBadge()
                Alert.alert('承認しました', '取引が開始されました。')
              } catch (error: unknown) {
                console.error('[ProposeScreen][handleAccept]', error)
                const message =
                  error instanceof Error ? error.message : '承認に失敗しました'
                Alert.alert('エラー', message)
              } finally {
                setActingOfferId(null)
              }
            },
          },
        ]
      )
    },
    [loadOffers, refreshBadge]
  )

  const handleDecline = useCallback(
    (offerId: string) => {
      Alert.alert(
        '提案を辞退しますか？',
        '辞退するとこの提案は不成立になります。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '辞退',
            style: 'destructive',
            onPress: async () => {
              try {
                setActingOfferId(offerId)
                await declineOffer(offerId)
                await loadOffers(true)
                await refreshBadge()
                Alert.alert('辞退しました')
              } catch (error: unknown) {
                console.error('[ProposeScreen][handleDecline]', error)
                const message =
                  error instanceof Error ? error.message : '辞退に失敗しました'
                Alert.alert('エラー', message)
              } finally {
                setActingOfferId(null)
              }
            },
          },
        ]
      )
    },
    [loadOffers, refreshBadge]
  )

  const handleOpenTrade = useCallback(async (offer: OfferWithTrade) => {
    const tradeStatus = offer.trade?.status

    if (
      tradeStatus !== 'pending' &&
      tradeStatus !== 'in_transit' &&
      tradeStatus !== 'partially_received' &&
      tradeStatus !== 'completed' &&
      tradeStatus !== 'cancelled' &&
      tradeStatus !== 'disputed' &&
      offer.status !== 'accepted' &&
      offer.status !== 'completed'
    ) {
      Alert.alert('まだ開けません', 'この提案はまだ取引画面を開ける状態ではありません。')
      return
    }

    try {
      setOpeningTradeOfferId(offer.id)

      router.push({
        pathname: '/trade/[offerId]',
        params: { offerId: offer.id },
      } as never)
    } catch (error: unknown) {
      console.error('[ProposeScreen][handleOpenTrade]', error)
      const message =
        error instanceof Error ? error.message : '取引情報の取得に失敗しました。'
      Alert.alert('取引画面を開けませんでした', message)
    } finally {
      setOpeningTradeOfferId(null)
    }
  }, [])

  const renderEmptyText = () => {
    if (activeTab === 'proposal') {
      if (proposalSubTab === 'received') {
        return {
          title: '相手からの申請はまだありません',
          body: '相手から申請が届くとここに表示されます。',
        }
      }
      return {
        title: '自分からの申請はまだありません',
        body: 'あなたが送った申請はここで確認できます。',
      }
    }

    return {
      title: '進行中の取引はまだありません',
      body: '承認された申請がここに表示されます。',
    }
  }

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.centerText}>取引一覧を読み込み中です</Text>
        </View>
      )
    }

    if (!userId) {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>ログイン情報がありません</Text>
          <Text style={styles.emptyBody}>
            ログイン後に取引一覧を確認してください。
          </Text>
        </View>
      )
    }

    if (visibleOffers.length === 0) {
      const empty = renderEmptyText()

      return (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>{empty.title}</Text>
          <Text style={styles.emptyBody}>{empty.body}</Text>
        </View>
      )
    }

    type ListItem =
      | { kind: 'header'; title: string }
      | { kind: 'offer'; offer: OfferWithTrade }

    const items: ListItem[] = []
    if (activeTab === 'proposal' && proposalSubTab === 'received') {
      const priorityOffers = receivedOffers.slice(0, 5)
      const priorityIds = new Set(priorityOffers.map((o) => o.id))
      const remainingOffers = receivedOffers.filter(
        (o) => !priorityIds.has(o.id)
      )
      if (priorityOffers.length > 0) {
        items.push({ kind: 'header', title: '未対応（優先）' })
        for (const o of priorityOffers) items.push({ kind: 'offer', offer: o })
      }
      if (remainingOffers.length > 0) {
        items.push({ kind: 'header', title: 'すべての申請' })
        for (const o of remainingOffers) items.push({ kind: 'offer', offer: o })
      }
    } else {
      for (const o of visibleOffers) items.push({ kind: 'offer', offer: o })
    }

    return (
      <View style={styles.list}>
        {items.map((item, idx) => {
          if (item.kind === 'header') {
            return (
              <Text key={`h-${idx}`} style={styles.sectionTitle}>
                {item.title}
              </Text>
            )
          }
          const offer = item.offer
          const isReceived = offer.target_card?.owner_user_id === userId
          const isPendingReceived = isReceived && offer.status === 'pending'
          const isActing = actingOfferId === offer.id
          const tradeStatus = offer.trade?.status
          const canOpenTrade =
            tradeStatus === 'pending' ||
            tradeStatus === 'in_transit' ||
            tradeStatus === 'partially_received' ||
            tradeStatus === 'completed' ||
            tradeStatus === 'cancelled' ||
            tradeStatus === 'disputed' ||
            offer.status === 'accepted' ||
            offer.status === 'completed'
          const isOpeningTrade = openingTradeOfferId === offer.id

          const proposerCardNames = getProposerCardNames(offer)
          const receiverCardNames = getReceiverCardNames(offer)

          const badgeKey = tradeStatus ?? offer.status
          const badgeLabel = getInProgressBadgeLabel(tradeStatus, offer.status)

          // PR-DM b-3 ③: この取引 (offer.trade.id = trade_id) の DM 未読数。
          //   Context の Map から読むだけ (この画面で個別 fetch しない)。
          //   trade が無い提案行は id=null → 0 で非表示。
          const rowTradeId = offer.trade?.id ?? null
          const rowUnread =
            rowTradeId != null ? tradeUnreadCounts.get(rowTradeId) ?? 0 : 0

          return (
            <Pressable
              key={offer.id}
              onPress={
                activeTab === 'proposal'
                  ? () => router.push(`/offer/${offer.id}`)
                  : canOpenTrade
                  ? () => handleOpenTrade(offer)
                  : undefined
              }
              style={({ pressed }) => [
                styles.card,
                pressed &&
                  (activeTab === 'proposal' || canOpenTrade) && {
                    opacity: 0.85,
                  },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.cardTitle}>
                    {/* 申請タブ: サブタブと冗長にならないシンプルな分類見出し。
                        進行中タブ: もう「提案」ではないので「進行中の取引」一律。
                        役割 (あなたが提案 / 受信) のバッジは進行中で意味が薄いため削除。 */}
                    {activeTab === 'proposal'
                      ? isReceived
                        ? '相手からの申請'
                        : '自分からの申請'
                      : '進行中の取引'}
                  </Text>
                  <Text style={styles.cardDate}>{formatDate(offer.created_at)}</Text>
                </View>

                {/* PR-DM b-3 ③: DM 未読バッジ (status バッジの手前・赤丸)。共通 UnreadBadge。 */}
                <UnreadBadge count={rowUnread} />

                <View
                  style={[
                    styles.statusBadge,
                    getUnifiedStatusBadgeStyle(badgeKey).badge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      getUnifiedStatusBadgeStyle(badgeKey).text,
                    ]}
                  >
                    {badgeLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.partnerBox}>
                <Text style={styles.partnerLabel}>
                  {isReceived ? '提案者' : '送信先'}
                </Text>
                <Text style={styles.partnerName}>
                  {isReceived
                    ? getProfileName(offer.proposer)
                    : getProfileName(offer.target_card?.owner)}
                </Text>
              </View>

              {/* Trust統計 (TradeStats・seed 固定の死んだ値) の表示を β1 で削除 (タスクB')。 */}

              {/* 画像 URL 選定: 自分が受信側 (target_card 所有者) なら、
                  「出すグッズ」= target_card.image_url、「受け取るグッズ」= items 側の image。
                  自分が送信側 (提案者) なら逆 (「出すグッズ」= items 側、「受け取るグッズ」= target_card)。
                  fetchMyOffers の SELECT で既に取得済、追加 fetch 不要。 */}
              {(() => {
                const proposerImage = getProposerCardImage(offer)
                const receiverImage = getReceiverCardImage(offer)
                const yourGiveImage = isReceived ? receiverImage : proposerImage
                const yourGetImage = isReceived ? proposerImage : receiverImage
                const yourGiveNames = isReceived ? receiverCardNames : proposerCardNames
                const yourGetNames = isReceived ? proposerCardNames : receiverCardNames

                return (
                  <View style={styles.tradeRow}>
                    <View style={styles.tradeCardBox}>
                      <Text style={styles.tradeLabel}>あなたが出すグッズ</Text>
                      <View style={styles.tradeCardInner}>
                        {yourGiveImage != null ? (
                          <Image
                            source={{ uri: yourGiveImage }}
                            style={styles.tradeCardThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.tradeCardThumbFallback}>
                            <Text style={styles.tradeCardThumbFallbackText}>
                              NO IMAGE
                            </Text>
                          </View>
                        )}
                        <Text style={styles.tradeValue} numberOfLines={3}>
                          {yourGiveNames.join('\n')}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.tradeArrow}>⇄</Text>

                    <View style={styles.tradeCardBox}>
                      <Text style={styles.tradeLabel}>あなたが受け取るグッズ</Text>
                      <View style={styles.tradeCardInner}>
                        {yourGetImage != null ? (
                          <Image
                            source={{ uri: yourGetImage }}
                            style={styles.tradeCardThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.tradeCardThumbFallback}>
                            <Text style={styles.tradeCardThumbFallbackText}>
                              NO IMAGE
                            </Text>
                          </View>
                        )}
                        <Text style={styles.tradeValue} numberOfLines={3}>
                          {yourGetNames.join('\n')}
                        </Text>
                      </View>
                    </View>
                  </View>
                )
              })()}

              {offer.message ? (
                <View style={styles.messageBox}>
                  <Text style={styles.messageLabel}>メッセージ</Text>
                  <Text style={styles.messageText}>{offer.message}</Text>
                </View>
              ) : null}

              {tradeStatus === 'cancelled' || tradeStatus === 'disputed' ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>
                    {getFooterNote(offer.status, tradeStatus)}
                  </Text>
                </View>
              ) : isPendingReceived ? (
                <View style={{ gap: 8 }}>
                  {/* 同じ商品への他の受信 pending 件数 (この提案を除く)。>0 で注記。 */}
                  {(() => {
                    const cid = offer.target_card?.id
                    const others =
                      cid != null ? (receivedCountByCard.get(cid) ?? 1) - 1 : 0
                    if (others <= 0) return null
                    return (
                      <View style={styles.competingNote}>
                        <Text style={styles.competingNoteText}>
                          この商品には他に {others} 件の提案があります
                        </Text>
                      </View>
                    )
                  })()}
                  <View style={styles.buttonRow}>
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        isActing && styles.disabledButton,
                      ]}
                      disabled={isActing}
                      onPress={() => handleDecline(offer.id)}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {isActing ? '処理中...' : '辞退'}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.primaryButton,
                        isActing && styles.disabledButton,
                      ]}
                      disabled={isActing}
                      onPress={() => {
                        const cid = offer.target_card?.id
                        const others =
                          cid != null ? (receivedCountByCard.get(cid) ?? 1) - 1 : 0
                        handleAccept(offer.id, Math.max(0, others))
                      }}
                    >
                      <Text style={styles.primaryButtonText}>
                        {isActing ? '処理中...' : '承認'}
                      </Text>
                    </Pressable>
                  </View>

                  {/* β1: ADJUSTMENT_MONEY_ENABLED=false 中は「調整金変更を提案」ボタンを非表示 */}
                  {FEATURE_FLAGS.ADJUSTMENT_MONEY_ENABLED && (
                    <Pressable
                      style={[styles.counterButton, isActing && styles.disabledButton]}
                      disabled={isActing}
                      onPress={() => {
                        const proposerCardId = getProposerCardId(offer)
                        if (!proposerCardId || !offer.target_card?.id || !userId) return
                        router.push({
                          pathname: '/offer/counter',
                          params: {
                            originalOfferId: offer.id,
                            proposerId: userId,
                            receiverId: offer.proposer_user_id,
                            proposerCardId: offer.target_card.id,
                            receiverCardId: proposerCardId,
                          },
                        } as never)
                      }}
                    >
                      <Text style={styles.counterButtonText}>調整金変更を提案</Text>
                    </Pressable>
                  )}
                </View>
              ) : canOpenTrade ? (
                <View style={styles.actionArea}>
                  <Pressable
                    style={[
                      styles.tradeOpenButton,
                      isOpeningTrade && styles.disabledButton,
                    ]}
                    disabled={isOpeningTrade}
                    onPress={() => handleOpenTrade(offer)}
                  >
                    <Text style={styles.tradeOpenButtonText}>
                      {isOpeningTrade
                        ? '取引画面を開いています...'
                        : tradeStatus === 'completed' || offer.status === 'completed'
                        ? '取引詳細を見る'
                        : '取引画面へ進む'}
                    </Text>
                  </Pressable>

                  <View style={styles.noteBox}>
                    <Text style={styles.noteText}>
                      {getFooterNote(offer.status, tradeStatus)}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>
                    {getFooterNote(offer.status, tradeStatus)}
                  </Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <ScreenHeader title="取引" showBackButton={false} rightActions={<HeaderActions />} />

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === 'proposal' && styles.activeTab]}
            onPress={() => setActiveTab('proposal')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'proposal' && styles.activeTabText,
              ]}
            >
              申請
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tab, activeTab === 'inProgress' && styles.activeTab]}
            onPress={() => setActiveTab('inProgress')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'inProgress' && styles.activeTabText,
              ]}
            >
              進行中
            </Text>
          </Pressable>
        </View>

        {activeTab === 'proposal' && (
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, proposalSubTab === 'received' && styles.activeTab]}
              onPress={() => setProposalSubTab('received')}
            >
              <Text
                style={[
                  styles.tabText,
                  proposalSubTab === 'received' && styles.activeTabText,
                ]}
              >
                相手から{receivedOffers.length > 0 ? ` (${receivedOffers.length})` : ''}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tab, proposalSubTab === 'sent' && styles.activeTab]}
              onPress={() => setProposalSubTab('sent')}
            >
              <Text
                style={[
                  styles.tabText,
                  proposalSubTab === 'sent' && styles.activeTabText,
                ]}
              >
                自分から
              </Text>
            </Pressable>
          </View>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {refreshing && !loading ? (
            <View style={styles.refreshBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.refreshText}>最新状態に更新しています</Text>
            </View>
          ) : null}

          {renderContent()}
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

function getProfileName(profile?: SimpleProfileLike | null): string {
  if (!profile) return 'ユーザー'

  if (profile.display_name && profile.display_name.trim().length > 0) {
    return profile.display_name
  }

  if (profile.handle && profile.handle.trim().length > 0) {
    return `@${profile.handle}`
  }

  return 'ユーザー'
}

function getProposerCardId(offer: Offer): string | undefined {
  const targetCardId = offer.target_card?.id
  return offer.items?.find((item) => item.card_id !== targetCardId)?.card_id
}

function getProposerCardNames(offer: Offer): string[] {
  const targetCardId = offer.target_card?.id

  const proposerItems =
    offer.items?.filter((item) => item.card_id !== targetCardId) ?? []

  if (proposerItems.length === 0) {
    return ['グッズ情報なし']
  }

  return proposerItems.map((item) => item.card?.name || 'グッズ情報なし')
}

function getReceiverCardNames(offer: Offer): string[] {
  const targetName = offer.target_card?.name

  if (targetName && targetName.trim().length > 0) {
    return [targetName]
  }

  return ['グッズ情報なし']
}

// 取引カード一覧用の小さなサムネイル URL を抽出する helper。
// fetchMyOffers は target_card:cards(*) と items:offer_items(*, card:cards(*)) を
// SELECT 済なので、image_url は追加 fetch なしで参照可能。
// 複数枚提案 (items が複数) の場合は target_card 以外の先頭 1 件の card.image_url を採用。

// 提案者 (proposer) 側商品: items の中で target_card 以外の最初の card.image_url
function getProposerCardImage(offer: Offer): string | null {
  const targetCardId = offer.target_card?.id
  const proposerItem = offer.items?.find(
    (item) => item.card_id !== targetCardId
  )
  return proposerItem?.card?.image_url ?? null
}

// 受信者 (receiver / target) 側商品: target_card.image_url
function getReceiverCardImage(offer: Offer): string | null {
  return offer.target_card?.image_url ?? null
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`
}

// 取引中カードのバッジ用ラベル（主体非明示の中立表現）
function getInProgressBadgeLabel(
  tradeStatus: TradeStatus | undefined | null,
  offerStatus: OfferStatus
): string {
  if (tradeStatus === 'pending') return '発送準備中'
  if (tradeStatus === 'in_transit') return '配送中'
  if (tradeStatus === 'partially_received') return '一部到着済'
  if (tradeStatus === 'disputed') return '確認が必要です'
  // 修正G: 未知の status でも生値/undefined を出さない。ラベル辞書に無ければ安全な既定文言。
  if (tradeStatus) return TRADE_STATUS_LABELS[tradeStatus] ?? '進行中'
  return OFFER_STATUS_LABELS[offerStatus] ?? '進行中'
}

function getFooterNote(
  offerStatus: OfferStatus,
  tradeStatus?: TradeStatus | null
): string {
  if (tradeStatus === 'pending') {
    return '両者の発送登録を待っています（72時間以内）。'
  }

  if (tradeStatus === 'in_transit') {
    return '配送が進行中です。到着後に取引画面で確認できます。'
  }

  if (tradeStatus === 'partially_received') {
    return '一部の受取確認が完了しています。残りの到着確認を待っています。'
  }

  if (tradeStatus === 'completed') {
    return 'この取引は完了済みです。取引詳細を確認できます。'
  }

  if (tradeStatus === 'cancelled') {
    return 'この取引は期限切れ等でキャンセルされました。'
  }

  if (tradeStatus === 'disputed') {
    return 'この取引はトラブル対応中です。通常進行では操作できません。'
  }

  if (offerStatus === 'accepted') {
    return 'この提案は承認済みです。取引画面へ進んで発送・受取を管理できます。'
  }

  if (offerStatus === 'declined') {
    return 'この提案は辞退済みです。'
  }

  if (offerStatus === 'cancelled') {
    return 'この提案はキャンセル済みです。'
  }

  if (offerStatus === 'completed') {
    return 'この取引は完了済みです。取引詳細を確認できます。'
  }

  return '返答待ちの提案です。'
}

function getStatusBadgeStyle(status: OfferStatus) {
  if (status === 'pending') {
    return {
      badge: styles.statusPendingBadge,
      text: styles.statusPendingText,
    }
  }

  if (status === 'accepted') {
    return {
      badge: styles.statusAcceptedBadge,
      text: styles.statusAcceptedText,
    }
  }

  if (status === 'declined') {
    return {
      badge: styles.statusDeclinedBadge,
      text: styles.statusDeclinedText,
    }
  }

  if (status === 'completed') {
    return {
      badge: styles.statusCompletedBadge,
      text: styles.statusCompletedText,
    }
  }

  return {
    badge: styles.statusCancelledBadge,
    text: styles.statusCancelledText,
  }
}

function getTradeStatusBadgeStyle(status: TradeStatus) {
  if (status === 'pending') {
    return {
      badge: styles.statusPendingBadge,
      text: styles.statusPendingText,
    }
  }

  if (status === 'in_transit' || status === 'partially_received') {
    return {
      badge: styles.statusAcceptedBadge,
      text: styles.statusAcceptedText,
    }
  }

  if (status === 'completed') {
    return {
      badge: styles.statusCompletedBadge,
      text: styles.statusCompletedText,
    }
  }

  if (status === 'disputed') {
    return {
      badge: styles.statusDeclinedBadge,
      text: styles.statusDeclinedText,
    }
  }

  return {
    badge: styles.statusCancelledBadge,
    text: styles.statusCancelledText,
  }
}

function getUnifiedStatusBadgeStyle(status: OfferStatus | TradeStatus) {
  if (
    status === 'in_transit' ||
    status === 'partially_received' ||
    status === 'disputed'
  ) {
    return getTradeStatusBadgeStyle(status)
  }

  if (
    status === 'pending' ||
    status === 'completed' ||
    status === 'cancelled'
  ) {
    return getTradeStatusBadgeStyle(status)
  }

  return getStatusBadgeStyle(status)
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16, // ★ 3.5a fix: ScreenHeader 置換で消えた余白を回復
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#52525B',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  refreshBox: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE8FA',
  },
  refreshText: {
    fontSize: 12,
    color: '#5B556D',
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 56,
  },
  centerText: {
    marginTop: 10,
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: '#71717A',
    textAlign: 'center',
  },
  list: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3F3F46',
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECE8FA',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
  },
  cardDate: {
    marginTop: 4,
    fontSize: 12,
    color: '#8A8499',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusPendingBadge: {
    backgroundColor: colors.tagInfoBg,
  },
  statusPendingText: {
    color: colors.tagInfoText,
  },
  statusAcceptedBadge: {
    backgroundColor: '#ECFDF3',
  },
  statusAcceptedText: {
    color: '#047857',
  },
  statusDeclinedBadge: {
    backgroundColor: '#FEF2F2',
  },
  statusDeclinedText: {
    color: '#B91C1C',
  },
  statusCompletedBadge: {
    backgroundColor: '#EFF6FF',
  },
  statusCompletedText: {
    color: '#1D4ED8',
  },
  statusCancelledBadge: {
    backgroundColor: '#F4F4F5',
  },
  statusCancelledText: {
    color: '#52525B',
  },
  partnerBox: {
    marginBottom: 14,
  },
  partnerLabel: {
    fontSize: 12,
    color: '#8A8499',
  },
  partnerName: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
    color: '#18181B',
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  tradeCardBox: {
    flex: 1,
    minHeight: 88,
    borderRadius: 16,
    backgroundColor: '#F8F7FC',
    padding: 12,
    justifyContent: 'center',
  },
  // tradeCardBox 内のサムネ + 商品名を横並びで配置。
  // 小さなサムネ (40 × 53、3:4 aspect) + 残り全幅をテキストに割り当てる。
  tradeCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  tradeCardThumb: {
    width: 40,
    aspectRatio: 3 / 4,
    borderRadius: 6,
    backgroundColor: '#EEE',
  },
  tradeCardThumbFallback: {
    width: 40,
    aspectRatio: 3 / 4,
    borderRadius: 6,
    backgroundColor: '#EEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeCardThumbFallbackText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9A9AA8',
  },
  tradeLabel: {
    fontSize: 12,
    color: '#8A8499',
  },
  tradeValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    color: '#18181B',
  },
  tradeArrow: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  messageBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8F7FC',
  },
  messageLabel: {
    fontSize: 12,
    color: '#8A8499',
  },
  messageText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#27272A',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionArea: {
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3F3F46',
  },
  tradeOpenButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  tradeOpenButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  disabledButton: {
    opacity: 0.6,
  },
  noteBox: {
    marginTop: 2,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#71717A',
  },
  // 同一商品に複数提案がある時の注記 (承認で他が自動辞退される予告)
  competingNote: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  competingNoteText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  counterButton: {
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
})
