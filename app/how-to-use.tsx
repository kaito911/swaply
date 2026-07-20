// app/how-to-use.tsx
// 「Swaplyの使い方」説明書。マイページ設定リンクから到達。
// 初見ユーザーが迷わず使えるよう、機能を正確な粒度でテキスト説明する。
// ※実機スクショは後日差し込む前提。文言はドラフト（K確認前提）。
// root Stack の screenOptions が headerShown:false のため、画面内 ScreenHeader を使う。
import { ScreenHeader } from '@/components/ScreenHeader'
import { colors, fontSize, fontWeight, radius, spacing } from '@/constants/theme'
import React from 'react'
import { ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function P({
  children,
  style,
}: {
  children: React.ReactNode
  style?: StyleProp<TextStyle>
}) {
  return <Text style={[styles.p, style]}>{children}</Text>
}

export default function HowToUseScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Swaplyの使い方" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          Swaplyは、推し活グッズを手数料0円で交換できるアプリです。{'\n'}
          はじめての方は、この順番で読むとスムーズです。
        </Text>

        <Section title="Swaplyとは">
          <P>
            売買ではなく「交換」に特化したアプリです。あなたが譲りたいグッズと、
            求めているグッズをマッチングして、ファン同士で交換できます。手数料は0円です。
          </P>
        </Section>

        <Section title="出品のしかた">
          <P>下部中央の「出品」から出品できます。</P>
          <P>① グッズの現物写真を撮る（またはライブラリから選ぶ）</P>
          <P>② 作品・グループを選ぶ</P>
          <P>③ メンバー／キャラ・グッズの種類を選ぶ</P>
          <P>④ 「譲るもの」と「求めるもの」を設定して出品</P>
          <P style={styles.note}>
            ※写真はトリミングされません（アップ／引きの2択で撮影）。公式画像やECサイトの画像は使えません。
          </P>
        </Section>

        <Section title="交換相手の見つけ方">
          <P>「検索」タブに、3つの探し方があります。</P>
          <P>・譲を探す：ほしいグッズを出品している人を探す</P>
          <P>・求を探す：あなたが譲れるものを求めている人を探す</P>
          <P>・マッチ：あなたの「譲」と「求」が噛み合う相手を探す</P>
          <P>
            ホームの「マッチ率が高い交換」にも、あなたと噛み合う候補が自動で表示されます。
          </P>
        </Section>

        <Section title="交換の流れ">
          <P>① 気になる出品を開いて「交換を提案」する</P>
          <P>② 相手が承認すると交換成立</P>
          <P>③ お互いに発送する（郵送の場合、住所は交換成立後に相手へ共有されます）</P>
          <P>④ 受け取ったら「受取確認」→ 取引完了</P>
        </Section>

        <Section title="会場モードとは">
          <P>
            ライブ会場・ポップアップ・コラボカフェなどで、その場にいる人と直接交換できるモードです。
            「会場」タブから、参加中の会場の供給板を見て、現地での交換を進められます。
          </P>
        </Section>

        <Section title="Trust（信用）の見方">
          <P>Swaplyは星評価ではなく、事実にもとづく実績で相手を確認できます。</P>
          <P>・成立件数（これまで交換が成立した数）</P>
          <P>・発送遵守率（発送予定を守った割合）</P>
          <P>・返信中央値（返信の早さの目安）</P>
          <P>・トラブル件数</P>
          <P>感情的なレビューや順位づけはありません。確定した事実だけで相手を判断できます。</P>
          <P>また、ユーザーの状態を控えめな色のサインで示しています。</P>
          <P>・通常：問題なく取引されている状態です</P>
          <P>・注意／警告：過去にトラブルの記録がある状態です</P>
          <P>
            これは順位づけではなく、安心して取引するための目印です。取引を重ねて問題がなければ、状態は戻ります。
          </P>
        </Section>

        <Section title="基本ルール">
          <P>・出品画像は、自分で撮影した現物写真のみ（公式画像・EC画像の転載は禁止）</P>
          <P>・手元にない商品の出品や、ECサイトからの直送は禁止</P>
          <P>・金銭のやり取りは禁止（Swaplyは交換専用です）</P>
          <P>・「公式」「公認」「コラボ」など、権利者と公式関係にあると誤認させる表現は禁止</P>
          <P style={styles.note}>
            ※本アプリは非公式サービスです。詳しくはマイページの「利用規約」をご確認ください。
          </P>
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  lead: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  section: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  p: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  note: {
    color: colors.textTertiary,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
})
