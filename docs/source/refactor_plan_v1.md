# Swaply 改修指示書 v1.1

最終更新: 2026-05-04 / バージョン: v1.1 / 前提: feat/trade-pr1 ブランチ HEAD = 9937c22 (M5完了時点)

> **本ドキュメントの位置づけ**:
> Swaply のコードベース改修方針と残タスクを管理する Source of Truth。
> 過去の改修履歴と今後の改修候補を一元管理する。
>
> **関連ドキュメント**:
> - `docs/source/strategy_master_v2.md`（事業母艦v2）
> - `docs/source/strategy_v3.md`（戦略 v3）
> - `docs/source/pricing_v1.md`（料金確定版 v1）

---

## 0. 変更履歴

- **v1.0 (2026-04)**: 初版、E1〜E3 + H1〜H5 のスコープ定義
- **v1.1 (2026-05-04)**: M5 完了反映、M5.5 + M9〜M12 を新規追加

---

## 1. 完了済みタスク

### Part 1（緊急タスク）

#### E1: git 保全
- **コミット**: 12コミット
- **目的**: 開発環境の git 状態を整理し、安全な作業ブランチを確立
- **状態**: ✅ 完了

#### E2: adjustment_amount end-to-end 永続化
- **コミット**: 0b32a50
- **目的**: 調整金（差額）の入力UI復活、sign-encoded変換、DB schema拡張、RPC引き継ぎ
- **状態**: ✅ 完了
- **重要性**: Swaply 差別化の核機能

#### E3: swaply-review-package/ 削除
- **コミット**: 5e4f810
- **削除行数**: 9,715行
- **目的**: dead code の一掃、リポジトリのクリーン化
- **状態**: ✅ 完了

### Part 2（高優先タスク）

#### H1: Trust バッジ4段階化
- **コミット**: 0ec0f61 + bdd2b27 (hotfix)
- **目的**: Bronze/Silver/Gold → Green/Trial Blue/Blue/Gold Blue
- **変更**: 「達成/未達」「あとN件で」表現排除、🥉🥈🥇絵文字廃止
- **影響**: mypage Trust タブ全面刷新（事実列挙のみ）
- **状態**: ✅ 完了
- **教訓**: bdd2b27 hotfix の網羅不足が後の M5 で発見、CI 強制の必要性を裏付け

#### H2: trade併存解消
- **コミット**: 23c40e2
- **削除行数**: 668行
- **目的**: app/trade/[tradeId].tsx 削除（dead route）
- **状態**: ✅ 完了

#### H3: DEPRECATED削除
- **コミット**: b75c30b
- **削除行数**: 566行
- **目的**: offers/profile/fab.tsx 削除 + _layout.tsx 整理
- **状態**: ✅ 完了

#### H4: Smartレーン暫定
- **コミット**: 298fa54
- **目的**: 「計算中」嘘表記を「準備中」プレースホルダーへ
- **変更**: infoBox削除、Supplyレーン誘導CTA追加
- **状態**: ✅ 完了

#### H4補修: (tabs)label修正
- **コミット**: 52e3e48
- **目的**: 8画面で headerBackButtonDisplayMode: 'minimal' を global 設定
- **状態**: ✅ 完了
- **教訓**: 個別管理から global hoist への構造的修正

#### H5: FEATURE_FLAGS課金保護
- **コミット**: c145018
- **目的**: BILLING_ENABLED/PREMIUM_TRIAL_ENABLED/DEV_FEATURES の構造化
- **新規ファイル**: constants/feature-flags.ts
- **状態**: ✅ 完了
- **重要性**: β期間中の誤課金を構造的に防止

### M系（インフラ・整備）

#### M5: CI に tsc --noEmit 強制
- **コミット**: 6コミット（b08eff0, 9b9a93c, f8f1664, 6711b4f, 4619af0, 9937c22）
- **目的**: 型エラー21件を完全クリア + CI 拡張
- **削除行数**: 248行（Expo template 残骸）
- **状態**: ✅ 完了
- **教訓**: 
  - bdd2b27 の網羅不足を真の完成として記録
  - last_active_at の波及漏れ7件を検出
  - F.a の最小修正が hidden 5件を顕在化（TS の最初の不一致で報告打ち切り仕様）
  - Expo template 死コード6ファイル一掃

#### M6: 戦略文書 Markdown化
- **コミット**: 10efb0d（戦略v3）+ 後続コミット（母艦v2、料金確定版v1、改修指示書v1.1）
- **状態**: 🔄 進行中

---

## 2. 進行中タスク

### M6 残: 戦略文書 md化の継続

#### 完了
- ✅ docs/source/strategy_v3.md（戦略 v3）

#### 進行中
- 🔄 docs/source/strategy_master_v2.md（事業母艦v2）
- 🔄 docs/source/pricing_v1.md（料金確定版v1）
- 🔄 docs/source/refactor_plan_v1.md（本ドキュメント）

#### 残
- ⏳ 仕様系PDF（M6.5 として別タスク化候補）

---

## 3. 残タスク

### 3.1 緊急度: 中（β開始前に対処したい）

#### M5.5: husky / pre-commit hook
- **目的**: local 段階での typecheck 強制（CI 到達前の即時 feedback）
- **想定時間**: 30〜45分
- **依存**: M5 完了済（前提条件 OK）
- **優先度**: 中

#### M6.5: 仕様系PDF を Markdown化
- **対象**: 商品棚設計、プロダクト仕様書、画面単位仕様書、会場マッチング機能、出品仕様
- **想定時間**: 60〜90分
- **依存**: M6 メイン完了後
- **優先度**: 中

### 3.2 緊急度: 低（時間ができた時の整理）

#### M1: lib二重実装解消
- **対象**: lib/cards.ts vs lib/supabase.ts、lib/offers.ts は dead code 全削除候補
- **想定時間**: 1〜2時間
- **優先度**: 低

#### M3: Stack.Screen 冗長設定整理
- **対象**: 各 Stack.Screen の `headerBackTitle: ''`（global と重複、9件）
- **想定時間**: 20〜30分
- **優先度**: 低

#### M4: sell dead reference 削除
- **対象**: (tabs)/_layout.tsx の `name="sell"` 残骸（1行）
- **想定時間**: 5分
- **優先度**: 低

#### M7: PDF読み出しツール整備
- **対象**: 運用 convention のドキュメント化（pdftotext で十分と判明）
- **想定時間**: 5分（不要と判定）
- **優先度**: 低

### 3.3 リファクタ系（M5 で発見、後続候補）

#### M9: OfferOutcomeRaw を Supabase JOIN 配列形に整合
- **対象**: lib/supabase.ts の `as unknown as` を排除
- **目的**: 型安全性の向上、応急処置の根本解決
- **想定時間**: 60〜90分
- **優先度**: 中
- **発見**: M5 commit 1（b08eff0）で記録

#### M10: experiments.typedRoutes 有効化
- **対象**: Expo Router の typed routes 設定
- **目的**: useLocalSearchParams generics の手書き型を排除
- **想定時間**: 60〜120分
- **優先度**: 中
- **発見**: M5 commit 3（f8f1664）で記録

#### M11: Home synthetic Card を placeholder 型化
- **対象**: app/(tabs)/home.tsx の synthetic Card 構築
- **目的**: Partial<Card> または dedicated PlaceholderCard 型の導入
- **想定時間**: 30〜60分
- **優先度**: 中
- **発見**: M5 commit 4（6711b4f）で記録

#### M12: Card.owner を Profile | null に拡張
- **対象**: Card 型定義と call site 全般
- **目的**: DB JOIN nullable response との整合
- **想定時間**: 60〜120分
- **優先度**: 中
- **発見**: M5 commit 4（6711b4f）で記録

---

## 4. Phase 2 backlog（新機能）

戦略 v3 の Phase 2 期に向けた機能候補。

### 4.1 取引安全性

#### エスクロー処理
- **目的**: 取引のエスクロー実装、トラブル時の保護
- **想定時間**: 半日〜1日
- **優先度**: 高

#### 72h自動キャンセル
- **目的**: タイムアウト処理、取引の停滞防止
- **想定時間**: 2〜3時間
- **優先度**: 高

#### 追跡番号バリデーション
- **目的**: 配送追跡の確実性向上
- **想定時間**: 2〜3時間
- **優先度**: 中

#### adjustment_payer DB列追加
- **目的**: 調整金支払者の永続化
- **想定時間**: 1〜2時間
- **優先度**: 中

### 4.2 機能拡張

#### 求レーダー
- **目的**: 条件一致市場の本実装
- **想定時間**: 1〜2日
- **優先度**: 高（戦略 v3 の核機能）

#### Smart レーン本実装
- **目的**: H4 で暫定対応した部分の本機能化
- **想定時間**: 1〜2日
- **優先度**: 中

---

## 5. 改修方針の原則

### 5.1 三段階フロー（必須）
1. **検証フェーズ**: grep / cat / 並列精査で全関連ファイルを確認
2. **方針提示**: A/B/C オプション比較、推奨案 + 理由、Q1〜Qn を明確化
3. **承認 → 実装 → コミット & push**

### 5.2 自己発見と停止判断
- 想定外の問題を発見したら即停止
- 推測で進めず、必ず質問
- 「分からない」「読めない」を正直に報告

### 5.3 スコープ厳守
- 「ついで修正禁止」原則
- 発見した別問題はスコープ外として記録（コミットメッセージに「Out of scope」セクション）
- 後続タスク候補として提案するが、実行しない

### 5.4 構造的修正の優先
- 応急処置を避ける
- 「個別管理は持続困難」なら global 設定に hoist
- 再発防止策を提示

### 5.5 コミットメッセージ品質
- Why（なぜ）を必ず書く
- Out of scope を明記
- 過去コミットへの参照
- 学習材料になる教訓を含める

### 5.6 戦略文書を Source of Truth として尊重
- 戦略文書（事業母艦v2、料金確定版v1、戦略v3）が一次情報源
- コードに不確実な戦略情報を埋め込まない
- 戦略を参照する形で実装する

---

## 6. 教訓集（過去の改修から）

### 6.1 H4補修の教訓
**「個別管理は持続困難」**

E2 で `offer/[offerId]` だけ `headerBackButtonDisplayMode: 'minimal'` を個別追加した結果、H4 で `venue/[id]` で同じ問題が再発。8画面で潜在的負債が放置されてた。
→ 「特定箇所だけ直す」前に、「他の場所でも起きる種類の問題か」を必ず確認する。

### 6.2 H1 hotfix（bdd2b27）の教訓
**「grep ベースの修正は網羅性に欠ける」**

bdd2b27 で 'none' fallback を3ファイル直したが、`listing/[id].tsx` と `lib/supabase.ts` の合計3箇所が grep の網から漏れた。M5 で型チェック強制した時に初めて検出された。
→ 修正の網羅性は型チェックで担保すべき。grep 単体に依存しない。

### 6.3 M5 commit 4 の教訓
**「TS は最初の不一致で報告打ち切り」**

F.a（owner: null → undefined の1行修正）を実施したら、TS が報告を打ち切っていた hidden 5件のフィールド欠損が顕在化。
→ 1つの型エラーは複数の hidden errors を覆っている可能性がある。コミット毎に typecheck 件数を実測する三段階フローが有効。

### 6.4 M5 commit 5 の教訓
**「Expo template 残骸は dead cluster を形成する」**

Pattern E（Colors PascalCase の casing 不一致 2件）の実体は、Expo template 残骸 6 ファイルが孤立した依存環として2年級の dead code として放置されていたケース。型エラーが「死コードの存在を可視化するシグナル」として機能した。
→ CI で typecheck を強制しないと、こういう dead cluster は永久に残り続ける。

---

## 付録 A: コミット規約

### コミットメッセージ形式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### type の種類
- `feat`: 新機能
- `fix`: バグ修正、型エラー修正
- `docs`: ドキュメント変更
- `chore`: メンテナンス（依存更新、設定変更等）
- `ci`: CI 関連の変更
- `refactor`: 機能変更を伴わないコード改善

### body の構成
- **Why（必須）**: なぜこの変更が必要か
- **Changes**: 具体的な変更内容
- **Why X still missed Y**: なぜ過去のタスクで検出できなかったか（ある場合）
- **Out of scope**: スコープ外として記録した別タスク候補
- **Risk acknowledged**: 認識しているリスク（ある場合）

### footer
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## 付録 B: 本ドキュメントの運用

- **位置づけ**: Source of Truth（一次情報源）。残タスク管理の唯一の真実
- **更新タイミング**: タスク完了時、新タスク発見時、優先度変更時
- **配置**: `docs/source/refactor_plan_v1.md`
- **関連文書**: 
  - `docs/source/strategy_master_v2.md`（事業母艦v2、上位戦略）
  - `docs/source/strategy_v3.md`（戦略 v3、Phase 1 実行戦略）
  - `docs/source/pricing_v1.md`（料金確定版 v1、課金体系）
