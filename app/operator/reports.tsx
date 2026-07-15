// app/operator/reports.tsx
//
// 運営 (operator) 用のコンテンツ通報一覧。get_content_reports RPC (operator_accounts ゲート)
// で未対応通報を取得し、各通報を「出品を非公開にする」/「却下」で対処する。
//
// ★アクセス制御は二重ゲート:
//   1. mount 時 isOperator() で判定 → 非 operator には一覧を一切表示しない (権限なし表示)。
//   2. get_content_reports / operator_resolve_content_report RPC 自体が非 operator を
//      NOT_OPERATOR で弾く (クライアント判定を信用しないサーバ側の砦)。
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import {
  getContentReports,
  isOperator,
  operatorResolveContentReport,
  type ContentReportCategory,
  type ContentReportRow,
} from '@/lib/supabase'
import { useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const CATEGORY_LABELS: Record<ContentReportCategory, string> = {
  prohibited_item: '禁止・違法な出品',
  counterfeit: '偽物・権利侵害',
  inappropriate_image: '不適切な画像',
  spam: 'スパム・宣伝',
  miscategorized: '内容と違う（誤カテゴリ）',
  harassment: '嫌がらせ・迷惑行為',
  monetary_demand: '金銭を要求された',
  impersonation: 'なりすまし',
  inappropriate_profile: '不適切なプロフィール',
  other: 'その他',
}

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}/${mm}/${dd} ${hh}:${mi}`
}

export default function OperatorReportsScreen() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<ContentReportRow[]>([])
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const op = await isOperator()
      setAllowed(op)
      if (!op) {
        setReports([])
        return
      }
      const rows = await getContentReports('open')
      setReports(rows)
    } catch (err) {
      console.error('[operator/reports][load]', err)
      // NOT_OPERATOR 等はサーバ側の砦。権限なし扱いに倒す。
      const raw = err instanceof Error ? err.message : ''
      if (raw === 'NOT_OPERATOR') {
        setAllowed(false)
      }
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const resolve = useCallback(
    async (report: ContentReportRow, action: 'unpublish' | 'dismiss') => {
      try {
        setResolvingId(report.id)
        await operatorResolveContentReport(report.id, action)
        // 対処後は open から外れるので一覧から除去。
        setReports((prev) => prev.filter((r) => r.id !== report.id))
      } catch (err) {
        console.error('[operator/reports][resolve]', err)
        Alert.alert('エラー', '対処に失敗しました。時間をおいてお試しください。')
      } finally {
        setResolvingId(null)
      }
    },
    [],
  )

  const onPressReport = useCallback(
    (report: ContentReportRow) => {
      const isCard = report.reported_card_id != null
      const buttons: Parameters<typeof Alert.alert>[2] = [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '却下する',
          onPress: () => void resolve(report, 'dismiss'),
        },
      ]
      // 出品通報のみ「非公開にする」を出す (ユーザー通報に unpublish は無い)。
      if (isCard) {
        buttons.push({
          text: '出品を非公開にする',
          style: 'destructive',
          onPress: () => void resolve(report, 'unpublish'),
        })
      }
      Alert.alert(
        '通報への対処',
        isCard
          ? 'この出品を非公開 (フィード・検索から除外) にするか、通報を却下します。'
          : 'この通報を却下します。',
        buttons,
      )
    },
    [resolve],
  )

  const renderItem = useCallback(
    ({ item }: { item: ContentReportRow }) => {
      const isCard = item.reported_card_id != null
      const targetName = isCard
        ? item.card_name ?? '（削除された出品）'
        : item.reported_user_handle ?? item.reported_user_display_name ?? '（不明なユーザー）'
      return (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => onPressReport(item)}
          disabled={resolvingId === item.id}
        >
          <View style={styles.cardTop}>
            {isCard && item.card_image_url != null ? (
              <Image source={{ uri: item.card_image_url }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Text style={styles.thumbFallbackText}>{isCard ? '出品' : 'ユーザー'}</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              <View style={styles.typePillRow}>
                <View style={[styles.typePill, isCard ? styles.typePillCard : styles.typePillUser]}>
                  <Text style={styles.typePillText}>{isCard ? '出品' : 'ユーザー'}</Text>
                </View>
                {isCard && item.card_is_public === false && (
                  <View style={[styles.typePill, styles.typePillMuted]}>
                    <Text style={styles.typePillText}>非公開済</Text>
                  </View>
                )}
              </View>
              <Text style={styles.targetName} numberOfLines={2}>
                {targetName}
              </Text>
              <Text style={styles.category}>{CATEGORY_LABELS[item.category]}</Text>
            </View>
          </View>
          {item.note != null && item.note !== '' && (
            <Text style={styles.note} numberOfLines={4}>
              {item.note}
            </Text>
          )}
          <Text style={styles.meta}>
            通報者: {item.reporter_handle ?? '不明'}・{formatDateTime(item.created_at)}
          </Text>
          {resolvingId === item.id && (
            <ActivityIndicator size="small" color={colors.primary} style={styles.rowLoader} />
          )}
        </Pressable>
      )
    },
    [onPressReport, resolvingId],
  )

  // 権限なし: 非 operator には一覧を一切見せない。
  if (allowed === false) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="通報管理" />
        <View style={styles.center}>
          <Text style={styles.deniedText}>この画面を表示する権限がありません。</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (loading && allowed == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="通報管理" />
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="通報管理" />
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.emptyText}>未対応の通報はありません。</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: spacing.lg,
  },
  deniedText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  listContent: {
    padding: spacing.base,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardPressed: { opacity: 0.7 },
  cardTop: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFallbackText: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: fontWeight.semibold,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  typePillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  typePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  typePillCard: { backgroundColor: '#EEF2FF' },
  typePillUser: { backgroundColor: '#FEF3C7' },
  typePillMuted: { backgroundColor: colors.backgroundMuted },
  typePillText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  targetName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  category: {
    fontSize: fontSize.sm,
    color: colors.error,
    fontWeight: fontWeight.semibold,
  },
  note: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 19,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  meta: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  rowLoader: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
})
