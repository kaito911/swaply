// app/oshi-edit.tsx
// 推し編集画面
// マイページ → 推し編集 で遷移
//
// 選択フォーム (グループ + メンバー1人) と保存・キーボード被り対策は
// 共有コンポーネント <OshiPicker> に抽出済 (オンボーディングと共用)。本画面は
// ヘッダー / 読み込み・失敗状態 / 登録済み一覧 (削除) と、OshiPicker への配線のみを持つ。
//   - 説明カードは header prop、登録済み一覧は footer prop で OshiPicker の同一スクロールに載せる
//     (従来どおり 1 スクロールで説明→フォーム→一覧が並ぶ挙動を保つ)。
//   - 保存は OshiPicker が addUserOshi を呼び、onAdded で新規 item を受けて一覧へ追記する。
import { deleteUserOshi, fetchUserOshi } from '@/lib/supabase'
import { UserOshi } from '@/lib/types'
import { getCharacterById, getWorkById } from '@/lib/master'
import { OshiPicker } from '@/components/OshiPicker'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/** slug (または自由入力文字列) を表示名へ。master 未ヒット時は素通り (自由入力/旧データ)。 */
function groupLabelOf(groupSlug: string): string {
  return getWorkById(groupSlug)?.display_name_ja ?? groupSlug
}
function memberLabelOf(memberSlug: string): string {
  return getCharacterById(memberSlug)?.display_name_ja ?? memberSlug
}

export default function OshiEditScreen() {
  const { session, loading: authLoading } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [items, setItems] = useState<UserOshi[]>([])
  const [loading, setLoading] = useState(true)
  // A1: 読み込み失敗フラグ。fetchUserOshi が throw しても「まだ推しが登録されていません」の
  //   嘘空表示にせず error+再試行を出す (fetchUserOshi も throw 化済)。
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(() => {
    if (authLoading) return
    if (userId == null) { // userId null のとき setLoading(false) を呼ぶ
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadFailed(false)
    fetchUserOshi(userId)
      .then(setItems)
      .catch((e) => {
        console.error('[OshiEditScreen][load]', e)
        setLoadFailed(true)
      })
      .finally(() => setLoading(false))
  }, [userId, authLoading])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const handleDelete = (item: UserOshi) => {
    const groupLabel = groupLabelOf(item.group_name)
    const label = item.member_name != null
      ? `${groupLabel} / ${memberLabelOf(item.member_name)}`
      : groupLabel
    Alert.alert(
      '削除しますか？',
      `「${label}」を推しから削除します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUserOshi(item.id)
              setItems((prev) => prev.filter((i) => i.id !== item.id))
            } catch (error) {
              console.error('[OshiEditScreen][handleDelete]', error)
              Alert.alert('エラー', '削除に失敗しました。')
            }
          },
        },
      ]
    )
  }

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    )
  }

  if (loadFailed) {
    // ★取得失敗: 「まだ推しが登録されていません」(0件) と区別し、固まらせず再試行。
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.customHeader}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>推し編集</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorBox}>
          <Text style={styles.retryText}>読み込みに失敗しました</Text>
          <Pressable style={styles.retryButton} onPress={() => load()}>
            <Text style={styles.retryButtonText}>再試行</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.customHeader}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>推し編集</Text>
        <View style={styles.headerRight} />
      </View>

      <OshiPicker
        userId={userId}
        onAdded={(item) => setItems((prev) => [...prev, item])}
        header={
          <View style={styles.descCard}>
            <Text style={styles.descText}>
              登録した推しの出品を、ホームでまとめて表示します。
            </Text>
          </View>
        }
        footer={
          items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="heart-outline" size={40} color={colors.border} />
              <Text style={styles.emptyText}>まだ推しが登録されていません</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              <Text style={styles.listLabel}>登録済み（{items.length}件）</Text>
              {items.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.itemRow,
                    index < items.length - 1 && styles.itemRowBorder,
                  ]}
                >
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemGroup}>{groupLabelOf(item.group_name)}</Text>
                    {item.member_name != null && (
                      <Text style={styles.itemMember}>{memberLabelOf(item.member_name)}</Text>
                    )}
                  </View>
                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item)}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </Pressable>
                </View>
              ))}
            </View>
          )
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F7FB',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7FB',
  },
  // A1: 読み込み失敗時の再試行UI (home/wants と同一トークン)。
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.base,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundCard,
  },
  retryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  // ★ added: カスタムヘッダー
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 36,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  headerRight: {
    width: 36,
  },
  descCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  descText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F4F3FF',
  },
  itemMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemGroup: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemMember: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  deleteButton: {
    padding: 4,
    flexShrink: 0,
  },
})
