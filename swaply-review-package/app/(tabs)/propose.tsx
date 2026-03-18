// app/(tabs)/propose.tsx
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { acceptOffer, declineOffer, fetchMyOffers } from '@/lib/supabase'
import { OFFER_STATUS_LABELS, type Offer, type OfferStatus } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'

type OfferTabKey = 'received' | 'sent' | 'inProgress'

type SimpleProfileLike = {
  display_name?: string | null
  handle?: string | null
  username?: string | null
  full_name?: string | null
}

export default function ProposeScreen() {
  const { session } = useAuthContext()

  const [activeTab, setActiveTab] = useState<OfferTabKey>('received')
  const [offers, setOffers] = useState<Offer[]>([])
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

        const data = await fetchMyOffers(userId)
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
    }, [loadOffers])
  )

  const receivedOffers = useMemo(() => {
    return offers.filter((offer) => offer.target_card?.owner_user_id === userId)
  }, [offers, userId])

  const sentOffers = useMemo(() => {
    return offers.filter((offer) => offer.proposer_user_id === userId)
  }, [offers, userId])

  const inProgressOffers = useMemo(() => {
    return offers.filter(
      (offer) => offer.status === 'accepted' || offer.status === 'completed'
    )
  }, [offers])

  const visibleOffers = useMemo(() => {
    if (activeTab === 'received') return receivedOffers
    if (activeTab === 'sent') return sentOffers
    return inProgressOffers
  }, [activeTab, receivedOffers, sentOffers, inProgressOffers])

  const pendingReceivedCount = useMemo(() => {
    return receivedOffers.filter((offer) => offer.status === 'pending').length
  }, [receivedOffers])

  const handleAccept = useCallback(
    (offerId: string) => {
      Alert.alert(
        '提案を承認しますか？',
        '承認すると取引が開始され、進行中タブで発送と受取確認を管理できます。',
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
                Alert.alert('承認しました', '取引が開始されました。')
              } catch (error: any) {
                console.error('[ProposeScreen][handleAccept]', error)
                Alert.alert(
                  'エラー',
                  error?.message || '承認に失敗しました'
                )
              } finally {
                setActingOfferId(null)
              }
            },
          },
        ]
      )
    },
    [loadOffers]
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
                Alert.alert('辞退しました')
              } catch (error: any) {
                console.error('[ProposeScreen][handleDecline]', error)
                Alert.alert(
                  'エラー',
                  error?.message || '辞退に失敗しました'
                )
              } finally {
                setActingOfferId(null)
              }
            },
          },
        ]
      )
    },
    [loadOffers]
  )

  const handleOpenTrade = useCallback(async (offer: Offer) => {
    if (offer.status !== 'accepted' && offer.status !== 'completed') {
      Alert.alert('まだ開けません', 'この提案はまだ取引画面を開ける状態ではありません。')
      return
    }

    try {
      setOpeningTradeOfferId(offer.id)

      router.push({
        pathname: '/trade/[offerId]',
        params: { offerId: offer.id },
      } as never)
    } catch (error: any) {
      console.error('[ProposeScreen][handleOpenTrade]', error)
      Alert.alert(
        '取引画面を開けませんでした',
        error?.message || '取引情報の取得に失敗しました。'
      )
    } finally {
      setOpeningTradeOfferId(null)
    }
  }, [])

  const renderEmptyText = () => {
    if (activeTab === 'received') {
      return {
        title: '受信した提案はまだありません',
        body: '相手から提案が届くとここに表示されます。',
      }
    }

    if (activeTab === 'sent') {
      return {
        title: '送信した提案はまだありません',
        body: '提案を送るとここで状態を確認できます。',
      }
    }

    return {
      title: '進行中の取引はまだありません',
      body: '承認された提案がここに表示されます。',
    }
  }

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color="#6D5EF5" />
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

    return (
      <View style={styles.list}>
        {visibleOffers.map((offer) => {
          const isReceived = offer.target_card?.owner_user_id === userId
          const isPendingReceived = isReceived && offer.status === 'pending'
          const isActing = actingOfferId === offer.id
          const canOpenTrade =
            offer.status === 'accepted' || offer.status === 'completed'
          const isOpeningTrade = openingTradeOfferId === offer.id

          const proposerCardNames = getProposerCardNames(offer)
          const receiverCardNames = getReceiverCardNames(offer)

          return (
            <View key={offer.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.cardTitle}>
                    {isReceived ? '受信した提案' : '送信した提案'}
                  </Text>
                  <Text style={styles.cardDate}>{formatDate(offer.created_at)}</Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    getStatusBadgeStyle(offer.status).badge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      getStatusBadgeStyle(offer.status).text,
                    ]}
                  >
                    {OFFER_STATUS_LABELS[offer.status]}
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

              <View style={styles.tradeRow}>
                <View style={styles.tradeCardBox}>
                  <Text style={styles.tradeLabel}>
                    {isReceived ? '相手が出すカード' : 'あなたが出すカード'}
                  </Text>
                  <Text style={styles.tradeValue}>{proposerCardNames}</Text>
                </View>

                <Text style={styles.tradeArrow}>⇄</Text>

                <View style={styles.tradeCardBox}>
                  <Text style={styles.tradeLabel}>
                    {isReceived ? 'あなたが受け取るカード' : '相手が出すカード'}
                  </Text>
                  <Text style={styles.tradeValue}>{receiverCardNames}</Text>
                </View>
              </View>

              {offer.message ? (
                <View style={styles.messageBox}>
                  <Text style={styles.messageLabel}>メッセージ</Text>
                  <Text style={styles.messageText}>{offer.message}</Text>
                </View>
              ) : null}

              {isPendingReceived ? (
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
                    onPress={() => handleAccept(offer.id)}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isActing ? '処理中...' : '承認'}
                    </Text>
                  </Pressable>
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
                        : offer.status === 'completed'
                        ? '取引詳細を見る'
                        : '取引画面へ進む'}
                    </Text>
                  </Pressable>

                  <View style={styles.noteBox}>
                    <Text style={styles.noteText}>{getFooterNote(offer.status)}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.noteBox}>
                  <Text style={styles.noteText}>{getFooterNote(offer.status)}</Text>
                </View>
              )}
            </View>
          )
        })}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.screenHeader}>
          <Text style={styles.screenTitle}>取引</Text>
          <Text style={styles.screenSubtitle}>
            受信した提案の確認、承認、辞退、進行中取引の確認ができます
          </Text>
        </View>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === 'received' && styles.activeTab]}
            onPress={() => setActiveTab('received')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'received' && styles.activeTabText,
              ]}
            >
              受信{pendingReceivedCount > 0 ? ` (${pendingReceivedCount})` : ''}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tab, activeTab === 'sent' && styles.activeTab]}
            onPress={() => setActiveTab('sent')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'sent' && styles.activeTabText,
              ]}
            >
              送信
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

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {refreshing && !loading ? (
            <View style={styles.refreshBox}>
              <ActivityIndicator size="small" color="#6D5EF5" />
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

  if (profile.username && profile.username.trim().length > 0) {
    return profile.username
  }

  if (profile.full_name && profile.full_name.trim().length > 0) {
    return profile.full_name
  }

  return 'ユーザー'
}

function getProposerCardNames(offer: Offer): string {
  const targetCardId = offer.target_card?.id

  const proposerItems =
    offer.items?.filter((item) => item.card_id !== targetCardId) ?? []

  if (proposerItems.length === 0) {
    return 'カード情報なし'
  }

  return proposerItems
    .map((item) => item.card?.name || 'カード情報なし')
    .join(' / ')
}

function getReceiverCardNames(offer: Offer): string {
  const targetName = offer.target_card?.name

  if (targetName && targetName.trim().length > 0) {
    return targetName
  }

  return 'カード情報なし'
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

function getFooterNote(status: OfferStatus): string {
  if (status === 'accepted') {
    return 'この提案は承認済みです。取引画面へ進んで発送・受取を管理できます。'
  }

  if (status === 'declined') {
    return 'この提案は辞退済みです。'
  }

  if (status === 'cancelled') {
    return 'この提案はキャンセル済みです。'
  }

  if (status === 'completed') {
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7FB',
  },
  container: {
    flex: 1,
    backgroundColor: '#F7F7FB',
  },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#18181B',
  },
  screenSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#71717A',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
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
    backgroundColor: '#6D5EF5',
    borderColor: '#6D5EF5',
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
    backgroundColor: '#F5F3FF',
  },
  statusPendingText: {
    color: '#6D28D9',
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
  tradeLabel: {
    fontSize: 12,
    color: '#8A8499',
  },
  tradeValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    color: '#18181B',
  },
  tradeArrow: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6D5EF5',
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
    backgroundColor: '#6D5EF5',
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
    backgroundColor: '#6D5EF5',
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
})