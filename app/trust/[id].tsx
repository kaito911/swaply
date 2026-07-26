// app/trust/[id].tsx
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    FlatList,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CardItem } from '@/components/CardItem'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SectionHeader } from '@/components/SectionHeader'
import { TroubleDot } from '@/components/TroubleDot'
import { TrustFactPanel } from '@/components/TrustFactPanel'
import { colors, fontSize, spacing } from '@/constants/theme'
import { fetchProfile, fetchUserCards, fetchUserTrust } from '@/lib/supabase'
import { Card, Profile, UserTrust } from '@/lib/types'
import { useAuthContext } from '@/providers/AuthProvider'

// ─────────────────────────────────────────
// メイン画面
// ─────────────────────────────────────────

export default function TrustProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuthContext()
  // 自分のプロフィールでは通報リンクを出さない (自己通報は RPC でも弾かれる)。
  const isOwnProfile = session?.user?.id != null && session.user.id === id
  const [profile, setProfile] = useState<Profile | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [trust, setTrust] = useState<UserTrust | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id == null) return
    Promise.all([
      fetchProfile(id),
      fetchUserCards(id),
      // Trust (get_user_trust)。失敗しても画面を止めず null=全項目「—」表示。
      fetchUserTrust(id).catch(() => null),
    ]).then(([p, c, t]) => {
      setProfile(p)
      setCards(c)
      setTrust(t)
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Trustプロフィール" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    )
  }

  if (profile == null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Trustプロフィール" />
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>プロフィールが見つかりませんでした</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Trustプロフィール" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ─ プロフィールヘッダー ─ */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrap}>
            {profile.avatar_url != null ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {(profile.handle || profile.display_name || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            {/* トラブル色サイン (数字なし・色のみ・0は非表示)。共通 TroubleDot。 */}
            <TroubleDot stage={trust?.trouble_stage ?? 0} />
          </View>

          <Text style={styles.username}>{profile.handle}</Text>

          {profile.display_name != null && (
            <Text style={styles.displayName}>{profile.display_name}</Text>
          )}
        </View>

        {/* ─ Trust 4項目 (交換人数/取引回数/発送まで/直近ログイン)。値は get_user_trust。
            トラブル件数・発送遵守率(率)は出さない (色サインで表現・率禁止)。 ─ */}
        <View style={styles.trustPanelWrap}>
          <TrustFactPanel trust={trust} />
        </View>

        {/* ─ 出品中カード ─ */}
        <View style={styles.cardsSection}>
          <SectionHeader
            title="出品中のカード"
            subtitle={`${cards.length}件`}
          />
          {cards.length === 0 ? (
            <Text style={styles.emptyText}>
              現在出品中のカードはありません
            </Text>
          ) : (
            <FlatList
              horizontal
              data={cards}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <CardItem card={{ ...item, owner: profile }} />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardsList}
              ItemSeparatorComponent={() => (
                <View style={{ width: spacing.sm }} />
              )}
            />
          )}
        </View>

        {/* 通報導線: 自分以外のプロフィールで「このユーザーを報告」(content_reports)。
            出品カード群と控えめな区切り線で分離し、最下部で自然に見えるようにする。 */}
        {!isOwnProfile && (
          <View style={styles.reportLinkSection}>
            <View style={styles.reportLinkDivider} />
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/report' as never,
                  params: {
                    targetType: 'user',
                    targetId: id,
                    targetLabel: profile.handle ?? profile.display_name ?? '',
                  } as never,
                })
              }
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.reportLinkText}>このユーザーを報告する</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* スクロール下余白。提案は「出品中のカードをタップ→出品詳細→提案」が正規導線
            (先頭カード固定の暫定CTAは削除・A2解消)。 */}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.base,
  },
  errorText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  backLink: {
    fontSize: fontSize.base,
    color: colors.primary,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },

  // ── プロフィールヘッダー
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  // アバターと色サイン(右下 absolute)を重ねる相対コンテナ。margin はここに移設。
  avatarWrap: {
    width: 88,
    height: 88,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustPanelWrap: {
    paddingHorizontal: spacing.base,
    marginBottom: spacing.xl,
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
  },
  username: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  displayName: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  // ── 出品カード
  cardsSection: {
    marginBottom: spacing.xl,
  },
  cardsList: {
    paddingHorizontal: spacing.base,
  },
  emptyText: {
    paddingHorizontal: spacing.base,
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  // 通報導線 (控えめ・中央)。出品カード群と区切り線で分離。
  reportLinkSection: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  reportLinkDivider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  reportLinkText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    textDecorationLine: 'underline',
  },
})