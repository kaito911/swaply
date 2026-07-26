// app/legal/privacy.tsx
// プライバシーポリシー画面 (初期β、アプリ内表示用)

import { ScreenHeader } from '@/components/ScreenHeader'
import { SUPPORT_EMAIL } from '@/constants/contact'
import { colors, fontWeight, radius, spacing } from '@/constants/theme'
import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="プライバシーポリシー" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.headerTitle}>Swaply プライバシーポリシー</Text>
        <Text style={styles.headerMeta}>
          バージョン: v1{'\n'}
          最終更新日: 2026-06-04
        </Text>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            本ポリシーは、Swaply 公開リリース時点での取得・利用情報を記載しています。
            機能追加・法人化等に伴い改定する場合があります。
          </Text>
        </View>

        <Section title="1. 事業者情報">
          <P>・事業者: Swaply（個人事業）</P>
          <P>・代表者: 個人事業主（お問い合わせ窓口よりご請求いただけます）</P>
          <P>・所在地: 個人事業のため非掲載（お問い合わせ窓口よりご請求いただけます）</P>
          <P>・お問い合わせ窓口: {SUPPORT_EMAIL}</P>
        </Section>

        <Section title="2. 取得する情報">
          <H>2.1 アカウント登録時に取得する情報</H>
          <P>・メールアドレス</P>
          <P>・パスワード (Supabase Auth により暗号化保管、当社は平文で保持しません)</P>
          <P>・ユーザー名 (ハンドル) / 表示名</P>
          <P>・プロフィール画像 (任意)</P>
          <P>・推し作品 / グループ (任意)</P>

          <H>2.2 出品・取引時に取得する情報</H>
          <P>・出品グッズ情報 (タイトル、説明、状態、求めるもの等)</P>
          <P>・出品画像 (ユーザー本人が撮影した画像のみ許容)</P>
          <P>・提案メッセージ</P>
          <P>・取引履歴 (発送状況、受取確認、キャンセル理由等)</P>
          <P>
            ・配送情報 (氏名・郵便番号・住所): 本サービスでは郵送交換が成立した時点で取引相手に
            開示されます
          </P>

          <H>2.3 お問い合わせ・通報時に取得する情報</H>
          <P>・お問い合わせ内容</P>
          <P>・通報内容 (対象、理由、自由記述)</P>
          <P>・連絡先 (返信が必要な場合)</P>

          <H>2.4 自動的に取得する情報</H>
          <P>・端末情報 (OS、機種、アプリバージョン)</P>
          <P>・アクセスログ (IP アドレス、アクセス日時)</P>
          <P>・アプリ内行動ログ (画面遷移、機能利用状況)</P>
        </Section>

        <Section title="3. 利用目的">
          <P>取得した情報は、以下の目的で利用します。</P>
          <P>1. 本サービスの提供・運営 (ユーザー認証、出品・取引機能、マッチング表示)</P>
          <P>2. 本サービスの改善・新機能の開発 (集計データの分析、ユーザー体験向上)</P>
          <P>3. お問い合わせ・通報への対応</P>
          <P>4. 規約違反の調査・対応 (不適切投稿の削除、アカウント停止等)</P>
          <P>5. 取引相手との連絡支援 (氏名・住所の取引成立後開示等)</P>
          <P>6. 当社からのお知らせ送信 (アップデート情報、メンテナンス通知等)</P>
          <P>7. 法令に基づく対応 (発信者情報開示請求、税務処理等)</P>
        </Section>

        <Section title="4. 第三者提供">
          <P>当社は、以下の場合を除き、取得した情報を第三者に提供しません。</P>
          <P>・ユーザーの同意がある場合</P>
          <P>・取引成立により、ユーザー間で必要な情報 (氏名・住所等) が共有される場合</P>
          <P>・法令に基づく開示請求があった場合</P>
          <P>・人の生命・身体・財産の保護のために必要な場合</P>
          <P>・業務委託先に必要な範囲で提供する場合</P>

          <H>4.1 業務委託先</H>
          <P>当社は、本サービスの提供にあたり、以下の事業者にデータ処理を委託しています。</P>
          <P>・Supabase (Supabase Inc.): データベース・認証・ストレージ</P>
          <P>・その他: 画像配信、メール送信等の運営に必要な事業者</P>
          <P>委託先には、本ポリシーと同等以上の安全管理措置を求めています。</P>
        </Section>

        <Section title="5. 情報の管理">
          <P>
            当社は、取得した情報の漏えい・滅失・改ざんを防止するため、適切な安全管理措置を講じます。
          </P>
          <P>
            パスワードは Supabase Auth により暗号化保管され、当社が平文で保持することはありません。
          </P>
          <P>
            不要となった情報は、合理的な期間内に削除します
            (取引履歴は係争対応のため一定期間保持)。
          </P>
        </Section>

        <Section title="6. アカウント削除と情報の取り扱い">
          <P>
            ユーザーは、アプリ内の「アカウント削除」機能から、いつでもアカウントを削除することが
            できます。
          </P>
          <P>アカウント削除時、以下の情報を削除または匿名化します:</P>
          <P>・プロフィール情報 (ハンドル、表示名、アバター)</P>
          <P>・出品情報 (画像、説明等)</P>
          <P>・求情報</P>
          <P>以下の情報は法令対応・係争対応のため一定期間保持する場合があります:</P>
          <P>・取引履歴 (取引相手からの請求対応のため)</P>
          <P>・通報内容</P>
          <P>・規約違反の調査記録</P>
          <P>
            進行中の取引がある場合、アカウント削除は完了できません。取引完了またはキャンセル後に
            削除してください。
          </P>
        </Section>

        <Section title="7. 開示・訂正・利用停止の請求">
          <P>
            ユーザーは、当社が保有する自己の情報について、開示・訂正・利用停止を請求することが
            できます。
          </P>
          <P>・請求窓口: {SUPPORT_EMAIL}</P>
          <P>・本人確認: 不正請求防止のため、本人確認を行う場合があります。</P>
          <P>・対応期間: 請求受領から原則 30 日以内に対応します。</P>
        </Section>

        <Section title="8. 通報・権利侵害申立に関する情報の取り扱い">
          <P>
            ユーザーからの通報、権利侵害申立を受領した場合、当社は以下の対応を行います。
          </P>
          <P>・通報内容・申立内容を社内で共有 (運営チーム)</P>
          <P>・必要に応じて関係者 (出品者、取引相手) に通知</P>
          <P>・法令対応のため、通報者の情報を一定期間保持</P>
          <P>
            通報者の情報は、被通報者には原則開示しません
            (ただし法令対応・係争対応で必要な場合を除く)。
          </P>
        </Section>

        <Section title="9. クッキー・アクセス解析">
          <P>本サービスは、サービス改善のため、アクセス解析ツールを利用する場合があります。</P>
          <P>解析データには個人を特定する情報は含まれません。</P>
        </Section>

        <Section title="10. 未成年者の利用">
          <P>本サービスは 13 歳以上のユーザーを対象としています。</P>
          <P>未成年者の利用にあたっては、親権者の同意を得てください。</P>
        </Section>

        <Section title="11. 本ポリシーの変更">
          <P>
            当社は、法令変更・サービス内容の変更等に応じて、本ポリシーを変更することがあります。
          </P>
          <P>
            重要な変更がある場合、アプリ内通知またはメールにて事前に通知します。
          </P>
          <P>変更後の本ポリシーは、アプリ内に公開した時点から効力を有します。</P>
        </Section>

        <Section title="12. お問い合わせ">
          <P>本ポリシーに関するお問い合わせは、以下の窓口までお願いいたします。</P>
          <P>・お問い合わせメール: {SUPPORT_EMAIL}</P>
          <P>・権利侵害申立: {SUPPORT_EMAIL} (件名: 「Swaply 権利侵害申立」)</P>
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            本ポリシーは公開リリース時点のものです。{'\n'}
            将来、機能追加・法人化等に伴い改定する場合があります。
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─────────────────────────────────────────
// sub-components
// ─────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subheading}>{children}</Text>
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>
}

// ─────────────────────────────────────────
// styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  headerMeta: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: spacing.md,
    lineHeight: 17,
  },
  notice: {
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noticeText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subheading: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: 6,
  },
  footer: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 17,
  },
})
