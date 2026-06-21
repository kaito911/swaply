# カラー統一 ロードマップ（確定版）

最終更新: 2026-06-21
ステータス: Phase 1 実装済みだが stash 退避中（週末オタクFB待ち）

## 大前提
- 会場モードの色温度（indigo #4B3BD6）を正として、アプリ全体を統一する。
- 色は計算（コントラスト比）だけで決めない。ターゲットユーザー（オタク友達)に
  実機で見てもらって最終判断する。明るすぎ/うるさい/安っぽいは現場の目で確かめる。

## カラートークン（現状の実態）
- グローバル colors.primary = #1F2A52(navy) ← constants/theme.ts:20
- 会場モード VENUE_COLORS.brand = #4B3BD6(indigo) ← app/venue/[id].tsx:67-72（ローカル定数）
- accent/coral = #FF3E6C, accentTint = #FFE6EC（会場配下3ファイルのみで使用、グローバル未定義）
- app/trade/[offerId].tsx に #6D5EF5(legacy purple) が9箇所ハードコード
- 「会場の青」と「ホームの青」は別色だった（indigo vs navy）

## Phase 1: indigo統一（実装済み・stash退避中）
- colors.primary: #1F2A52 → #4B3BD6
- colors.primaryDark: #141B36 → #3D2FB0
- app/trade/[offerId].tsx の #6D5EF5 全9箇所 → colors.primary
- stash名: "Phase1-indigo-統一-週末FB待ち"（git stash list で確認）
- 復元: git stash pop（または apply stash@{0}）→ typecheck/lint → commit
- 保留理由: 実機で「明るすぎる気がする」。週末オタクFBで判断してから本番投入。
- コントラスト: 白文字 on #4B3BD6 = 7.3:1（WCAG AAA通過、技術的には問題なし）

## Phase 2: トークン一元化
- constants/theme.ts に accent='#FF3E6C' / accentTint='#FFE6EC' / brand='#4B3BD6' 追加
- 会場配下のローカル定数（VENUE_COLORS / ACCENT_COLOR / 直hardcode）を colors.* 参照に置換
- 目的: 色定義をtheme.ts 1箇所に集約。会場も全体も同じトークンを見る（二度と分岐させない）

## Phase 3: coral解禁
- PrimaryCTA に tone?:'navy'|'coral' prop追加（default navyで既存不変）
- 感情を出したいCTAだけ tone="coral"（候補: 出品詳細「交換を提案する」、求リスト「求商品を追加」、出品FAB）
- 原則: solid brand color は primary CTA のみ。色の規律を壊さない。

## Phase 4: empty state・視線設計（わくわく化の残り）
- 検索の空状態（人気キャラサジェスト）
- 求リストの空状態（使い方の一言）
- ホームの視線の流れ（セクションの重み付け）

## 実行の鉄則
- 1 Phaseずつ。色を2軸同時に変えない（切り分け不能になる）。
- 各Phaseは 実機確認 → CI green → commit で閉じてから次へ。
- Phase 1〜2が土台、Phase 3〜4が感情。土台を固めてから感情を乗せる。
