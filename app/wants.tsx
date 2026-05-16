// app/wants.tsx
// 「いいね」一覧画面 (DB テーブル名は wanted_cards 維持、UI 命名は「いいね」)。
// アクセス動線:
//   1. mypage 設定リンク (label "いいね")
//   2. 各タブの右上 ♡ アイコン (HeaderActions)
import { ScreenHeader } from '@/components/ScreenHeader'
import { archiveWantedCard, fetchMyWantedCards } from '@/lib/supabase'
import { WantedCard } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'
import { colors } from '@/constants/theme'
import { useFocusEffect } from 'expo-router'
import React, { useCallback, useState } from 'react'
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

function formatDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}/${mm}/${dd}`
}

export default function WantsScreen() {
  const { session } = useAuthContext()
  const userId = session?.user?.id ?? null

  const [wants, setWants] = useState<WantedCard[]>([])
  const [loading, setLoading] = useState(true)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (userId == null) {
      setWants([])
      setLoading(false)
      return
    }
    setLoading(true)
    const data = await fetchMyWantedCards(userId)
    setWants(data)
    setLoading(false)
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const handleArchive = (want: WantedCard) => {
    Alert.alert(
      'いいねを削除しますか？',
      `「${want.card_name}」を一覧から外します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              setArchivingId(want.id)
              await archiveWantedCard(want.id)
              setWants((prev) => prev.filter((w) => w.id !== want.id))
            } catch {
              Alert.alert('エラー', '削除に失敗しました')
            } finally {
              setArchivingId(null)
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScreenHeader title="いいね" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 説明文 */}
        <Text style={styles.note}>
          いいねした商品と一致する出品がホームの「成立しやすい交換」に優先表示されます。
        </Text>

        {wants.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>いいねした商品はまだありません</Text>
            <Text style={styles.emptySub}>
              出品詳細画面から「いいねに追加」でここに登録できます。
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {wants.map((want) => {
              const isArchiving = archivingId === want.id
              const sub = [want.series, want.group_name, want.member_name]
                .filter(Boolean)
                .join(' · ')

              return (
                <View key={want.id} style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {want.card_name}
                    </Text>
                    {sub.length > 0 && (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {sub}
                      </Text>
                    )}
                    <Text style={styles.dateText}>{formatDate(want.created_at)}</Text>
                  </View>

                  <Pressable
                    style={[styles.removeButton, isArchiving && styles.removeButtonDisabled]}
                    onPress={() => handleArchive(want)}
                    disabled={isArchiving}
                  >
                    <Text style={styles.removeButtonText}>
                      {isArchiving ? '...' : '削除'}
                    </Text>
                  </Pressable>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7FB',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontSize: 13,
    lineHeight: 20,
    color: '#71717A',
    marginBottom: 20,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#18181B',
    textAlign: 'center',
  },
  emptySub: {
    marginTop: 8,
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    gap: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECE8FA',
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#18181B',
  },
  cardSub: {
    marginTop: 3,
    fontSize: 11,
    color: '#8A8499',
  },
  dateText: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textTertiary,
  },
  removeButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FAFAFA',
  },
  removeButtonDisabled: {
    opacity: 0.4,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B',
  },
})
