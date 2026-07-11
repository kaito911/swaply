// app/trade/history.tsx
//
// 取引履歴の全件一覧 (縦の行リスト)。マイページ「取引履歴 → すべて見る」の受け皿。
// 旧: すべて見るが /(tabs)/trades (取引管理タブ) へ誤遷移していたのを是正。
//
// 各行 = 取引レコード (日付 / 相手 / status)。カードではないため /list (card グリッド) には
// 載せず専用ルート。取引 (trade) を持つ行タップ → 既存 /trade/[offerId] (交換したカード
// 同士を表示する履歴詳細は既存画面が満たす)。辞退など trade なし行は非タップ。
//
// データは fetchMyOffers を流用 (DB 追加なし)。マイページ renderHistory の行様式を踏襲。
import { ScreenHeader } from '@/components/ScreenHeader'
import { fetchMyOffers } from '@/lib/supabase'
import { Offer } from '@/lib/types'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuthContext } from '@/providers/AuthProvider'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function TradeHistoryScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (userId == null) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const all = await fetchMyOffers(userId)
      setOffers(
        all.filter(
          (o) =>
            o.status === 'accepted' ||
            o.status === 'declined' ||
            (o.trade != null && o.trade.status != null),
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const rows = useMemo(() => offers, [offers])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="取引履歴" />
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>取引履歴はまだありません</Text>
          <Text style={styles.emptySub}>交換が成立すると、ここに記録されます</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: offer }) => {
            const isProposer = offer.proposer_user_id === userId
            const counterHandle = isProposer
              ? (offer.target_card?.owner?.handle ?? '相手')
              : (offer.proposer?.handle ?? '相手')

            const tradeStatus = offer.trade?.status
            const statusLabel =
              tradeStatus === 'completed' ? '完了' :
              tradeStatus === 'cancelled' ? 'キャンセル' :
              offer.status === 'accepted' ? '進行中' :
              offer.status === 'declined' ? '辞退' : offer.status

            const statusColor =
              statusLabel === '完了' ? colors.success :
              statusLabel === 'キャンセル' || statusLabel === '辞退' ? colors.error :
              colors.primary
            const statusBg =
              statusLabel === '完了' ? colors.successBg :
              statusLabel === 'キャンセル' || statusLabel === '辞退' ? colors.errorBg :
              colors.tagInfoBg

            // trade を持つ行のみ詳細 (交換カード同士) へ遷移可能。辞退等は非タップ。
            const hasTrade = offer.trade != null
            const openDetail = () =>
              router.push({ pathname: '/trade/[offerId]', params: { offerId: offer.id } } as never)

            return (
              <Pressable
                style={styles.row}
                onPress={hasTrade ? openDetail : undefined}
                disabled={!hasTrade}
              >
                <View style={styles.meta}>
                  <Text style={styles.date}>
                    {new Date(offer.created_at).toLocaleDateString('ja-JP')}
                  </Text>
                  <Text style={styles.handle}>@{counterHandle}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
                {hasTrade && (
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                )}
              </Pressable>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.textSecondary },
  emptySub: { fontSize: fontSize.xs, color: colors.textTertiary, textAlign: 'center' },
  content: { padding: spacing.base, paddingBottom: 120 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  meta: { flex: 1, minWidth: 0, gap: 2 },
  date: { fontSize: fontSize.xs, color: colors.textTertiary },
  handle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
})
