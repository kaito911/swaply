// app/offer-insights.tsx
// 開発用・成立ログ確認画面。ユーザー向けではない。数値はすべて近似値。

import { fetchOfferOutcomeLogs, summarizeOfferOutcomes } from '@/lib/supabase'
import {
  OfferOutcomeLog,
  OfferOutcomeSummary,
  TRUST_BADGE_LABELS,
  TrustBadgeLevel,
} from '@/lib/types'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { useAuthContext } from '@/providers/AuthProvider'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const TRUST_LEVELS: TrustBadgeLevel[] = ['green', 'trial_blue', 'blue', 'gold_blue']

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionHeader}>{children}</Text>
}

function Block({ children }: { children: React.ReactNode }) {
  return <View style={styles.block}>{children}</View>
}

function SummarySection({ summary }: { summary: OfferOutcomeSummary }) {
  return (
    <>
      <Block>
        <SectionHeader>全体</SectionHeader>
        <StatRow label="総提案数" value={`${summary.total}`} />
        <StatRow label="承認" value={`${summary.accepted}`} />
        <StatRow label="辞退" value={`${summary.declined}`} />
        <StatRow label="キャンセル" value={`${summary.cancelled}`} />
        <StatRow label="pending" value={`${summary.pending}`} />
        <StatRow label="承認率" value={pct(summary.acceptRate)} />
      </Block>

      <Block>
        <SectionHeader>メッセージ有無別</SectionHeader>
        <StatRow
          label="あり"
          value={`${summary.withMessage.accepted}/${summary.withMessage.total} (${pct(summary.withMessage.acceptRate)})`}
        />
        <StatRow
          label="なし"
          value={`${summary.withoutMessage.accepted}/${summary.withoutMessage.total} (${pct(summary.withoutMessage.acceptRate)})`}
        />
      </Block>

      <Block>
        <SectionHeader>調整金許可別（代理値）</SectionHeader>
        <StatRow
          label="許可あり"
          value={`${summary.adjustmentAllowed.accepted}/${summary.adjustmentAllowed.total} (${pct(summary.adjustmentAllowed.acceptRate)})`}
        />
        <StatRow
          label="許可なし"
          value={`${summary.adjustmentNotAllowed.accepted}/${summary.adjustmentNotAllowed.total} (${pct(summary.adjustmentNotAllowed.acceptRate)})`}
        />
      </Block>

      <Block>
        <SectionHeader>proposer Trust帯別</SectionHeader>
        {TRUST_LEVELS.map((level) => {
          const d = summary.byProposerTrust[level]
          return (
            <StatRow
              key={level}
              label={TRUST_BADGE_LABELS[level]}
              value={`${d.accepted}/${d.total} (${pct(d.acceptRate)})`}
            />
          )
        })}
      </Block>

      <Block>
        <SectionHeader>receiver Trust帯別</SectionHeader>
        {TRUST_LEVELS.map((level) => {
          const d = summary.byReceiverTrust[level]
          return (
            <StatRow
              key={level}
              label={TRUST_BADGE_LABELS[level]}
              value={`${d.accepted}/${d.total} (${pct(d.acceptRate)})`}
            />
          )
        })}
      </Block>
    </>
  )
}

function LogItem({ log }: { log: OfferOutcomeLog }) {
  const offeredNames = log.offered_card_names.join(', ') || '—'
  const createdDate = log.offer_created_at.slice(0, 10)
  return (
    <View style={styles.logItem}>
      <View style={styles.logHeader}>
        <Text style={styles.logDate}>{createdDate}</Text>
        <View style={[styles.logStatusBadge, statusStyle(log.offer_status)]}>
          <Text style={styles.logStatusText}>{log.offer_status}</Text>
        </View>
        {log.trade_id != null && (
          <View style={styles.logTradeBadge}>
            <Text style={styles.logTradeText}>trade</Text>
          </View>
        )}
      </View>
      <Text style={styles.logTarget} numberOfLines={1}>
        ← {log.target_card_name ?? log.target_card_id}
      </Text>
      <Text style={styles.logOffered} numberOfLines={1}>
        → {offeredNames}
      </Text>
      <View style={styles.logMeta}>
        <Text style={styles.logMetaText}>
          proposer:{log.proposer_trust_level}  receiver:{log.receiver_trust_level ?? '—'}
        </Text>
        {log.has_message && <Text style={styles.logMetaText}>  msg✓</Text>}
        {log.target_card_allows_adjustment && <Text style={styles.logMetaText}>  adj✓</Text>}
      </View>
    </View>
  )
}

function statusStyle(status: string) {
  switch (status) {
    case 'accepted':
    case 'completed':
      return styles.statusAccepted
    case 'declined':
      return styles.statusDeclined
    case 'cancelled':
      return styles.statusCancelled
    default:
      return styles.statusPending
  }
}

export default function OfferInsightsScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? undefined

  const [logs, setLogs] = useState<OfferOutcomeLog[]>([])
  const [summary, setSummary] = useState<OfferOutcomeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchOfferOutcomeLogs(userId)
      setLogs(data)
      setSummary(summarizeOfferOutcomes(data))
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }, [userId])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load().finally(() => setRefreshing(false))
  }, [load])

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>成立ログ</Text>
        <Text style={styles.devNote}>
          開発用。承認時刻・辞退時刻・調整金情報は近似値または代理値。
        </Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error != null ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : summary == null || logs.length === 0 ? (
          <Text style={styles.emptyText}>データなし</Text>
        ) : (
          <>
            <SummarySection summary={summary} />

            <Text style={styles.logsHeader}>ログ一覧（最新{logs.length}件）</Text>
            {logs.map((log) => (
              <LogItem key={log.offer_id} log={log} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'],
  },

  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  devNote: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.base,
    lineHeight: 16,
  },

  loadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  errorWrap: {
    paddingVertical: 24,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    paddingVertical: 24,
  },

  // ── blocks ──
  block: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  statLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },

  // ── log list ──
  logsHeader: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  logItem: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  logDate: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginRight: spacing.xs,
  },
  logStatusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  logStatusText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
    color: colors.textInverse,
  },
  logTradeBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.primary,
  },
  logTradeText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
    color: colors.textInverse,
  },
  logTarget: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
    marginBottom: 2,
  },
  logOffered: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  logMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  logMetaText: {
    fontSize: 10,
    color: colors.textTertiary,
  },

  // status badge colors
  statusAccepted: { backgroundColor: colors.success },
  statusDeclined: { backgroundColor: colors.error },
  statusCancelled: { backgroundColor: colors.textTertiary },
  statusPending: { backgroundColor: colors.textSecondary },
})
