# Swaply 改修指示書 v1.4

最終更新: 2026-05-07 / バージョン: v1.4 / 前提: feat/trade-pr1 ブランチ HEAD = 94176fd (refactor_plan v1.3 直後)

> **本ドキュメントの位置づけ**:
> Swaply のコードベース改修方針と残タスクを管理する Source of Truth。
> 過去の改修履歴と今後の改修候補を一元管理する。
>
> **関連ドキュメント**:
> - `docs/source/strategy_master_v2.md`(事業母艦v2)
> - `docs/source/strategy_v3.md`(戦略 v3)
> - `docs/source/pricing_v1.md`(料金確定版 v1)
>
> **関連 memory** (`~/.claude/projects/.../memory/`):
> - `project_brand_positioning.md`: ブランドポジショニング (Phase B 前提)
> - `project_m_cleanup_backlog.md`: hex cleanup 系の品質 backlog (本文書では参照のみ)
> - `feedback_avoid_heredoc_for_commit_messages.md`: 長文 commit message の運用ルール
> - `feedback_explicit_conventions_in_source.md`: 規約のソースコメント明示ルール

---

## 0. 変更履歴

- **v1.0 (2026-04)**: 初版、E1〜E3 + H1〜H5 のスコープ定義
- **v1.1 (2026-05-04)**: M5 完了反映、M5.5 + M9〜M12 を新規追加
- **v1.2 (2026-05-06)**: Phase A 完了反映 (UI 改修全 7 タスク + M-search)、Phase B 章 (高級感調律 UI-7〜UI-10) を新設、Phase 2 backlog の品質系を memory に分離
- **v1.3 (2026-05-07)**: Phase B UI-7 を「出品画面改修」(19-23h、11 commits 構造) として大幅拡張、UI-8〜UI-11 をリナンバリング (旧 UI-7 微細な質感 → UI-9 へシフト)、Q1〜Q6 確定事項を記録、セッション分割と FB チェックポイントを明示
- **v1.4 (2026-05-07)**: **Phase M 新設** (メッセージ + Realtime + 通知 + 会場リアルタイム化、28-40h、8 commits)、UI/UX 改善余地 35 項目を Claude Code 視点で網羅列挙、**β 前必須項目** セクション追加 (累計 61-84h)、Phase 2 backlog を「β 必須」と「β 後」に再分類、教訓 7.7「戦略目標と実装手段の整合性チェック」追加 (DM 流出率の構造的矛盾を事例化)

---

## 1. Phase A 完了 (2026-05-06)

Phase A 「引き締め紺 + 引き算スタイル」の構造的完成。

- 紫系トークン全撤去 (theme.ts + hardcode + LinearGradient)
- shadow 中性化 (border 中心の境界表現)
- 装飾過剰の解消 (matchBadge 削除、conditionBadge body 化)
- DB enum 整合性維持しつつ Trust 4 階層の色相分離 (Green/Teal/Sky/Amber)
- 全 9 commits / 13 連 CI 緑 / typecheck 一度も赤にならず

**ブランドポジショニング** (`memory/project_brand_positioning.md`):
A 象限 (信用 × おしゃれ) + 写真主役、Linear/Notion/Aēsop/Apple Wallet 寄り、メルカリ/PayPay フリマ系から完全に分離。

---

## 2. 完了済みタスク

### Part 1 (緊急タスク)

#### E1: git 保全
- **コミット**: 12コミット
- **目的**: 開発環境の git 状態を整理し、安全な作業ブランチを確立
- **状態**: ✅ 完了

#### E2: adjustment_amount end-to-end 永続化
- **コミット**: 0b32a50
- **目的**: 調整金 (差額) の入力UI復活、sign-encoded変換、DB schema拡張、RPC引き継ぎ
- **状態**: ✅ 完了
- **重要性**: Swaply 差別化の核機能

#### E3: swaply-review-package/ 削除
- **コミット**: 5e4f810
- **削除行数**: 9,715行
- **目的**: dead code の一掃、リポジトリのクリーン化
- **状態**: ✅ 完了

### Part 2 (高優先タスク)

#### H1: Trust バッジ 4 段階化
- **コミット**: 0ec0f61 + bdd2b27 (hotfix)
- **目的**: Bronze/Silver/Gold → Green/Trial Blue/Blue/Gold Blue
- **変更**: 「達成/未達」「あとN件で」表現排除、🥉🥈🥇絵文字廃止
- **影響**: mypage Trust タブ全面刷新 (事実列挙のみ)
- **状態**: ✅ 完了
- **教訓**: bdd2b27 hotfix の網羅不足が後の M5 で発見、CI 強制の必要性を裏付け

#### H2: trade併存解消
- **コミット**: 23c40e2
- **削除行数**: 668行
- **目的**: app/trade/[tradeId].tsx 削除 (dead route)
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

### M系 (インフラ・整備)

#### M5: CI に tsc --noEmit 強制
- **コミット**: 6コミット (b08eff0, 9b9a93c, f8f1664, 6711b4f, 4619af0, 9937c22)
- **目的**: 型エラー21件を完全クリア + CI 拡張
- **削除行数**: 248行 (Expo template 残骸)
- **状態**: ✅ 完了
- **教訓**:
  - bdd2b27 の網羅不足を真の完成として記録
  - last_active_at の波及漏れ7件を検出
  - F.a の最小修正が hidden 5件を顕在化 (TS の最初の不一致で報告打ち切り仕様)
  - Expo template 死コード6ファイル一掃

#### M6: 戦略文書 Markdown 化
- **コミット**: 10efb0d (戦略 v3) + 90b57d5 (母艦 v2.1 + 料金確定版 v1 + 改修指示書 v1.1 一括)
- **対象**: `docs/source/{strategy_v3, strategy_master_v2, pricing_v1, refactor_plan_v1}.md`
- **状態**: ✅ 完了 (4 ファイル全て md 化)

### Part 3 (検索強化、UI 改修) — v1.2 で追記

#### M-search: TREASURE 10 名マスタ + 3 段検索
- **コミット**: 0c156db (constants), 09ee983 (supabase), dfb7855 (UI)
- **目的**: メンバー検索の autocomplete + 動的グループ + シリーズ絞り込み 3 段化
- **新規**: `constants/members.ts` (TREASURE 10 名 + alias)
- **新規 API**: `searchCardsByMember`, `searchCardsByText`, `getMemberSuggestions`, `getGroupsForMember`, `getSeriesOptions`
- **状態**: ✅ 完了
- **TODO 候補**: BABYMONSTER 等の追加 (Phase 2)

#### UI-12: 用語統一 (差額 → 調整金)
- **コミット**: 760a262
- **対象**: 21 箇所 / 11 ファイル (UI 表示テキストのみ、DB カラム名は不変)
- **目的**: 戦略 v2.1 章 12-1「調整金 → 使う、支払い/決済/購入 → 使わない」と整合
- **状態**: ✅ 完了

#### UI-1+2+3: navy palette + shadow 中性 + 純白背景
- **コミット**: 6d9bf0a + 5 fix-up (07fd9bb, 62b9811, 9992465, 4a481ea, c87d173)
- **目的**: 紫ドミナントから引き締め紺基調へ全置換
- **状態**: ✅ 完了
- **fix-up 5 連発の理由**: 当初 grep が hex 種別を見落としていた (#6C63FF だけ追っていたが実際は #6D5EF5, #C4C0D8, #F5F3FF 等多数の独自紫が散在)。教訓 7.5 参照。

#### UI-4: LinearGradient 撤去
- **コミット**: 719926b
- **目的**: 6 箇所のグラデを単色 navy に、gradientStart/End トークン削除
- **対象**: PrimaryCTA, login, signup, onboarding
- **状態**: ✅ 完了

#### UI-5+6: Phase A finalize
- **コミット**: 053c2b8
- **目的**: shadow.sm dead code 撤去、CardItem matchBadge 削除、conditionBadge body 化
- **状態**: ✅ 完了
- **委譲**: HomeLargeCard/HomeSmallCard の overlay 削減と TrustBadge 配置戦略は Phase B (写真の見せ方と一体)

---

## 3. Phase B (高級感調律) — 着手予定

ブランドポジショニング memory「高級感の構成要素 4 項」 + 出品 UX 改善 (UI-7) をベースに分解。

### Phase B 全体スコープ

| Task | 工数 | スコープ |
|---|---|---|
| **UI-7** ★最優先 | **19-23h (2.5-3 日)** | 出品画面改修 (詳細は下記、11 commits 構造) |
| UI-8 | 2-3h | タイポ + 余白 (theme 値変更、全画面一斉) |
| UI-9 | 1-1.5h | 微細な質感 (border 色 / radius / shadow) |
| UI-10 | 2-3h | 写真の見せ方 + TrustBadge 配置戦略 |
| UI-11 | 1-1.5h | 残り hex 撤去 (M-cleanup-3〜4 統合) |
| UI-17 | 別案件 | ロゴ外部発注 (Phase C 候補) |
| **合計** | **25-32h** | |

---

### UI-7: 出品画面改修 (★ Phase B 最優先、19-23h / 2.5-3 日)

#### スコープ
- **1 写真 = N cards** (物理分離型、案 1 採用)
- **ホーム表示**: クロップ画像 (案 α)
- **詳細画面**: 元写真 + bbox 細ボーダー (案 i)
- **検索集約 UI** は別タスク化 (UI-7 スコープ外)

#### DB スキーマ拡張 (cards テーブルに 6 列追加)
- `bbox_x` / `bbox_y` / `bbox_w` / `bbox_h` (0-1 正規化、DECIMAL 型)
- `image_url_full` (元写真の Storage URL)
- `image_url_cropped` (クロップ画像の Storage URL)
- 既存 cards row との互換: `bbox = null` (= 写真全体が 1 card)

#### 11 Commits 構造

##### Phase 1: Foundation (4 commits, 約 6h)
- **C1**: DB migration (cards に 6 列追加、additive)
  - commit message に「Phase 2 で listings 分離時の image_url_full 重複に注意」明記
- **C2**: Supabase Storage helper (upload 関数、path 規約)
- **C3**: 状態 + 配送方法入力フロー追加 (戦略整合先行)
- **C4**: 進捗バー component (Linear 風)

##### Phase 2: Annotation Core (4 commits, 約 8-10h)
- **事前 spike**: C5 矩形描画ジェスチャ (1-2h プロトタイプ、PanResponder vs gesture-handler 選定)
- **C5**: 矩形描画ジェスチャ component (独立 component)
- **C6**: annotate.tsx (select.tsx 改修、bbox state 管理)
- **C7**: ai.tsx 簡約化 + cardinfo 統合 + TREASURE_MEMBERS autocomplete
- **C8**: クロップ画像生成 (expo-image-manipulator)

##### Phase 3: 統合 & 仕上げ (3 commits, 約 5-6h)
- **C9**: confirm.tsx 拡張 (bbox + image_url_full/cropped insert)
- **C10**: 画面遷移ロジック (image → annotate → cardinfo → confirm)
- **C11**: 調整金 UI 文言改善 + 最終検証

#### リスク評価

| 順位 | 項目 | リスク | 対策 |
|---|---|---|---|
| 1 | C5 矩形描画ジェスチャ | ★★★ | 独立 component で事前 spike (1-2h) |
| 2 | クロップ + Storage 並列 upload | ★★ | partial 失敗 rollback 設計 |
| 3 | bbox 座標系の精度 | ★★ | 画像 natural size と display size のスケーリング、EXIF 対応 |
| 4 | Storage helper 単体 | ★ | 既存 `uploadCardImage` 流用 |
| 5 | DB migration | ★ | 純 additive、無害 |

#### ユーザーフィードバックチェックポイント

| Checkpoint | 確認内容 | コスト |
|---|---|---|
| After C4 | 状態/配送/進捗バー / DB migration 反映 | 5-10 分 |
| **★★ After C6** | **ジェスチャ UX 確認 (最重要、UX 違和感の早期発見)** | 10-15 分 |
| After C8 | クロップ品質確認 / 複数 upload の挙動 | 10-15 分 |
| After C11 | 全フロー徹底検証 | 30 分以上 |

#### セッション分割

| セッション | 内容 | commit 数 | 工数 |
|---|---|---|---|
| 議論 1 (今、v1.3 更新) | 設計詰め + plan 更新 | 0-1 | ~1h |
| 実装 1 | Phase 1 Foundation: C1-C4 | 4 | ~6h |
| 実装 2 | Phase 2 Annotation Core: C5-C8 + 事前 spike | 4 | ~8-10h |
| 実装 3 | Phase 3 統合 & 仕上げ: C9-C11 | 3 | ~5-6h |

#### Q1〜Q6 確定事項 (2026-05-07 議論結果)

| Q | 確定 | 理由 |
|---|---|---|
| Q1 (画面構造) | **Y** (3 画面 + AI 層 1) + クロップ画像生成 | 戦略整合 + UX バランス |
| Q2 (DB スキーマ) | **A** (cards 拡張、6 列追加) | 最小変更、純 additive |
| Q3 (image upload) | **(i) UI-7 同梱** | 機能必須前提のため別タスク化非効率 |
| Q4 (dead code) | **部分流用** | select 40-50% / ai 30-40% |
| Q5 (AI 層 1 入力範囲) | **(i) bbox + 基本情報のみ** | 画面密度抑制、判断粒度分離 |
| Q6 (進捗バー UI) | **(i) Linear 風** | brand_positioning memory「Linear 参照」と整合 |

---

### UI-8: タイポ調整 + 余白拡大 (UI-7 完了後の最優先)
- **想定時間**: 2〜3 時間
- **対象**:
  - font-weight: 見出し 700/800 → 600/700 (細く)
  - line-height: 1.4〜1.5 → 1.55〜1.65 (広げる)
  - 字間 (日本語): 0 → 0.02em
  - Card padding: spacing.base → spacing.lg
  - Section margin: spacing.lg → spacing.xl
- **スコープ**: 全画面一斉 (theme.ts 値変更で反映)
- **着手時前提確認**: grep で「theme 値直参照」か「hex hardcode 散在」かを検証
- **依存**: M-cleanup-3, M-cleanup-4 (hex 残響整理) — 並行 or 先行で進める

### UI-9: 微細な質感 (旧 v1.2 UI-7)
- **想定時間**: 1〜1.5 時間
- **対象**:
  - border 色を薄く (#E5E5EA → #EEEEF1〜#F2F2F5 検討)
  - border-radius 規約明文化 (Card 16px / Button 12px / Tag full)
  - shadow opacity 調律 (現状 BestTradeCandidateCard のみ shadow.md)

### UI-10: 写真の見せ方 + TrustBadge 配置戦略 (旧 v1.2 UI-9)
- **想定時間**: 2〜3 時間
- **対象**:
  - aspect ratio 統一 (HomeLargeCard / HomeSmallCard / CardItem)
  - 写真周囲の額装 padding
  - TrustBadge 配置戦略決定 (overlay 残置 vs body 化 vs ハイブリッド)
- **連動**: HomeLargeCard/HomeSmallCard の overlay 削減 (Phase A 委譲分)
- **連動**: UI-7 のクロップ画像表示と整合 (ホーム = クロップ、詳細 = 元写真 + bbox)

### UI-11: 残り hex 撤去 (M-cleanup-3〜4 統合、旧 v1.2 UI-10)
- **想定時間**: 1〜1.5 時間
- **対象**:
  - propose.tsx 残り 〜20 箇所
  - trade/[offerId] 残り
  - 全 ts/tsx の hex audit
- **判断分岐**: グレー系/紫系の semantic 整理 (textPrimary/Secondary/Tertiary、success/error vs tag*)
- **memory 参照**: `project_m_cleanup_backlog.md`

### UI-17: ロゴ外部発注 (Phase C 候補)
- 現状「S」マーク単色暫定、外部デザイナー発注予定
- 発注後にロゴ刷新 commit

---

## 3.5 Phase M (メッセージ + リアルタイム + 通知) — v1.4 で新設

**スコープ**: 28-40h (約 1-1.5 週間)、8 commits 構造、Phase B と直列 (並行不可)

### スコープ概要

- メッセージ機能 (取引中チャット + 会場 DM)
- 会場モードリアルタイム化 (Hold/Supply 即時更新)
- Push 通知 (expo-notifications + APNs/FCM)
- 個人情報マスキング (電話/LINE ID 自動検出)
- 不適切メッセ通報機能

### 戦略整合 (新設の根拠)

| 戦略章 | 内容 | 現状 vs Phase M |
|---|---|---|
| 章 1-2 | 「DM 履歴やフォロワー数で曖昧判断」「DM 往復で交渉コスト高」 | Phase M で解消 |
| 章 6-4 | **「Trust 公開化で DM 流出が減る」** | 実装手段を Phase M で提供 |
| **章 18-4** | **「DM 流出率が低い」全振りトリガー条件** | Phase M なしでは達成不可 |
| 章 9-1 | 「結局 DM の方が早い」失敗パターン | 構造的解消手段を提供 |

→ **Phase M なしでは戦略目標と実装が構造的に矛盾**(教訓 7.7 参照)

### 8 Commits 構造

#### Phase M-1: Foundation (2 commits, 約 6-9h)
- **C-M1**: messages + conversations DB schema + RLS (2-3h)
- **C-M2**: Supabase Realtime 統合基盤 (4-6h)

#### Phase M-2: 会場リアルタイム化 (1 commit, 約 4-5h)
- **C-M3**: 会場モード Hold/Supply 即時更新 (4-5h)

#### Phase M-3: メッセージ UI (2 commits, 約 8-12h)
- **C-M4**: メッセージ一覧 + チャット画面 (4-7h)
- **C-M5**: 取引中チャット (offer/[offerId] 統合) + 会場 DM (4-5h)

#### Phase M-4: セキュリティ (1 commit, 約 4-6h)
- **C-M6**: 個人情報マスキング + 通報機能 (4-6h)

#### Phase M-5: 通知 (1 commit, 約 4-6h)
- **C-M7**: Push 通知 (expo-notifications + 証明書 + バッジ) (4-6h)

#### Phase M-6: 検証 (1 commit, 約 4h)
- **C-M8**: 検証 + edge case + lint (4h)

### リスク評価

| 順位 | 項目 | リスク | 対策 |
|---|---|---|---|
| 1 | Push 通知 (APNs/FCM 証明書) | ★★★ | 早めに Apple Developer / Firebase 設定、証明書取得は Phase M 開始**前**に着手 |
| 2 | Supabase Realtime 安定性 | ★★ | RLS と統合時の認証問題、事前 spike (1-2h) |
| 3 | 個人情報マスキング精度 | ★★ | 正規表現 + 段階的緩和、ユーザー報告で改善 |
| 4 | 会場リアルタイム性能 | ★ | 同時接続数による負荷、Phase 2 でスケール対応 |

### 着手前 spike (1-2h、Phase M-1 開始前)

- Supabase Realtime の動作確認 (RLS 込み)
- expo-notifications の証明書設定確認 (APNs / FCM)

### ユーザーフィードバックチェックポイント

| Checkpoint | 確認内容 | コスト |
|---|---|---|
| After C-M2 | Realtime 動作の実機確認 | 5-10 分 |
| **★★ After C-M5** | **メッセージ UI の UX 確認 (最重要)** | 15-20 分 |
| After C-M7 | Push 通知の実機テスト | 10-15 分 |
| After C-M8 | 全フロー徹底検証 | 30 分以上 |

### Q1〜Q5 確定事項 (2026-05-07 議論結果)

| Q | 確定 | 理由 |
|---|---|---|
| Q1 (Phase M 独立性) | **Yes** (UI-7 と直列、並行不可) | 認証/RLS 設計衝突、context switch 多 |
| Q2 (β 前必須 10 項目) | **Yes** (累計 61-84h) | 1 ヶ月 (β 2026-06) でタイトだが達成可能 |
| Q3 (個人情報マスキング β 必須) | **Yes** | ユーザー被害防止 + DM 流出抑止 |
| Q4 (Push 通知 + 証明書 Phase M 同梱) | **Yes** | リテンションの核、メッセージと一体 |
| Q5 (refactor_plan v1.4 即時更新) | **Yes** | Source of Truth 整合性確保 |

---

## 4. 残タスク (Phase B 並行 or 単独)

> **品質系 hex cleanup の詳細**: `memory/project_m_cleanup_backlog.md` 参照
> (M-cleanup-3〜7 として 5 タスク記録)

### 4.0 β リリース前必須項目 (累計 61-84h、約 8-11 日)

β 開始 (2026-06) までに**必ず**完了する項目。

| Order | 項目 | 工数 | Phase |
|---|---|---|---|
| 1 | UI-7 出品画面改修 (状態/配送/Storage 含) | 19-23h | Phase B |
| 2 | Phase M メッセージ + Realtime + 通知 + 会場リアルタイム | 28-40h | **Phase M (新設)** |
| 3 | UI-8 タイポ + 余白 | 2-3h | Phase B |
| 4 | Phase 2 早期: エスクロー処理 | 半日〜1日 | Phase 2 早期 |
| 5 | UI-9 微細な質感 | 1-1.5h | Phase B |
| 6 | Phase 2 早期: 72h 自動キャンセル | 2-3h | Phase 2 早期 |
| 7 | Phase 2 早期: 追跡番号バリデーション | 2-3h | Phase 2 早期 |
| 8 | UI-10 写真の見せ方 (TrustBadge 配置含) | 2-3h | Phase B |
| 9 | UI-11 残り hex 撤去 | 1-1.5h | Phase B |
| 10 | (Phase M 内に含む) 個人情報マスキング | (Phase M-4) | Phase M |

進行順序: **Phase B → Phase M → Phase 2 早期** の直列推奨。

### 4.1 緊急度: 中 (β 開始前に対処したい)

#### M5.5: husky / pre-commit hook
- **目的**: local 段階での typecheck 強制 (CI 到達前の即時 feedback)
- **想定時間**: 30〜45 分
- **依存**: M5 完了済 (前提条件 OK)
- **優先度**: 中

#### M6.5: 仕様系 PDF を Markdown 化
- **対象**: 商品棚設計、プロダクト仕様書、画面単位仕様書、会場マッチング機能、出品仕様
- **想定時間**: 60〜90 分
- **依存**: M6 メイン完了後
- **優先度**: 中

### 4.2 緊急度: 低 (時間ができた時の整理)

#### M1: lib 二重実装解消
- **対象**: `lib/cards.ts` vs `lib/supabase.ts`、`lib/offers.ts` は dead code 全削除候補
- **想定時間**: 1〜2 時間
- **優先度**: 低

#### M3: Stack.Screen 冗長設定整理
- **対象**: 各 Stack.Screen の `headerBackTitle: ''` (global と重複、9 件)
- **想定時間**: 20〜30 分
- **優先度**: 低

#### M4: sell dead reference 削除
- **対象**: `(tabs)/_layout.tsx` の `name="sell"` 残骸 (1 行)
- **想定時間**: 5 分
- **優先度**: 低

#### M7: PDF 読み出しツール整備
- **対象**: 運用 convention のドキュメント化 (pdftotext で十分と判明)
- **状態**: 不要判定済 (実質クローズ)
- **優先度**: -

### 4.3 リファクタ系 (M5 で発見、後続候補)

#### M9: OfferOutcomeRaw を Supabase JOIN 配列形に整合
- **対象**: `lib/supabase.ts` の `as unknown as` を排除
- **目的**: 型安全性の向上、応急処置の根本解決
- **想定時間**: 60〜90 分
- **優先度**: 中
- **発見**: M5 commit 1 (b08eff0) で記録

#### M10: experiments.typedRoutes 有効化
- **対象**: Expo Router の typed routes 設定
- **目的**: `useLocalSearchParams` generics の手書き型を排除
- **想定時間**: 60〜120 分
- **優先度**: 中
- **発見**: M5 commit 3 (f8f1664) で記録

#### M11: Home synthetic Card を placeholder 型化
- **対象**: `app/(tabs)/home.tsx` の synthetic Card 構築
- **目的**: `Partial<Card>` または dedicated PlaceholderCard 型の導入
- **想定時間**: 30〜60 分
- **優先度**: 中
- **発見**: M5 commit 4 (6711b4f) で記録

#### M12: Card.owner を Profile | null に拡張
- **対象**: Card 型定義と call site 全般
- **目的**: DB JOIN nullable response との整合
- **想定時間**: 60〜120 分
- **優先度**: 中
- **発見**: M5 commit 4 (6711b4f) で記録

---

## 5. Phase 2 backlog (機能系)

戦略 v3 の Phase 2 期に向けた機能候補。
品質系 (hex cleanup, audit, refactor) は `memory/project_m_cleanup_backlog.md` 参照。

**v1.4 で「β 必須」と「β 後」に再分類**。β 必須は章 4.0 にも掲載。

### 5.1 取引安全性 (β 必須、Phase 2 早期)

#### エスクロー処理
- **目的**: 取引のエスクロー実装、トラブル時の保護
- **想定時間**: 半日〜1日
- **優先度**: ★★★ β 必須
- **理由**: 戦略 12-7 で明示、現状未実装は取引安全性の致命的不足

#### 72h自動キャンセル
- **目的**: タイムアウト処理、取引の停滞防止
- **想定時間**: 2〜3 時間
- **優先度**: ★★ β 必須
- **理由**: 戦略 14-3 で明示、停滞取引のクリーンアップ手段

#### 追跡番号バリデーション
- **目的**: 配送追跡の確実性向上
- **想定時間**: 2〜3 時間
- **優先度**: ★★ β 必須
- **理由**: 戦略 14-5 で明示、詐欺抑止に必要

### 5.2 取引安全性 (β 後 OK、Phase 2 中期)

#### adjustment_payer DB列追加
- **目的**: 調整金支払者の永続化
- **想定時間**: 1〜2 時間
- **優先度**: 中
- **β 後 OK の理由**: 既存 `adjustment_amount` の符号エンコード (E2、commit 0b32a50) で当面運用可

### 5.3 機能拡張 (β 後 OK、Phase 2 中期〜長期)

#### 求レーダー
- **目的**: 条件一致市場の本実装
- **想定時間**: 1〜2 日
- **優先度**: 高 (戦略 v3 の核機能)

#### Smart レーン本実装
- **目的**: H4 で暫定対応した部分の本機能化
- **想定時間**: 1〜2 日
- **優先度**: 中

#### M-search 拡張: BABYMONSTER 等のメンバーマスタ追加
- **目的**: Phase 2 で他界隈展開時のマスタ拡張
- **想定時間**: 30 分 / グループ
- **優先度**: 中 (Phase 2 のグループ拡張タイミング)

---

## 6. 改修方針の原則

### 6.1 三段階フロー (必須)
1. **検証フェーズ**: grep / cat / 並列精査で全関連ファイルを確認
2. **方針提示**: A/B/C オプション比較、推奨案 + 理由、Q1〜Qn を明確化
3. **承認 → 実装 → コミット & push**

### 6.2 自己発見と停止判断
- 想定外の問題を発見したら即停止
- 推測で進めず、必ず質問
- 「分からない」「読めない」を正直に報告

### 6.3 スコープ厳守
- 「ついで修正禁止」原則
- 発見した別問題はスコープ外として記録 (コミットメッセージに「Out of scope」セクション)
- 後続タスク候補として提案するが、実行しない

### 6.4 構造的修正の優先
- 応急処置を避ける
- 「個別管理は持続困難」なら global 設定に hoist
- 再発防止策を提示

### 6.5 コミットメッセージ品質
- Why (なぜ) を必ず書く
- Out of scope を明記
- 過去コミットへの参照
- 学習材料になる教訓を含める
- **長文 commit message は heredoc を避け、`.commit_msg_tmp.txt` + `git commit -F` 方式** (memory `feedback_avoid_heredoc_for_commit_messages.md` 参照)

### 6.6 戦略文書を Source of Truth として尊重
- 戦略文書 (事業母艦v2、料金確定版v1、戦略v3) が一次情報源
- コードに不確実な戦略情報を埋め込まない
- 戦略を参照する形で実装する

### 6.7 規約はソースコメントで明示 (v1.2 追記)
- 合意した規約 (例: success/warning/error は表示専用、CTA 禁止) は theme.ts 等のインラインコメントで明示
- commit message のみへの記録は「commit history が遠ざかると忘れられる」リスクあり
- memory `feedback_explicit_conventions_in_source.md` 参照

---

## 7. 教訓集 (過去の改修から)

### 7.1 H4補修の教訓
**「個別管理は持続困難」**

E2 で `offer/[offerId]` だけ `headerBackButtonDisplayMode: 'minimal'` を個別追加した結果、H4 で `venue/[id]` で同じ問題が再発。8画面で潜在的負債が放置されてた。
→ 「特定箇所だけ直す」前に、「他の場所でも起きる種類の問題か」を必ず確認する。

### 7.2 H1 hotfix (bdd2b27) の教訓
**「grep ベースの修正は網羅性に欠ける」**

bdd2b27 で 'none' fallback を 3 ファイル直したが、`listing/[id].tsx` と `lib/supabase.ts` の合計 3 箇所が grep の網から漏れた。M5 で型チェック強制した時に初めて検出された。
→ 修正の網羅性は型チェックで担保すべき。grep 単体に依存しない。

### 7.3 M5 commit 4 の教訓
**「TS は最初の不一致で報告打ち切り」**

F.a (`owner: null → undefined` の 1 行修正) を実施したら、TS が報告を打ち切っていた hidden 5 件のフィールド欠損が顕在化。
→ 1 つの型エラーは複数の hidden errors を覆っている可能性がある。コミット毎に typecheck 件数を実測する三段階フローが有効。

### 7.4 M5 commit 5 の教訓
**「Expo template 残骸は dead cluster を形成する」**

Pattern E (Colors PascalCase の casing 不一致 2 件) の実体は、Expo template 残骸 6 ファイルが孤立した依存環として 2 年級の dead code として放置されていたケース。型エラーが「死コードの存在を可視化するシグナル」として機能した。
→ CI で typecheck を強制しないと、こういう dead cluster は永久に残り続ける。

### 7.5 UI-1 fix-up 5 連発の教訓 (v1.2 追記)
**「単一 hex pattern の grep では独自カラーシステムを見落とす」**

UI-1 (navy palette) 後、ユーザー視覚確認で「propose 画面まだ紫」報告 → 5 連続 fix-up になった。原因: `propose.tsx` と `offer/[offerId].tsx` は theme.ts を一切 import せず独自 hex (#6D5EF5, #F5F3FF, #C4B5FD 等) を使用。`#6C63FF` 単一 grep では検出不可能。
→ 修正前に `rg "#[0-9A-Fa-f]{6}" -o | sort -u` でユニーク hex 全 audit してから着手すべき。今後の hex 系修正のチェックリストに常設。

### 7.6 heredoc バッファ問題の教訓 (v1.2 追記)
**「Windows + Git-Bash 環境で長文 heredoc commit message が重複する」**

Phase A 中盤、長文 commit message を `git commit -m "$(cat <<'EOF'...EOF)"` 方式で書いた際に 3 連続でコンテンツが重複する事象が発生。
→ 長文は `.commit_msg_tmp.txt` (Windows 絶対パス) に Write してから `git commit -F` する方式に統一。memory `feedback_avoid_heredoc_for_commit_messages.md` 参照。

### 7.7 戦略目標と実装手段の整合性チェック (v1.4 追記)
**「戦略 KPI を立てる時、実装手段の存在を必ず確認する」**

事例 (DM 流出率の構造的矛盾):
- 戦略 v2.1 章 18-4 で「**DM 流出率が低い**」を全振りトリガー条件と定義
- 戦略 v2.1 章 6-4 で「Trust 公開化で DM 流出が減る」と説明
- しかし**実装ではメッセージ機能ゼロ** → ユーザーは交渉手段がないため X DM/LINE に流れる構造
- 結果: 戦略目標「DM 流出率低減」は達成不可能な KPI だった

教訓:
- 新規戦略目標を立てる際、**実装手段の存在を必ず確認**
- 既存戦略の定期レビューで「目標 vs 実装」の整合性チェック
- メッセージ機能のような **core インフラは戦略の前提として書く** (機能と独立して定義しない)
- Trust 可視化は「相手判断」を支援するが、「交渉メッセージ」の代替にはならない (異なる役割)

→ Phase M 新設 (v1.4) で実装手段を提供、戦略目標達成可能化。

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
- `chore`: メンテナンス (依存更新、設定変更等)
- `ci`: CI 関連の変更
- `refactor`: 機能変更を伴わないコード改善

### body の構成
- **Why (必須)**: なぜこの変更が必要か
- **Changes**: 具体的な変更内容
- **Why X still missed Y**: なぜ過去のタスクで検出できなかったか (ある場合)
- **Out of scope**: スコープ外として記録した別タスク候補
- **Risk acknowledged**: 認識しているリスク (ある場合)

### footer
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## 付録 B: 本ドキュメントの運用

- **位置づけ**: Source of Truth (一次情報源)。残タスク管理の唯一の真実
- **更新タイミング**: タスク完了時、新タスク発見時、優先度変更時、フェーズ移行時
- **配置**: `docs/source/refactor_plan_v1.md`
- **関連文書**:
  - `docs/source/strategy_master_v2.md` (事業母艦 v2、上位戦略)
  - `docs/source/strategy_v3.md` (戦略 v3、Phase 1 実行戦略)
  - `docs/source/pricing_v1.md` (料金確定版 v1、課金体系)
- **関連 memory**:
  - `project_brand_positioning.md`: ブランドポジショニング (Phase B 前提)
  - `project_m_cleanup_backlog.md`: hex cleanup 系の品質 backlog
  - `feedback_avoid_heredoc_for_commit_messages.md`
  - `feedback_explicit_conventions_in_source.md`
