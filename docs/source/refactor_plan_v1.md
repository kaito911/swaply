# Swaply 改修指示書 v1.11

最終更新: 2026-05-10 / バージョン: v1.11 / 前提: feat/trade-pr1 ブランチ HEAD = a913a5f (refactor_plan v1.10 直後)

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
- **v1.5 (2026-05-07)**: **Phase S 新設** (取引安全性・詐欺対策強化、16-23h、8 commits、章 3.7)、配送業者 API を β スコープ外に明記 (ヤマト/佐川/日本郵便すべて法人契約 + 月額有償で β 不適、Phase 2 中期送り)、**法的整備項目** (利用規約 + プライバシーポリシー + 特商法、10-20h) を β 前必須に追加、β 前必須累計を 87-127h に更新、教訓 7.8「物理制約の考慮」追加 (Trust 先発送ルール撤回事例)
- **v1.6 (2026-05-07)**: **C-S3 を写真ベース追跡番号自動入力に拡張** (Claude Vision API、伝票写真撮影 → OCR 自動抽出 → ユーザー確認 UI)、C-S3 工数を 2-3h → 5-7h に増、Phase S 合計を 16-23h → 20-27h、β 前必須累計を 87-127h → 91-131h、Vision API 運用設計セクション追加 (API key 管理 / コスト ~$0.017/OCR / fallback 手動入力 / プライバシー)、詐欺パターン b (追跡番号偽造) の防御を「△ 検出不可」→「○ Vision API + 配送業者 prefix 検証で抑止」に強化、教訓 7.9「UX × 詐欺対策の同時達成」追加
- **v1.7**: スキップ (中間バージョンとして予定されていたが、戦略議論優先のためターゲット転換を含む v1.8 へ統合)
- **v1.8 (2026-05-09)**: **Phase 1 ターゲット転換** (TREASURE/K-POP → 鬼滅 + コナン + サンリオ) を反映。新章追加: 章 3.8 スコープ拡張 (cards → items)、章 3.9 DB schema 移行設計 (additive migration、後方互換)、章 3.10 マスタデータ整備計画 (3 候補のキャラ × グッズシリーズ × コラボ網羅)、章 3.11 KPI 更新 (カテゴリ別流動性目標 + 月成立件数 + 撤退判定閾値再設定)、章 3.12 メッセージング戦略 (「アニメ・推し活グッズの交換アプリ」)。Phase 順序の再評価 (UI-7 出品画面改修は items 対応を含むため scope 増、Phase M/S は変更なし)。教訓 7.10「現場一次データ > Web リサーチスコア」追加 (X 過去 10 分観察でアニメ系 12-16 件 vs INI 22 件 vs TREASURE 1 件、定常型 vs スパイク型の構造視点)。strategy_master v2.1 → v2.2 と同期
- **v1.11 (2026-05-10)**: **トレポータル利用規約全文分析 + Swaply 利用規約ドラフト v1 作成 — 規約レベルで構造的優位を確定**。
  - **★最重要発見**: トレポータル第 11 条「商品の手渡しを強要する行為」を禁止 = Swaply 会場モードが規約レベルで競合の構造的弱点を突く差別化として証明
  - 章 3.13 補強: 「**規約レベルでの構造的優位**」セクション追加 (会場モード + 削除申立窓口 + キーワードフィルタ + Trust 仲裁の 4 点が規約準拠で証明)
  - **章 3.18 新設: Swaply 利用規約の構造** (トレポータル分析からの導出、業界標準準拠条項 + Swaply 独自差別化条項)
  - 弁護士相談時の質問項目に「**規約ドラフトレビュー**」を明示追加
  - 教訓 7.15 「競合の規約レベルでの構造的弱点を突く」追加
  - 規約全文を memory に原文保存 (`memory/project_treportal_terms_analysis_2026-05-10.md` 章 5)、3-6 ヶ月毎モニタリング計画
  - Swaply ToS ドラフト v1 (`docs/source/terms_of_service_draft_v1.md`) を新規作成、弁護士相談前のたたき台 (メルカリ・トレポータル・Vinted の業界標準 + Swaply 独自差別化のバランス)
  - 関連: `memory/project_treportal_terms_analysis_2026-05-10.md` (10 個の発見 + 規約全文 + Swaply 設計指針)、`docs/source/terms_of_service_draft_v1.md`
- **v1.10 (2026-05-10)**: **トレポータル実機調査反映 + UI 設計指針 + Phase 1.5 (INI) ハイブリッド戦略確定**。
  - 章 3.13 補強: 公式ロゴ代用 UI (タイポ + 抽象柄 + カラー連想、市松模様パブリックドメイン使用可)
  - 章 3.14 新設: UI 設計指針 (構造化カード Day 1 強制 + 1 枚=1 商品 + ファーストビュー最適化 + pg_trgm 検索 + ナビ 5 タブ案 A)
  - 章 3.15 新設: プロフィールタブ設計 (UI-12 新規、β 必須、Trust 4 階層と相補)
  - 章 3.16 新設: B2B 収益モデル検討メモ (Phase 3+ 検討、β/Phase 2 では非採用明示、純粋 C2C プラットフォームで信頼蓄積優先)
  - **章 3.17 新設: Phase 1.5 (INI 追加) 計画** (2026/9 INI ドームツアー期、ハイブリッド戦略 = 鬼滅+コナン+サンリオ + INI、時期分散でリソースピーク回避、**2026/8 中旬の go/no-go decision gate**)
  - 教訓 7.13 「機能比較と市場の取り方の緊張」追加
  - 教訓 7.14 「アニメ × K-POP のハイブリッド戦略」追加
  - 工数表: v1.10 では新規項目の絶対工数推定を避け、相対スケジュールで記述 (実装着手時に Claude Code が判断)
  - 関連: `memory/project_competitor_analysis_treportal_v2.md` (トレポータル実機 + 公式提携リサーチ + 4 Phase 議論)、`memory/session_handoff_ui10.md`
- **v1.9 (2026-05-10)**: **著作権リサーチ反映 + マスタ設計ハイブリッド化**。
  - 章 3.9 DB schema: マスタテーブル (`master_works` / `master_characters`) は **image カラムなし** (公式画像保持禁止)、`user_keyword_history` 新設 (5 件以上で運営確認 → マスタ追加判断)、ユーザー出品 image は 47 条の 2 政令 (32,400 px 以下) を技術強制
  - 章 3.10 マスタデータ整備: **完全マスタ事前登録 (70-75 キャラ × 33-47 シリーズ、20-32h) → 大カテゴリ 3 + 主要キャラ 25-30 のテキスト最小マスタ + ユーザー入力補完 (5-10h)** に全面書き換え (工数 1/3 削減)
  - **章 3.13 著作権コンプライアンス**を新設: β Day 1 必須 13 項目 (利用規約知財条項、キーワードフィルタ、自撮り強制、自動リサイズ、マスタ画像 NULL、通報ボタン、削除申立窓口、発信者情報保存、段階的サンクション、ハンドメイド禁止、アプリ名・ストア提出物チェック、IP 弁護士相談済) を実装計画に組み込み
  - 章 4.0 β 前必須累計: **138-194h → 125-175h** (Step 2 マスタ -15-22h、Step 6 著作権対応 +8-12h、Step 1/3 微増)。**Step 6「著作権対応」を新設** (8-12h、利用規約 + キーワードフィルタ + 自動リサイズ + 通報ボタン + 削除申立窓口 + 発信者情報保存ロジック)
  - 教訓 7.11「著作権リサーチで判明、サンリオ最厳格、IP 弁護士相談 β 前必須」追加
  - 教訓 7.12「マスタ設計はハイブリッド (大カテゴリ + 主要キャラのみ事前登録) で工数 1/3 削減 + UX 維持」追加
  - 残された不確実性: 弁護士相談の結果待ち、トレポータル規約 (SPA で取得不可、実機キャプチャ要)
  - 関連: `memory/project_copyright_research_2026-05-09.md` (3 IP 著作権精査 + Q1-Q6 + 設計指針 + β Day 1 必須チェックリスト)

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

## 3.7 Phase S (取引安全性 - 詐欺対策強化) — v1.5 で新設、v1.6 で C-S3 拡張

**スコープ**: 20-27h (約 1 週間)、8 commits 構造、Phase M の後に直列実行 (v1.6 で C-S3 を Vision API 化により +4h)

### スコープ概要

- **発送日合意制** + 並行発送 (双方の物理的制約を許容)
- **写真証跡** (梱包/ラベル/追跡、`trade_evidence` 別テーブル)
- **自動監視** (24h アラート / 48h ペナルティ / 72h キャンセル、pg_cron)
- 詐欺通報機能
- 手動仲裁 + 運営ダッシュボード
- 補償基金の枠組み (適用条件は β 後実取引データで決定)

### 戦略整合

- 戦略 2-5「**Trust = 判断材料**」: ペナルティを「未発送」に直接適用、Trust 思想と整合
- 戦略 14-3「**72h 自動キャンセル**」: Step 3 で達成
- 戦略 14-5「**追跡番号必須**」: β では手動入力で半分達成、Phase 2 中期で API 連携で完全達成

### 撤回した設計

- ❌ **「Trust 高い側が後発送」ルール** (v1.5 で撤回)
  - 撤回理由: 物理的制約無視 (仕事/学校で発送日が限定される人を不利化)、新規ユーザー差別 (Trust ゼロは常に先発送)、戦略 2-5 違反 (Trust=権利化)
  - 詳細は教訓 7.8 参照
- ❌ **追跡番号の手動入力のみ** (v1.6 で撤回)
  - 撤回理由: 入力負担で UX 摩擦 (12-13 桁の手動転記)、誤入力で照合失敗、偽番号入力の抑止力ゼロ
  - 詳細は教訓 7.9 参照

### 採用した設計

- ✅ **発送日合意制** (双方が物理的に発送可能な日を合意)
- ✅ **並行発送 + リアルタイム監視** (Phase M Realtime と連動)
- ✅ **高額取引は会場対面推奨** (¥5,000+ 表示、Phase M 会場 DM と連動)
- ✅ **Trust ペナルティは「未発送」に対してのみ適用** (戦略 2-5 整合)
- ✅ **伝票写真 → Claude Vision API で追跡番号自動抽出** (v1.6 採用)
  - UX: 12-13 桁手動転記の摩擦解消、撮影 1 アクションで完了
  - 詐欺対策: 伝票実物の存在を強制 (画像なし提出不可) + Vision API + 配送業者 prefix 検証で偽番号入力を抑止
  - fallback: API 失敗/低信頼度時は手動入力可、UX 連続性確保

### 8 Commits 構造

#### Phase S-1: Foundation (1 commit, 約 2h)
- **C-S1**: DB schema 追加
  - `trades` 列追加: `proposer_proposed_dates DATE[]`, `receiver_proposed_dates DATE[]`, `agreed_shipping_date DATE`
  - 新規テーブル: `trade_evidence` (拡張性確保)、`reports`、`dispute_logs`

#### Phase S-2: 発送フロー (3 commits, 約 11-13h、v1.6 で C-S3 拡張)
- **C-S2**: 発送日合意制 UI + DB ロジック (3-4h)
- **C-S3**: 発送写真証跡 + **追跡番号自動入力 (Claude Vision API)** (両者並行) (**5-7h**、v1.6 で 2-3h → 5-7h に拡張)
  - 伝票写真撮影 UI (expo-camera + 切抜きガイド枠)
  - **Claude Vision API で追跡番号 OCR 抽出** (画像 → 番号 + 配送業者推定)
  - ユーザー確認 UI (抽出結果を編集可能なフォームで提示、誤抽出時の補正導線)
  - 配送業者自動判定 (番号桁数 + prefix で ヤマト/佐川/日本郵便/その他 を分類)
  - **fallback**: API 失敗時/低信頼度時は手動入力に降格 (UX 連続性確保)
  - プライバシー: 伝票画像は番号抽出後に EXIF 除去、`trade_evidence` に縮小版のみ保持
- **C-S4**: 詐欺通報機能 (1-2h)

#### Phase S-3: 仲裁・自動化 (3 commits, 約 6-9h)
- **C-S5**: 手動仲裁ログ + 運営ダッシュボード (2-3h)
- **C-S6**: 補償基金の枠組み (1-2h、集計クエリのみ、UI は Phase 2)
- **C-S7**: 自動キャンセル + Trust ペナルティ (**pg_cron**) (3-4h、初導入リスク)

#### Phase S-4: 検証 (1 commit, 約 2-3h)
- **C-S8**: 検証 + 詐欺パターン a〜d 検証 + 規約文言調整

### リスク評価

| 順位 | 項目 | リスク | 対策 |
|---|---|---|---|
| 1 | pg_cron 初導入 (C-S7) | ★★ | C-S7 着手前に 1-2h spike (Phase M Realtime spike と並行可能) |
| 2 | **Vision API 抽出精度 (C-S3)** ← v1.6 追加 | **★★** | 着手前 1h spike (各社伝票で精度測定)、低信頼度は手動入力に降格、ユーザー確認 UI で誤抽出補正 |
| 3 | EXIF データ検証精度 (C-S3) | ★ | 段階的緩和、ユーザー報告で改善 |
| 4 | 補償基金料率調整 | ★ | β データで Phase 2 で決定 |

### 着手前 spike (合計 2-3h)

- **pg_cron の動作確認** (1-2h、テスト環境で migration + 関数 + scheduled job)、Phase M の Realtime spike と並行可能
- **Claude Vision API 精度テスト** (1h、v1.6 追加): ヤマト/佐川/日本郵便の実伝票で OCR 抽出 → 番号桁数 + 配送業者推定の精度測定、低信頼度判定基準を決定

### ユーザーフィードバックチェックポイント

| Checkpoint | 確認内容 | コスト |
|---|---|---|
| After C-S2 | 発送日合意フローの実機確認 | 5-10 分 |
| After C-S3 | 写真証跡 + 追跡番号入力 UX 確認 | 10-15 分 |
| **★★ After C-S7** | **自動キャンセル動作確認 (pg_cron 初導入の核)** | 15 分以上 |
| After C-S8 | 全フロー徹底検証 + 詐欺パターン a〜d 検証 | 30 分以上 |

### 詐欺パターン (8 種、β 必須は a〜d)

| # | パターン | 修正版での防御 | 対応時期 |
|---|---|---|---|
| **a** | 発送写真の偽造 (他カード/過去写真) | △ EXIF 時刻検証 + Trust ペナルティで抑止 | β 必須 (C-S3 + C-S8) |
| **b** | 追跡番号の偽造 (別人宛番号) | ○ **伝票写真強制 + Vision API 抽出 + 配送業者 prefix 検証で抑止** (v1.6 強化)、最終確証は Phase 2 配送 API | β 必須 (C-S3) |
| **c** | 受取確認の遅延 (騙し型) | ✅ 写真 + タイムスタンプで証拠 → disputed → 手動仲裁 | β 必須 (C-S5) |
| **d** | 価値偽装 (mint 申告で damaged 発送) | △ 受取後 24h 異議申立期間 + Trust 反映 | β 必須 (C-S2-S5) |
| e | アカウント譲渡 (高 Trust 売買) | ❌ 未対応 | Phase 2: KYC + デバイス fingerprint |
| f | 共謀型 (sock puppet で Trust 偽装) | ❌ 未対応 | Phase 2: パートナー diversity check |
| g | 会場対面詐欺 (その場で偽物渡し) | △ Step 5 で部分軽減 | 対応不要 (リスク低) |
| h | 配送中破損 (詐欺ではない事故) | ✅ 梱包写真で発送時状態証跡 | Trust ペナルティ対象外 |

### スコープ外 (Phase 2 中期送り)

- 🚨 **配送業者 API 連携** (ヤマト/佐川/日本郵便): 法人契約 + 月額有償、β 不適
- **KYC + デバイス fingerprint** (詐欺パターン e 対策)
- **共謀検知ロジック** (詐欺パターン f 対策)

### Claude Vision API 運用設計 (v1.6 追加)

C-S3 で導入する Claude Vision API の運用要件。

**API key 管理**:
- `ANTHROPIC_API_KEY` を Supabase Edge Function 環境変数に格納 (クライアント側に置かない)
- 写真は client → Edge Function (`extract-tracking-number`) → Anthropic API の経路で処理
- Edge Function 側で rate limit (1 ユーザー / 取引あたり 10 回上限) と画像サイズ制限 (≤ 4MB) を強制

**コスト試算**:
- 入力: ~1500 tokens (画像 1024×1024 圧縮、Claude Haiku 4.5 想定)
- 出力: ~80 tokens (番号 + 配送業者 + 信頼度の JSON)
- 1 OCR あたり概算 **~$0.017** (β 想定 1000 取引/月 → 月額 ~$17、許容範囲)
- モデル選定基準: Haiku 4.5 で精度十分か spike で測定、不足時は Sonnet 4.6 に昇格 (~$0.06/OCR)

**fallback 階層**:
1. Vision API 成功 + 信頼度高 → 抽出値を form に prefill、ユーザーは確認のみ
2. Vision API 成功 + 信頼度低 → 抽出値を表示しつつ「確認してください」警告、編集前提
3. Vision API 失敗 (timeout/error) → 「自動抽出に失敗しました」+ 手動入力 form に降格
4. 全失敗時も C-S3 の発送写真証跡 + 手動追跡番号入力で代替可 (機能停止しない)

**プライバシー**:
- 伝票画像は番号抽出後すぐ `expo-image-manipulator` で EXIF 除去 + 個人情報部分 (発送元住所等) のマスキング検討
- `trade_evidence` には縮小版 + 抽出済 metadata のみ保持、原本破棄
- 利用規約 + プライバシーポリシー (法的整備項目) に「伝票画像は OCR 後 Anthropic API に送信、抽出後即破棄」を明記

**カバレッジ拡張余地** (Phase 2):
- 国際郵便 (EMS/小型包装物) 対応
- 番号 prefix DB の拡充 (現状: ヤマト/佐川/日本郵便/その他の 4 分類)
- 受取側でも伝票写真撮影 → 同一性検証 (Vision API で番号一致確認)

### Q1〜Q6 確定事項 (2026-05-07 議論結果)

| Q | 確定 | 理由 |
|---|---|---|
| Q1 (配送業者 API β スコープ外) | **Yes** | 法人契約 + 月額コストで β 不適、手動入力で代替 |
| Q2 (pg_cron で自動キャンセル) | **Yes** | DB 内完結、シンプル、初導入リスクは spike で軽減 |
| Q3 (trade_evidence 別テーブル) | **Yes** | Phase 2 拡張性確保 |
| Q4 (工数 16-23h) | **Yes** | C-S7 が +1h (pg_cron 初導入)、C-S8 が +1h (詐欺パターン検証)。v1.6 で C-S3 Vision API 化により +4h (現 20-27h) |
| Q5 (詐欺パターン a〜d を C-S8 検証) | **Yes** | β で実害大、e/f は Phase 2 中期送り |
| Q6 (refactor_plan v1.5 で Phase S 章新設) | **Yes** | Source of Truth 整合性確保 |

---

## 3.8 スコープ拡張: cards → items (v1.8 新設)

Phase 1 ターゲット転換 (TREASURE/K-POP → 鬼滅 + コナン + サンリオ) に伴い、**「カード」概念を「アイテム」概念に拡張** する。

### 背景

旧 `cards` テーブルは K-POP/アイドル中心の設計 (`group_name`, `member_name`, `series` の 3 軸)。アニメ + キャラ IP のグッズ (缶バッジ、アクスタ、ぬいぐるみ、ガシャ、当りくじ等) は同じ 3 軸では表現しきれない。

### 新概念 4 軸

| 軸 | 例 (鬼滅) | 例 (コナン) | 例 (サンリオ) |
|---|---|---|---|
| **category** (大分類) | anime | anime | character_ip |
| **work** (作品/IP 名) | 鬼滅の刃 | 名探偵コナン | サンリオ |
| **character** (個別キャラ) | 竈門炭治郎 | 江戸川コナン | ハローキティ |
| **item_type** (グッズ種別) | trading_card / acrylic_stand / can_badge / plush / capsule_toy | clear_card / can_badge / acrylic_stand | gacha / kuji / can_badge / plush |

### category の値 (β 開始時)

- `anime` (鬼滅、コナン、Phase 2 拡張で呪術・薬屋等)
- `character_ip` (サンリオ、Phase 2 拡張でちいかわ等)
- `idol_kpop` (Phase 3 で再投入時、TREASURE/JO1/INI 等)
- `idol_jpop` (Phase 3 で STARTO/TOBE 等)
- `stage_25d` (Phase 2 後半で 2.5 次元: 刀ミュ/A3 ステ等)
- `tcg` (Phase 4 でポケカ/遊戯王等)
- `other`

### item_type の値 (β 開始時)

- `trading_card` (トレカ全般、ジャンプ系ホログラム/ブラインド封入)
- `clear_card` (コナン系クリアカード)
- `can_badge` (缶バッジ — 全ジャンル共通最頻)
- `acrylic_stand` (アクスタ)
- `acrylic_keychain` (アクキー)
- `plush` (ぬいぐるみ、ぬい)
- `capsule_toy` (ガシャ、ガチャポン)
- `kuji` (一番くじ・サンリオ当りくじ等)
- `bromide` (ブロマイド — 2.5 次元用、Phase 2)
- `silver_tape` (銀テープ — STARTO/K-POP 用、Phase 3)
- `mashikaku_photo` (ましかくフォト — STARTO 用、Phase 3)
- `other`

### 後方互換戦略

- 既存 `group_name` / `member_name` / `series` は **維持** (legacy K-POP データの保護)
- 新規追加: `category` / `work` / `character` / `item_type` (NULL 許容、段階移行)
- 既存 cards データは migration script で `category='idol_kpop'`, `work=group_name`, `character=member_name` にバックフィル
- UI 層では `category` が NULL の場合 `idol_kpop` として扱う互換ロジック

---

## 3.9 DB schema 移行設計 (cards → items、v1.8 新設)

### 設計方針

**additive migration** (破壊なし)、**段階移行** (rename ではなく columns 追加 + 後方互換)、**RLS 維持**。

### Phase 1: Schema 拡張 (β 前必須、純 additive)

```sql
-- Migration: 2026-XX-XX_extend_cards_to_items.sql
-- 既存 cards テーブルに 4 軸を追加 (純 additive)

ALTER TABLE public.cards
  ADD COLUMN category TEXT
    CHECK (category IN (
      'anime', 'character_ip', 'idol_kpop', 'idol_jpop',
      'stage_25d', 'tcg', 'other'
    )),
  ADD COLUMN work TEXT,           -- 作品/IP 名 (鬼滅の刃 / 名探偵コナン / サンリオ 等)
  ADD COLUMN character TEXT,      -- 個別キャラ (竈門炭治郎 / 江戸川コナン / ハローキティ 等)
  ADD COLUMN item_type TEXT
    CHECK (item_type IN (
      'trading_card', 'clear_card', 'can_badge', 'acrylic_stand',
      'acrylic_keychain', 'plush', 'capsule_toy', 'kuji',
      'bromide', 'silver_tape', 'mashikaku_photo', 'other'
    ));

-- 既存データのバックフィル (legacy K-POP 想定)
UPDATE public.cards
SET category = 'idol_kpop',
    work = group_name,
    character = member_name,
    item_type = 'trading_card'
WHERE category IS NULL;

-- インデックス追加 (検索パフォーマンス用)
CREATE INDEX idx_cards_category ON public.cards (category);
CREATE INDEX idx_cards_work ON public.cards (work);
CREATE INDEX idx_cards_character ON public.cards (character);
CREATE INDEX idx_cards_item_type ON public.cards (item_type);
```

### Phase 2: View ベースの items エイリアス (任意、β 後)

将来的にテーブル名を `items` に正式 rename する場合のクッション:

```sql
-- 互換 view (β 後検討、必須ではない)
CREATE VIEW public.items AS SELECT * FROM public.cards;
```

UI/lib 層は `items` view 経由でアクセス、cards 直接参照を段階廃止。**β 期間中はテーブル名は cards のまま**、列追加のみ。

### マイグレーション工数見積もり

| 項目 | 工数 | 担当 |
|---|---|---|
| Migration SQL 作成 + ローカル検証 | 1-2h | 実装 |
| 既存 cards データのバックフィル検証 | 1h | 実装 |
| `lib/types.ts` の Card interface 拡張 | 1-2h | 実装 |
| 影響箇所の grep + fix (UI 層、wantParser、scoreWantMatch 等) | 3-5h | 実装 |
| RLS ポリシー再確認 (新列は既存 RLS でカバー、追加変更なし想定) | 1h | 実装 |
| typecheck 0 維持 + CI 緑確認 | 0.5h | 実装 |
| **合計** | **7.5-11.5h** | **β 前必須に追加** |

### リスク

| 順位 | リスク | 対策 |
|---|---|---|
| 1 | 既存 cards データの member_name/group_name と新 character/work の不整合 | バックフィル script で 1:1 mapping、検証 query で件数一致確認 |
| 2 | scoreWantMatch / parseWantText が新軸に対応していない | UI-7 と並行で wantParser 拡張、character/work 軸の照合ロジック追加 |
| 3 | UI 層で category 別の表示分岐が必要 (アニメ vs キャラ IP vs アイドル) | UI-7 で「カテゴリ別 layout 切替」を設計 (mode 切替の延長線) |

### 関連 migration ファイル (既存参考)

- `docs/migration_offer_counter.sql`
- `docs/migration_shelf_items.sql`
- `docs/migration_user_oshi.sql`
- `docs/migration_wanted_cards.sql`

新規 migration は `docs/migration_extend_cards_to_items.sql` (仮名) で作成。

### Phase 3: マスタテーブル新設 + 著作権対応の image カラム運用 (v1.9 追加)

著作権リサーチ (`memory/project_copyright_research_2026-05-09.md`) の結論として、**マスタテーブルに公式画像を一切保持しない** 方針を確定。出品画像はユーザー本人撮影のみ + 著作権法 47 条の 2 政令要件 (32,400 px 以下) を技術強制する。

```sql
-- Migration: 2026-XX-XX_master_works_characters.sql

-- 作品マスタ (image カラムなし — 公式画像保持禁止)
CREATE TABLE public.master_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,           -- canonical key (例: "kimetsu" / "conan" / "sanrio")
  category TEXT NOT NULL CHECK (category IN ('anime', 'character_ip', 'idol_kpop', 'idol_jpop', 'stage_25d', 'tcg', 'other')),
  display_name_ja TEXT NOT NULL,       -- 表示用 (例: "鬼滅の刃")
  display_name_en TEXT,                -- 表示用 (例: "Demon Slayer")
  -- image_url カラムなし: 公式画像保持禁止 (3 IP 共通、サンリオ特に厳格)
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- キャラマスタ (image カラムなし、ユーザー追加 + 運営承認フロー)
CREATE TABLE public.master_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.master_works(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- canonical key (例: "tanjiro")
  display_name_ja TEXT NOT NULL,       -- 表示用 (例: "竈門炭治郎")
  aliases TEXT[],                      -- 表記揺れ吸収 (例: ARRAY['たんじろう', '炭治郎'])
  -- image_url カラムなし
  is_user_added BOOLEAN DEFAULT FALSE, -- ユーザー追加 (運営承認待ち) かマスタ事前登録か
  is_approved BOOLEAN DEFAULT TRUE,    -- 運営確認済か
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (work_id, name)
);

CREATE INDEX idx_master_chars_work ON public.master_characters (work_id);
CREATE INDEX idx_master_chars_approved ON public.master_characters (is_approved) WHERE is_approved = TRUE;

-- ユーザー入力キーワード履歴 (5 件以上で運営がマスタ追加判断)
CREATE TABLE public.user_keyword_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,               -- ユーザー入力 (例: "胡蝶しのぶ")
  user_id UUID REFERENCES auth.users(id),
  context TEXT,                        -- "listing_work" / "listing_character" / "search" 等
  searched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_keyword_history_keyword ON public.user_keyword_history (keyword);
CREATE INDEX idx_keyword_history_searched_at ON public.user_keyword_history (searched_at DESC);

-- 集計 view: 5 件以上のキーワード = マスタ追加候補
CREATE OR REPLACE VIEW public.v_master_candidates AS
SELECT
  keyword,
  COUNT(*) AS occurrences,
  COUNT(DISTINCT user_id) AS distinct_users,
  MIN(searched_at) AS first_seen,
  MAX(searched_at) AS last_seen
FROM public.user_keyword_history
GROUP BY keyword
HAVING COUNT(*) >= 5
ORDER BY COUNT(*) DESC;
```

#### cards (=listings) の image_url 運用ルール (v1.9 確定)

- **cards.image_url** はユーザー出品画像のみ保持 (本人撮影、第三者画像転載は規約違反)
- **アップロード時に自動リサイズで 32,400 px 以下を保証** (著作権法 47 条の 2 政令、複製防止措置あれば 90,000 px 以下)
- マスタテーブル側 (`master_works` / `master_characters`) には `image_url` カラム自体を作らない (列がないことで誤って公式画像を入れる事故を構造的に防ぐ)
- 出品画面の autocomplete はマスタからキーワード候補を出すのみ、画像は出品者自撮りを必ず 1 枚以上要求

#### Migration 順序

1. Phase 1 (上記 cards 列追加) を先に commit
2. Phase 3 (master_works / master_characters / user_keyword_history) を別 commit
3. seed script で大カテゴリ 3 + 主要キャラ 25-30 を投入 (詳細は章 3.10)

---

## 3.10 マスタデータ整備計画 (v1.9 全面書き換え — ハイブリッド最小マスタ)

3 候補 (鬼滅 + コナン + サンリオ) のマスタを β 前に整備。**v1.9 で完全マスタ → ハイブリッド最小マスタに方針転換** (著作権リサーチ反映 + 工数 1/3 削減)。

### v1.8 → v1.9 の方針転換

| 項目 | v1.8 (旧) | v1.9 (新) |
|---|---|---|
| マスタ範囲 | 鬼滅 30+ + コナン 30+ + サンリオ 10-15 = 70-75 キャラ + 33-47 シリーズ (完全マスタ事前登録) | 大カテゴリ 3 + 主要キャラ 25-30 (テキストのみ、画像なし) |
| 公式画像 (image_url) | 想定: 各キャラに公式画像 URL を保持 | **完全削除**: マスタテーブルに image_url カラムを作らない |
| 詳細項目 | グッズシリーズ・コラボ事例を毎キャラ網羅 | β は最小マスタ + ユーザー入力補完 (`user_keyword_history` に蓄積、5 件以上で運営追加判断) |
| 工数 | 20-32h | **5-10h (約 1/3)** |
| 根拠 | アニプレックス・小学館・サンリオすべてで公式画像のマスタ流用は NG (`memory/project_copyright_research_2026-05-09.md` Q2 確証度 ★★★)、UI-7 着手前にマスタ完成度を 100% に近づける必要も実は薄い (ユーザー側で表記揺れは aliases で吸収) |

### 最小マスタの内容 (β 前必須)

#### 大カテゴリ (3 件、master_works)

| name (canonical) | category | display_name_ja | display_name_en |
|---|---|---|---|
| `kimetsu` | anime | 鬼滅の刃 | Demon Slayer |
| `conan` | anime | 名探偵コナン | Detective Conan |
| `sanrio` | character_ip | サンリオ | Sanrio |

#### 主要キャラ (25-30 件、master_characters)

**鬼滅 (10 名)**: 竈門炭治郎、竈門禰豆子、我妻善逸、嘴平伊之助、冨岡義勇、胡蝶しのぶ、煉獄杏寿郎、宇髄天元、時透無一郎、甘露寺蜜璃

**コナン (10 名)**: 江戸川コナン、毛利蘭、灰原哀、安室透、赤井秀一、怪盗キッド、服部平次、毛利小五郎、世良真純、京極真

**サンリオ (5-10 名、サンリオキャラクター大賞 2025 上位)**: ポムポムプリン、シナモロール、ポチャッコ、クロミ、ハローキティ、マイメロディ、リトルツインスターズ、ハンギョドン

→ **3 IP 合計 25-30 名**。すべてテキストのみ (image_url カラム自体なし)。

### ユーザー入力補完フロー (β 期間中の運用)

1. ユーザーが出品時に `work` / `character` を autocomplete から選ぶ
2. マスタにない場合は **フリーテキスト入力可** (例: 上弦の壱 黒死牟、不死川玄弥、灰原哀の高校生 ver 等)
3. 入力されたキーワードは `user_keyword_history` に保存
4. 集計 view (`v_master_candidates`) で 5 件以上に到達したキーワードを運営が確認 → `master_characters` に追加 (`is_user_added=true, is_approved=true`)
5. 表記揺れは `aliases` 配列で吸収 (例: 「たんじろう」「炭治郎」→ canonical `tanjiro`)

### 工数見積もり (v1.9 = β 前必須)

| 項目 | 工数 |
|---|---|
| 大カテゴリ 3 件 + 主要キャラ 25-30 名のリスト確定 | 1-2h |
| seed script 作成 + 投入 | 2-3h |
| autocomplete UI の最小実装 (UI-7 内に組み込み) + フリーテキストフォールバック | 1-2h |
| `user_keyword_history` 記録ロジック | 1h |
| typecheck + CI 確認 | 0.5h |
| **合計** | **5-8h** (バッファ含 5-10h) |

### β 後の拡張方針

- 月次で `v_master_candidates` を確認し、5 件以上に到達したキーワードをマスタ追加 (Phase 2 内、運営工数 1-2h/月)
- 鬼滅・コナンは劇場版・新作展開で都度マスタ追加 (年 4-6 回想定)
- サンリオは大賞ランキング年次更新に合わせて見直し
- 公式画像は **永続的に保持しない** (公式コラボ・ライセンス取得時のみ例外、Phase 3+ 検討)

### マスタデータ整備のリスク (v1.9 改訂)

| 項目 | リスク | 対策 |
|---|---|---|
| キャラ名表記揺れ | 検索失敗で UX 低下 | canonical name + aliases 2 軸構造 (M-search の members.ts 同設計) |
| マスタにないキャラの出品で UX が落ちる | autocomplete から外れて入力不便 | フリーテキスト入力可 + `user_keyword_history` 集計で月次拡張 |
| 公式画像の誤投入 | サンリオ DMCA 等の即時リスク | **マスタテーブルに image_url カラム自体を作らない** (構造的防止)、出品画像も自動リサイズで政令要件強制 |
| 新グッズ発売の継続更新 | マスタが古くなる | β 期間中は手動更新、Phase 2 で公式 RSS/API 連携検討 |
| ユーザー追加キーワードのスパム | アダルト・差別語等の混入 | `is_approved=false` で承認フロー必須化 + 通報機能 |

---

## 3.11 KPI 更新 (v1.8 新設)

### 既存 KPI (戦略 Layer 1-3 より)

- 撤退ライン: MAU 100 未満 / 月成立 20 件未満
- 継続ライン: MAU 100-300 / 月成立 20-100 件
- 拡大ライン: MAU 300+ / 月成立 100 件+

### v1.8 で追加: カテゴリ別流動性目標 (3 ヶ月後評価)

定常型 3 候補のため、カテゴリ別に底値を見る:

| カテゴリ | 撤退ライン (月成立) | 継続ライン (月成立) | 拡大ライン (月成立) | 注 |
|---|---|---|---|---|
| 鬼滅の刃 | < 10 件 | 10-50 件 | 50+ 件 | X 月数万件の交換需要があるため、Swaply に流入させやすい |
| 名探偵コナン | < 5 件 | 5-30 件 | 30+ 件 | 春の劇場版期 (4-6 月) スパイクあり、年次サイクル考慮 |
| サンリオ | < 10 件 | 10-30 件 | 30+ 件 | 月次低密度型 (常時継続)、ピーク鋭度低い |
| **3 候補合計** | < **25 件** | **25-110 件** | **110+ 件** | β 期間 (3 ヶ月) で月 25 件以上が最低撤退ライン |

### 追加 KPI: 収集型 → 交換層 onboarding 率

- **目標**: 出品ユーザー (収集型 90%) のうち、3 ヶ月以内に交換成立 1 件以上に至る率 = **5%+**
- **根拠**: 収集型 → 重複発生 → 初回交換 → 継続的交換のグラデーション (`memory/project_research_sanrio_2026-05-08.md` D-4 参照)
- **計測方法**: ユーザー登録後の出品/交換アクション履歴を追跡

### 追加 KPI: カテゴリ間 cross-trade 率

- **目標**: 3 候補のうち 2 候補以上に出品/取引するユーザー率 = **20%+**
- **根拠**: パターン ε のシナジー (3 候補同時) を実証する指標。クロスがない = 単独 3 つ運営 (シナジーなし)
- **計測方法**: ユーザー出品の category 分布

### 撤退判定の閾値再設定

- **3 ヶ月後 (β 評価期限)**:
  - **3 候補合計 月成立 < 25 件** = 撤退検討 (旧: MAU 100 未満)
  - **収集型 → 交換層 onboarding 率 < 3%** = 設計再検討
  - **cross-trade 率 < 10%** = パターン ε のシナジー仮説否定 (単独集中に切替)

---

## 3.12 メッセージング戦略 (v1.8 新設)

### 旧 (v2.1 まで)

- ブランドポジショニング: A 象限 (信用 × おしゃれ) + 写真主役
- 訴求対象: TREASURE トレカ → K-POP 全般
- タグライン (旧): 「コレクター向け交換判断インフラ」 (本質定義、内部用)

### 新 (v1.8 / strategy v2.2)

- **ブランドポジショニング**: A 象限の引き締めは維持 (Linear/Notion/Aēsop/Apple Wallet 寄り、`memory/project_brand_positioning.md` 参照)
- **訴求対象**: アニメ + キャラクター IP ファン (鬼滅 + コナン + サンリオ起点)
- **タグライン (公開向け)**: **「アニメ・推し活グッズの交換アプリ」**
- **本質定義** (内部用、不変): コレクター向け交換判断インフラ (45 秒判断)

### コピー候補

#### App Store / Play Store 説明文 (1 行)

> **アニメ・推し活グッズを、信頼できる相手と交換するアプリ。**

#### App Store 詳細説明 (3 行)

> 鬼滅の刃、名探偵コナン、サンリオ — お気に入りキャラのグッズを、安全に交換。
> Trust 4 段階で相手の信頼度を 45 秒で判断。
> ライブ会場・ポップアップで、現地交換も。

#### X プロフィール

> Swaply | アニメ・推し活グッズの交換アプリ
> 鬼滅 / コナン / サンリオ 対応中
> 信頼の見える化で、安心して交換を。

#### ランディングページ ヒーロー

> **集めるだけじゃ、もう物足りない。**
> アニメ・推し活グッズを、信頼できる相手と交換しよう。
> Trust 4 段階で「この人と交換していいか」が 45 秒で分かる。

### 創業者前面のメッセージ

戦略 4 つの柱「柱 4 + 論点 δ」(運営者存在感、`memory/project_deep_logic_points.md`) と整合:

- **創業者の X アカウント**: 開発進捗 + 現場 (池袋・新宿・渋谷ポップアップ・ufotable Cafe・コナンカフェ・サンリオショップ) のレポートを発信
- **「中の人」コンテンツ**: 創業者本人が「鬼滅オタク・コナンオタク・サンリオオタク」のいずれかとして語る (Phase 1.5 で本人指定)
- **Open Development**: GitHub or 公開ロードマップで開発状況を可視化 (検討事項)

### メッセージング戦略のリスク

| 項目 | リスク | 対策 |
|---|---|---|
| 「アニメ・推し活グッズ」が広すぎる | 何でもありに見える、差別化弱まる | 「鬼滅 / コナン / サンリオ 対応中」を明示、ターゲット絞り込みを可視化 |
| サンリオファン (40 代女性含む) と鬼滅・コナンファン (10-30 代主流) の世代ギャップ | UI トーンが片方に寄ると他方離反 | A 象限 (信用 × おしゃれ) で世代横断、フラットなデザインを維持 |
| 「Trust 45 秒判断」が初心者には伝わらない | 訴求が抽象的 | 具体例 (「過去 50 件取引、ship 率 97%、トラブル 0 件」等) で補強 |

---

## 3.13 著作権コンプライアンス (v1.9 新設)

著作権リサーチ (`memory/project_copyright_research_2026-05-09.md`) の結論を実装計画に組み込む。3 IP (アニプレックス・小学館・サンリオ) のうち**サンリオが 3 IP 中最厳格** (米国版で fair use 不成立を明文化、Etsy DMCA 大量送付実績、Definitely Diva 訴訟 $150K-$2M 請求) のため、設計指針はサンリオに合わせて引き締める。

### β Day 1 必須 13 項目

| # | 項目 | 章/Step | 工数 | 状態 |
|---|---|---|---|---|
| 1 | **利用規約に知財侵害禁止条項** (メルカリ規約参考、「○○風/系/タイプ/モチーフ」記載禁止含む) | 法的整備 | 1h | β 必須 |
| 2 | **キーワードフィルタ実装** (「○○風/系/タイプ/モチーフ/仕様」自動検知、出品時バリデーション) | Step 6 | 3-4h | β 必須 |
| 3 | **自撮り強制** (UI レベル、出品画像はユーザー本人撮影のみ許容、第三者画像転載は不可) | UI-7 | (UI-7 内) | β 必須 |
| 4 | **自動リサイズ** (32,400 px 以下、著作権法 47 条の 2 政令要件) | Step 6 | 2-3h | β 必須 |
| 5 | **マスタ画像 NULL** (`master_works` / `master_characters` に image_url カラムを作らない) | 章 3.9 Phase 3 | (DB 移行内) | β 必須 |
| 6 | **通報ボタン** (商品ページ常設、理由選択式) | Step 6 | 1-2h | β 必須 |
| 7 | **削除申立窓口** (`swaply.app/ip-claim` 等のページ + メールフォーム、24-72h 一次返信) | Step 6 | 1h | β 必須 |
| 8 | **発信者情報保存** (IP/UA/タイムスタンプ + 本人確認、プロ責法対応) | Step 6 | 1h (確認) | β 必須 |
| 9 | **段階的サンクション規定** (Vinted 方式: 削除 → 7 日停止 → 永久 BAN) | 法的整備 | (法的整備内) | β 必須 |
| 10 | **ハンドメイド・改造品の出品禁止** (ポリシー明記、サンリオ米国版で違法と明文化) | 法的整備 | (法的整備内) | β 必須 |
| 11 | **アプリ名・サービス名チェック** (3 IP 名称をアプリ名・ロゴに組み込まない、商標的使用回避) | チェックのみ | 0 | β 必須 |
| 12 | **ストア提出物チェック** (App Store / Google Play の説明文・スクショに公式画像なし、Apple/Google 審査でも弾かれる) | チェックのみ | 0 | β 必須 |
| 13 | **IP 専門弁護士 1 回相談** (5-10 万円別予算、Step 6 着手前 or 並行) | 法的整備 | (相談 1h × 1-2 回) | **β 必須** |

### Step 6: 著作権対応 (8-12h、新設)

UI-7 完了後、Phase M 着手前を推奨 (UI 凍結が避けられるため)。

| 細項目 | 工数 |
|---|---|
| 利用規約に知財侵害禁止条項を追加 (#1、メルカリ規約をベースに) | 1h |
| キーワードフィルタ実装 (#2、出品時 + 検索時、デフォルト辞書 ≒ 30 語) | 3-4h |
| 自動リサイズ機能 (#4、出品アップロード時に 32,400 px 以下を強制、Sharp / expo-image-manipulator) | 2-3h |
| 通報ボタン UI + バックエンド (#6、商品ページに常設、reasons enum) | 1-2h |
| 削除申立窓口ページ (#7、`swaply.app/ip-claim` 静的ページ + メール送信フォーム) | 1h |
| 発信者情報保存ロジック確認 (#8、Supabase 既存 logging で IP/UA/timestamp が取れているか確認 + 不足分追加) | 1h |
| **合計** | **8-12h** |

### Step 6 と他 Step の関係

- DB 移行 (Step 1) で `master_works` / `master_characters` を image_url なしで作成 (#5)
- マスタ整備 (Step 2) で 25-30 キャラを seed (公式画像は持たない)
- UI-7 (Step 3) で自撮り強制 UI (#3) を実装
- Step 6 で残りの著作権対応 (#1, #2, #4, #6, #7, #8) を実装
- 法的整備 (Step 9) で利用規約 + 段階的サンクション + ハンドメイド禁止 (#1, #9, #10) を文書化
- アプリ名・ストア提出物チェック (#11, #12) は β 申請直前に最終確認

### 弁護士相談の最小スコープ

- 利用規約の知財条項・サンクション条項レビュー
- 検索 UI・カテゴリ階層名にキャラ名を組み込む際の商標的使用 vs 記述的使用
- 47 条の 2 のリサイズロジックが政令要件を満たすか
- 削除フロー SLA の法的妥当性
- 発信者情報保存ポリシーがプロ責法・個人情報保護法・電気通信事業法に整合するか

→ **想定 5-10 万円 × 1-2 回**、Step 6 着手前 or 並行で実施。

### グレーゾーン (運用判断)

| 項目 | グレー度 | 推奨判断 |
|---|---|---|
| 商品名に「ufotable」「アニプレックス」等の他社商標を含めること | グレー | 記述的使用に限定、内部運用ガイド整備 |
| 同人誌・二次創作グッズの出品 | 濃いグレー | β は商業誌の出品禁止リストに同人海賊版を入れる |
| 鬼滅の柄 (市松模様等) のカテゴリアイコン | 薄いグレー | 炭治郎の市松模様はパブリックドメイン、義勇等は商標済 → 抽象柄に留める |
| 検索 UI で「コナン」と入れた時の挙動 | グレー | 商標的使用に該当しないことを担保するレビュー |

詳細とソース URL は `memory/project_copyright_research_2026-05-09.md` 参照。

### 公式ロゴ代用 UI 設計 (v1.10 追加)

公式ロゴが NG のため (Q4)、UI 上の「ブランド連想」をデザイン要素で構築する。トレポータルが TREASURE 公式ロゴを使用 (グレーゾーン運用、`memory/project_competitor_analysis_treportal_v2.md`) しているのに対し、Swaply は法的に保守的な立ち位置を取りつつ、UX 認知速度で見劣りしないデザイン戦略を採る。

#### 3 IP 別のブランド連想要素

| IP | タイポグラフィ | 抽象柄 | カラーパレット |
|---|---|---|---|
| 鬼滅 | 明朝体寄り | **市松模様 (パブリックドメイン)** | 黒+赤 |
| コナン | サンセリフ | 虫眼鏡シルエット (一般図形) | 青+白 |
| サンリオ | 丸ゴシック | リボン抽象 (具体キャラ非依拠) | ピンク+パステル |

#### 使用可否ルール

- **OK**: 鬼滅の市松模様 (商標登録拒絶済 = パブリックドメイン)
- **NG**: 義勇・しのぶ・煉獄等の柱の柄 (商標登録済)
- **NG**: 「サンリオ風」独自イラスト (Cathy/Miffy 事件、サンリオ米国版で fair use 不成立)
- **OK**: 一般的な虫眼鏡シルエット、ハート、リボンの抽象モチーフ

#### 実装ポリシー

- カテゴリヘッダ・カード背景・タブアイコンに上記要素を適用
- 「公式」「公認」「コラボ」「提携」を匂わすテキストは禁止 (章 3.13 グレーゾーン)
- A 象限 (信用 × おしゃれ、`memory/project_brand_positioning.md`) を維持、派手 DTC 風には倒さない

→ 実装は UI-7 / UI-8 のデザイン判断内で吸収。新規工数推定なし。

### 規約レベルでの構造的優位 (v1.11 追加)

トレポータル利用規約全文分析 (`memory/project_treportal_terms_analysis_2026-05-10.md`、制定 2025-02-24) の結論として、**Swaply の差別化が規約レベルで構造的に証明された** 4 点を文書化する。

#### 1. 会場モード (★最重要、競合が模倣困難)

- **トレポータル第 11 条**: 「商品の手渡しを強要する行為」を禁止 → 規約レベルで現地交換オプションを提供できない構造
- **Swaply**: 会場モードで現地交換を**安全フローと組み合わせて推奨**
- → 競合追従には規約変更 + 法的整合性の再構築 + 既存ユーザー教育が必要、容易に模倣されない
- → ユーザーの「初期流動を作り切るために会場モードは必須」判断 (`memory/project_strategy_layer1_3.md` の 4 つの柱の柱 2「初期流動」) が**規約レベルで証明された**

#### 2. 権利者向け削除申立窓口 (Day 1 先行)

- **トレポータル**: 権利者向け専用窓口の規約記載なし、第 34 条のお問い合わせは customer@treportal.com (一般用)
- → 情プラ法・プロ責法対応として法的に不十分
- **Swaply**: Day 1 で `swaply.app/ip-claim` 専用窓口を明示 (Step 6 著作権対応内、章 3.13 β Day 1 必須 13 項目の #7)
- → 業界標準を先行して取り込む差別化

#### 3. キーワードフィルタ (業界標準への準拠)

- **トレポータル**: 「○○風/系/タイプ/モチーフ」禁止条項なし、メルカリ業界標準 (2020/9/1〜) に未追従
- **Swaply**: β Day 1 から「○○風」自動検知 (章 3.14-2 + Step 6)
- → メルカリ準拠の業界標準により、IP ホルダーから「健全な C2C プラットフォーム」と認識されやすい

#### 4. Trust システム + 積極的仲裁 (信頼形成の構造的優位)

- **トレポータル第 7 条第 4 項**: 「ユーザー間で解決」が基本、運営は「協議に入る」程度
- → 信頼形成は弱い (ユーザー任せの仲裁、人的リソース効率は良いが品質課題)
- **Swaply**: Trust 4 階層 + Phase S の Vision API 仲裁機能 (`refactor_plan v1.6` 章 3.7) で積極的サポート
- → トレポータルの「ユーザー間解決」基本より上位の信頼設計

#### 戦略文書化の意義

- これら 4 点は**機能比較ではなく市場の取り方で勝つ** (`memory/project_competitor_analysis_treportal.md` v1) 原則の追加証明
- 教訓 7.13 (機能比較と市場の取り方の緊張) における「**現場の摩擦解消** = OK」「**機能カタログ比較** = 慎重」の判定軸で、いずれも「現場の摩擦解消」側に該当
- 弁護士相談時に Swaply ToS ドラフト (`docs/source/terms_of_service_draft_v1.md`) と一緒にレビューしてもらい、これらの差別化条項が法的に妥当かを確認

### 残された不確実性 (v1.9)

| 項目 | 重要度 | 補完方法 |
|---|---|---|
| 弁護士相談の結果 | ★★★ | β 着手前に 1 回相談、結果次第で本章を改訂 |
| トレポータルの利用規約 (Swaply 直接競合) | ★★ | https://treportal.com/terms は SPA で Web 取得不可、次セッションで人間が実機キャプチャ |
| サンリオへの自主通知の要否 | ★★ | β 開始時にお問い合わせフォームへ「フリマアプリで正規品中古売買を扱う旨」通知を検討 (権利尊重姿勢の文書化) |

---

## 3.14 UI 設計指針 (v1.10 新設、トレポータル比較から導出)

トレポータル実機調査 + 4 Phase 議論 (`memory/project_competitor_analysis_treportal_v2.md`) の結論を実装計画に組み込む。**「機能比較ではなく市場の取り方で勝つ」原則** (`memory/project_competitor_analysis_treportal.md` v1) は維持しつつ、X DM + 現地交換の摩擦解消の観点で必要な機能を設計する。

### 3.14-1. 構造化カード Day 1 強制

**方針**: Day 1 から構造化カード方式のみ。フリーテキスト自由記述ポストは存在させない。

**根拠**:
- トレポータルは自由記述 + コラージュ + 構造化カードの 3 形式混在で破綻 (UI スクショ Image 3-5)
- Swaply は最初から構造化のみにすれば破綻しない構造
- フリーテキスト fallback は **入力 form 内の「自由欄」(キャラ名・商品名のマスタヒット失敗時)** に限定、ポスト形式自体は構造化を維持

**入力摩擦最小化**:
- autocomplete (master_characters の aliases 配列ヒット)
- フリーテキスト入力可 (`user_keyword_history` に蓄積、5 件以上で運営追加判断、章 3.10)
- 画像 1 枚必須 (自撮り強制)・テキスト最小

### 3.14-2. 1 枚=1 商品ルール

**方針**: 規約 + UI ガイダンス + 通報フローで運用。技術強制 (Vision API 検証) は Phase 2 後半で検討。

**根拠**:
- トレポータルのコラージュ画像投稿 (UI スクショ Image 4) は検索性ゼロ、これを許容するとプラットフォーム品質が破綻
- 画像内に同種オブジェクト (例: 缶バッジ 50 個) を検出する model は研究レベル、false positive 多 + コスト不釣り合い
- 規約・UI ガイダンス・通報で β は十分

**実装**:
- 規約: 「1 枚 = 1 商品の出品画像」明記 (Step 6 の利用規約整備内)
- 出品 UI: 「複数商品が写っている場合は分けて出品してください」ガイダンス
- 通報: 章 3.13 通報ボタンの reasons enum に「複数商品の混在」追加

### 3.14-3. ファーストビュー最適化

**方針**: ホーム上部の直近投稿は大型カードで表示、Trust スコア + カテゴリバッジを強調。

**設計案**:
- 直近 24h 以内: **大型カード** (画面幅 100%、画像比率 16:9)
- 24h 以降: **標準カード** (グリッド 2 列、画像比率 1:1)
- カテゴリ別アイコン (章 3.13 の抽象柄を活用)

**根拠**: トレポータルは情報密度過多でファーストビューに「今追える投稿」が薄い。Swaply は新鮮さで差別化。

→ 実装は UI-7 / UI-8 のレイアウト判断内で吸収。

### 3.14-4. 検索バー設計 (pg_trgm + aliases)

**方針**: 表記揺れ吸収を **PostgreSQL pg_trgm extension + master_characters.aliases 配列** の二重構造で実装。

**根拠**:
- トレポータルは検索が「TREASURE」のみマッチ、「treasure」「トレジャー」では引っかからない (ユーザー実機観察)
- pg_trgm は Supabase 標準、無料
- Algolia / Typesense は β 段階だと過剰

**SQL**:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_master_chars_name_trgm
  ON public.master_characters USING gin (name gin_trgm_ops);
CREATE INDEX idx_master_chars_display_trgm
  ON public.master_characters USING gin (display_name_ja gin_trgm_ops);
-- aliases (TEXT[]) は別途 array containment 検索 + UI 側で normalize
```

**UI 仕様**:
- プレースホルダー: 「鬼滅 / コナン / サンリオ ... 例: 炭治郎」のように具体的に
- 「受付中のみ表示」フィルタはデフォルト ON
- 検索結果は relevance_score (similarity() 値) で並び替え

→ 実装は Step 1 (DB schema 移行) 内に組み込み。

### 3.14-5. ナビ 5 タブ構成 (案 A 採用)

**確定**: **探す / 通知 / 出品 / マイグッズ / マイページ**

**根拠**:
- 5 タブは業界標準 (claude.ai 自身が前回判断ミスを補正済)
- 出品ベースの C2C で「自分の在庫」(マイグッズ) は最頻参照ニーズ
- 取引中はマイページ内のサブタブで対応

→ 実装は UI-7 内のリネーム + 順序調整で吸収。

---

## 3.15 プロフィールタブ設計 (v1.10 新設、UI-12 新規)

ユーザー直感「作る派」(`memory/project_competitor_analysis_treportal_v2.md` 1-2) を尊重し、Trust 4 階層と相補的なプロフィール体験を構築。トレポータルの取引評価二値 (「よかった/残念だった」) に対する明確な差別化要素。

### 3.15-1. 項目設計

| 項目 | 必須/任意/自動 | データ型 | 備考 |
|---|---|---|---|
| ニックネーム | 必須 | TEXT (既存 `users.username` 流用) | 既存 |
| アイコン | 必須 | URL (既存) | 既存 |
| 自己紹介 | 任意 | TEXT (max 200 chars) | 新規追加 |
| 推しグループ・推しキャラ | 任意 | `master_characters` への配列 FK | 既存 `user_oshi` を流用検討、要確認 |
| よく使う梱包方法 | 任意 | enum (一般 / プチプチ / 段ボール / OPP / その他) | 新規 |
| Trust スコア | 自動 | 既存 trust 計算 | 既存 |
| 取引履歴サマリ | 自動 | 集計 (ship 率・成立件数・トラブル 0 件等) | 既存集計の表示変更 |

### 3.15-2. UI 仕様

- マイページ → プロフィールタブ (サブタブ) として実装
- 編集モード: 任意項目を一括編集
- 表示モード: 取引相手から見た時の「この人はどんな人か」の文脈
- Trust 4 階層 (数字) と並列に「人柄」(プロフィール) を表示

### 3.15-3. β 必須の根拠

- ユーザー直感 (作る派) を尊重
- Trust スコア (定量) と相補的 (人柄の定性情報)
- 工数感: UI-12 として独立タスク化、実装着手時に判断 (β 必須スコープ内)

### 3.15-4. リスク

- 過剰実装で入力摩擦 → 任意項目を 3 つに絞った
- 個人情報過多 → 自己紹介 200 字制限 + 梱包・推しは enum/FK
- 「推し」表示で他者ハラスメント → 公開範囲設定は Phase 2 検討 (β は全公開)

→ 実装は UI-12 として UI-7〜11 完了後に着手、β リリース前必須スコープ内。

---

## 3.16 B2B 収益モデル検討メモ (v1.10 新設、Phase 3+ 検討)

トレポータルの B2B モデル (広告掲載・交換スペース開催・推し活マーケティング、`memory/project_competitor_analysis_treportal_v2.md` 2-5) を参考にしつつ、**Swaply は β/Phase 2 では B2B モデル非採用**とする。

### 3.16-1. 方針

- **β/Phase 2**: **純粋 C2C プラットフォーム**として信頼蓄積に集中
- **Phase 3+**: B2B 収益モデルを検討開始 (要再評価)

### 3.16-2. 根拠

- 戦略 v2.2 章 13: 「収益化は主役じゃない、信頼が主役」
- 戦略 4 つの柱 + 論点 δ (運営者存在感、`memory/project_deep_logic_points.md`) と整合
- 創業者前面・open development 戦略との整合
- B2B 早期着手は founder distraction、信頼蓄積を阻害するリスク

### 3.16-3. Phase 3+ で検討する候補

- 公式 IP との提携 (鬼滅・コナン・サンリオ・INI のいずれかとコラボ商品の取り扱い)
- 交換スペース企業向け SaaS (会場運営者向け Trust 連携)
- 推し活分析 API (匿名集計データ、外部研究機関向け)

### 3.16-4. 反転ポジショニング

トレポータルが B2B 提携で収益化路線 → Swaply はその逆 (B2B 排除で純粋プラットフォーム) を取る。短期収益は劣るが、ユーザーから見たプラットフォーム純度が高い = 信頼の蓄積で長期勝つ。

→ 実装タスクなし。本章は戦略ポジションの文書化。

---

## 3.17 Phase 1.5 (INI 追加) 計画 (v1.10 新設)

Phase 1 (鬼滅+コナン+サンリオ、定常型) に Phase 1.5 として **INI (LAPONE)** を追加するハイブリッド戦略。**「ガチで本気の最大限」**でアニメ + K-POP 両カテゴリを取りに行く。

### 3.17-1. スケジュール (相対ベース、絶対工数推定なし)

| 時期 | フェーズ | 主要タスク |
|---|---|---|
| 2026/5-6 | Phase 1 実装 | DB 移行 + マスタ最小 + UI-7 + 著作権対応 + プロフィールタブ |
| **2026/7** | **Phase 1 β リリース** | 鬼滅+コナン+サンリオ 3 IP β 開始 |
| 2026/7-8 | Phase 1 運営 + Phase 1.5 準備 | β 運営 (バグ・ユーザー対応)、LAPONE 著作権リサーチ並行、INI マスタ整備 |
| **2026/8 中旬** | **★ go/no-go decision gate** | Phase 1 安定性チェック、Phase 1.5 着手 / 延期判断 |
| 2026/9 | **Phase 1.5 リリース (条件付き)** | INI ドームツアー期、INI 統合・リブランディング |
| 2026/9-11 | Phase 1.5 ピーク期 | INI ピーク活用、Phase 1 継続運営 |
| 2026/12〜 | Phase 2 評価・拡張 | KPI 評価、Phase 2 拡張判断 |

### 3.17-2. ★ Decision Gate (2026/8 中旬、go/no-go)

**Phase 1.5 を 2026/9 に着手するかの判定基準** (Phase 1 β 4 週目時点):

- **GO 条件 (committed)**:
  - MAU 50+ 達成
  - 月成立件数 月 10+ 件以上 (3 候補合計)
  - 重大技術トラブルなし (DB 移行・マスタ・UI-7・著作権対応すべて稼働中)
  - 創業者の燃料残量 (主観評価) が 50% 以上

- **NO-GO 条件 (延期)**:
  - 上記いずれか未達
  - β リリース後の急性ユーザー不満 (UI / Trust / 取引フロー)
  - 著作権関連で警告・削除依頼受信

**NO-GO 時の代替**:
- INI 着手を 2026/11 (LAPOSTA 期、要確認) または 2027/3 (次回ドームツアー期、要確認) に延期
- 2027 年内の INI 着手は依然 committed
- Phase 1 安定化を優先

**根拠**: 単独創業者の持続可能スプリント長は通常 6 週間〜2 ヶ月、4-5 ヶ月超は燃え尽きリスク領域。INI を取りに行く意志は committed、タイミングは antifragile。

### 3.17-3. 必要タスク (Phase 1.5 着手時、相対スケジュール)

| タスク | 開始時期 | 備考 |
|---|---|---|
| **LAPONE 著作権リサーチ** (Claude Code) | 2026/7 (β 直後) | 鬼滅・コナン・サンリオと同形式、Q1-Q6 + Day 1 必須項目を LAPONE 適用 |
| INI マスタデータ整備 | 2026/8 | メンバー 11 名 + 主要グッズシリーズ、ハイブリッド最小マスタ (画像なし) |
| venue 拡張 | 2026/8 | 東京ドーム + 京セラドーム + LAPOSTA、関東+大阪、ナゴヤドームは遠征要 |
| DB 拡張 | 2026/8 | `master_works` に `ini` データ追加 (テーブル拡張は不要) |
| **リブランディング** | 2026/9 | 「アニメ・推し活グッズの交換アプリ」→「**推し活グッズの交換アプリ**」 |
| 弁護士相談 (4 IP 一括) | 2026/7-8 | β 前相談時に LAPONE も含めるのが効率的 |

### 3.17-4. ハイブリッド戦略の構造的整合性

| 観点 | Phase 1 (定常型) | Phase 1.5 (スパイク型) | 補完性 |
|---|---|---|---|
| 流動性タイプ | 通年・継続 | ドームツアー期ピーク | 谷間補完 |
| ユーザー層 | 10-30 代 + 40 代女性 (サンリオ) | 10-20 代女性中心 (MINI/MIO) | 重複あり、拡張あり |
| 売上ピーク | 春 (コナン劇場版) + 通年 (鬼滅・サンリオ) | 秋 (INI ドーム) | 時期分散 |
| 著作権リスク | サンリオ最厳格、ハンドメイド禁止 | LAPONE 系も保守的姿勢推奨 | 同型対応 |
| 競合状況 | トレポータル拡大開始 (失敗中) | トレポータル本領 (CARAT/MINI/JO1 ファン取り合い) | 異なる戦線 |

**戦略整合**:
- DB 設計は Phase 1 と統一 (master_works/characters の単純拡張、テーブル拡張なし)
- マスタハイブリッド設計を維持 (主要メンバーのみ事前登録、グッズはユーザー入力で補完)
- venue モードは Phase 1 と同じ仕組みで会場拡張
- ブランドメッセージは「アニメ + K-POP の推し活アプリ」に進化 (タグライン更新)

### 3.17-5. リスク管理

| リスク | 重要度 | 対策 |
|---|---|---|
| 創業者キャパ (4 ターゲット同時運営、月 60-100h ペース) | ★★★ | **Decision gate (3.17-2) で持続可能性を判定**、燃え尽きリスク回避 |
| 著作権リサーチ追加 (LAPONE) | ★★ | β 期間中に並行リサーチ、弁護士相談で 4 IP 一括処理 |
| ライバル視問題 (JO1 / ME:I ファンとの軋轢) | ★★ | INI 単独で OK、JO1/ME:I は将来検討 (`memory/project_research_results_2026-05-08.md`) |
| venue の物理アクセス (ナゴヤドーム遠征要) | ★ | 関東中心 + 京セラ (大阪) で β 期はカバー、ナゴヤドームは Phase 2 検討 |
| Phase 1 の β 不振 → Phase 1.5 強行 | ★★★ | Decision gate で延期判断、Phase 1 安定化を優先 |
| ブランドメッセージ拡張で positioning 弱体化 | ★★ | A 象限 (信用 × おしゃれ) を維持、派手 DTC に倒さない |

### 3.17-6. 成功指標 (Phase 1.5 期間中)

- INI ファンの初期獲得 (ドームツアー期に集中)
- アニメユーザー層との重複度測定 (3 候補 + INI のクロスユーザー率)
- Phase 1.5 期間中の MAU・成立件数の総合評価
- KPI は Phase 1 の延長 (`refactor_plan v1.8 章 3.11`)、INI カテゴリは 30/月成立件数を仮目標 (要見直し)

### 3.17-7. INI 単独 vs 国産 K-POP 全般の判断

- 旧戦略 (`memory/project_research_results_2026-05-08.md`): INI / 国産 K-POP は「スパイク型 + ライバル視 → Phase 2 以降」で排除
- v1.10 (本章): **INI 単独で復活**、JO1 / ME:I は引き続き Phase 2+ 検討
- 根拠: 時期分散 (アニメ通年/春・INI 秋ピーク) でリソースピーク回避、INI 単独ならライバル視リスク限定的

→ Phase 1.5 着手時に Claude Code が DB 拡張・マスタ整備・UI 微調整・リブランディングを判断。本章は計画フレーム。

---

## 3.18 Swaply 利用規約の構造 (v1.11 新設、トレポータル分析からの導出)

トレポータル利用規約全文分析 (`memory/project_treportal_terms_analysis_2026-05-10.md`) を根拠に、Swaply 利用規約のドラフト v1 (`docs/source/terms_of_service_draft_v1.md`) を作成。**メルカリ・トレポータル・Vinted の業界標準準拠条項 + Swaply 独自差別化条項のバランス**で構成。

### 3.18-1. ドラフトの構造 (詳細は `docs/source/terms_of_service_draft_v1.md`)

| 区分 | 章 | 出典 / 根拠 |
|---|---|---|
| 業界標準準拠 | 適用・用語定義・登録要件 (13 歳以上 / 日本国内) | トレポータル第 1-4 条準拠 |
| 業界標準準拠 | 取引成立・キャンセル・14 日自動評価 | トレポータル第 6-7 条準拠 |
| 業界標準準拠 | 禁止事項基本リスト (法令違反・偽物・第三者画像無断使用・転売) | トレポータル第 11 条準拠 |
| 業界標準準拠 | ユーザー投稿コンテンツの権利 (著作権はユーザー帰属、運営は運営目的で利用) | トレポータル第 12 条第 3 項準拠 |
| 業界標準準拠 | 解除・解約・契約終了処理 | トレポータル第 24-26 条準拠 |
| 業界標準準拠 | 免責・準拠法・東京地裁 | トレポータル第 30-33 条準拠 |
| **Swaply 独自** | **会場モード関連** (現地交換推奨、venue モード利用ルール、合意形成プロトコル) | トレポータル禁止事項の真逆、戦略の根幹 |
| **Swaply 独自** | **Trust システム関連** (4 階層スコア、透明性、取引履歴公開範囲) | トレポータル「ユーザー間解決」より上位 |
| **Swaply 独自** | **知的財産権強化** (`swaply.app/ip-claim` 削除申立窓口、SLA 7-14 日、DMCA、発信者情報保存) | プロ責法・情プラ法対応、トレポータル不在の差別化 |
| **Swaply 独自** | **画像関連** (自撮り強制、自動リサイズ 32,400 px 以下) | 著作権法 47 条の 2 政令、章 3.13 + 3.14-1 |
| **Swaply 独自** | **「○○風」記載禁止** (Day 1 自動検知) | メルカリ業界標準 (2020/9/1〜)、章 3.14-2 |
| **Swaply 独自** | **ハンドメイド・改造品禁止** (サンリオ対応、同人海賊版含む) | 章 3.13 著作権コンプライアンス + サンリオ最厳格 |
| **Swaply 独自** | **「公式」「公認」「コラボ」「提携」を匂わす出所混同表現禁止** | 不正競争防止法、章 3.13 |
| **Swaply 独自** | **手渡し強要を禁止しない** (会場モードで現地交換推奨) | トレポータル第 11 条の真逆 |

### 3.18-2. 各条項に意図 (Swaply 戦略との整合性) コメントを添付

ドラフト本文 (`terms_of_service_draft_v1.md`) は各条項末尾に **`> 【意図】`** コメントを付け、Swaply 戦略文書 (strategy_master_v2、refactor_plan v1.x) のどの章と整合するかを明示。弁護士レビュー時に法務担当者が「なぜこの条項が必要か」を即座に把握できる構造にする。

### 3.18-3. 弁護士相談時の追加質問項目 (本章新設)

章 3.13 の既存質問 (1-8) に加えて、本章で:

9. **Swaply 利用規約ドラフト v1 全体の法的妥当性レビュー** (5-10 万円別予算の中で対応)
10. **会場モード推奨条項** が利用規約として法的に成立するか (現地交換の安全責任の所在、トラブル時の運営責任範囲)
11. **「○○風」キーワード禁止** の規約記載が表現の自由・契約自由の観点で妥当か
12. **権利者向け削除申立窓口の SLA (7-14 日)** が情プラ法・プロ責法の要件に整合するか
13. **「ハンドメイド・改造品出品禁止」** がサンリオ対応として十分か (同人海賊版の解釈基準)

### 3.18-4. 規約変更モニタリング計画

- **3-6 ヶ月毎にトレポータル規約の差分確認** (人間が再取得、Claude Code が分析)
- 重大変更検知時の戦略反応プロトコル:
  - 「手渡し強要禁止」撤廃 → Swaply 会場モード優位喪失、別差別化軸へのピボット検討
  - 「○○風」禁止追従 → 業界標準収斂、追加差別化施策検討
  - 権利者削除窓口追加 → Swaply の Day 1 優位喪失、Phase 2 で追加施策検討

### 3.18-5. ドラフト v1 → 正式版への発展ロードマップ

| バージョン | タイミング | 主要変更 |
|---|---|---|
| **v1 (現状)** | 2026-05-10 (本章新設時) | トレポータル分析からの導出、弁護士相談前のたたき台 |
| v1.1 | 弁護士相談後 (β 着手前) | 法的妥当性レビューを反映、条項表現の精緻化 |
| v2 | β リリース直前 | プライバシーポリシー + 特商法表記との整合確認、最終公開版 |
| v2.1 | β 後ユーザーフィードバック反映 | 不明瞭条項の明確化、追加禁止事項 |
| v3 | Phase 1.5 INI 統合時 | LAPONE 関連条項追加、ブランドメッセージ進化反映 |

### 3.18-6. 法的整備 (Step 9) との関係

章 4.0 の Step 9「法的整備」(10-20h) には **利用規約 + プライバシーポリシー + 特商法表記** が含まれる。本章 (3.18) は利用規約の構造を先取り設計したもの、Step 9 着手時に**ドラフト v1 をベースとして弁護士レビュー → 確定版作成** の流れで効率化する。

→ 本章は規約構造の文書化、実装タスクは Step 9 内で吸収。

---

## 4. 残タスク (Phase B 並行 or 単独)

> **品質系 hex cleanup の詳細**: `memory/project_m_cleanup_backlog.md` 参照
> (M-cleanup-3〜7 として 5 タスク記録)

### 4.0 β リリース前必須項目 (累計 125-175h、約 16-22 日) — v1.9 で更新

β 開始 (2026-06) までに**必ず**完了する項目。v1.5 で Phase S + 法的整備、v1.6 で C-S3 Vision API、v1.8 で DB schema 移行 + マスタデータ整備 + 会場モード対応、**v1.9 で著作権対応 (Step 6) 新設 + マスタデータ整備をハイブリッド最小化**。

| Order | 項目 | 工数 | Phase | 備考 |
|---|---|---|---|---|
| 1 | **DB schema 移行** (cards → items + master tables、章 3.9) | **8-12h** | **β 前必須 / 最優先** | v1.9 で +0.5h (master tables 追加) |
| 2 | **マスタデータ整備 (ハイブリッド最小)** (大カテゴリ 3 + 主要キャラ 25-30、章 3.10) | **5-10h** | **β 前必須 / DB 後** | v1.8 旧 20-32h から **-15-22h** |
| 3 | UI-7 出品画面改修 (items 対応 + 状態/配送/Storage + autocomplete + 自撮り強制) | **24-30h** | Phase B | v1.9 で +2h (フィルタ UI + 自撮り強制) |
| 4 | UI-8〜11 (タイポ + 余白 + 質感 + 写真 + 残り hex) | 6-9h | Phase B | 変更なし |
| 5 | **会場モード対応** (ufotable Cafe / コナンカフェ / サンリオショップ・ピューロランド の venue 拡張) | 6-10h | Phase B / M | 変更なし |
| 6 | **著作権対応** (利用規約知財条項 + キーワードフィルタ + 自動リサイズ + 通報ボタン + 削除申立窓口 + 発信者情報保存、章 3.13) ← **v1.9 新設** | **8-12h** | **β 前必須 / UI-7 後** | 弁護士相談 (5-10 万円別予算) は本 Step と並行 |
| 7 | Phase M メッセージ + Realtime + 通知 + 会場リアルタイム | 28-40h | Phase M | 変更なし |
| 8 | **Phase S 詐欺対策** (発送日合意 + 証跡 + Vision API + 自動監視 + 仲裁) | 20-27h | Phase S | 変更なし |
| 9 | Phase 2 早期: エスクロー + 72h + 追跡番号 | 8-15h | Phase 2 早期 | 変更なし |
| 10 | **法的整備** (利用規約 + プライバシーポリシー + 特商法表記、Step 6 と統合運用推奨) | 10-20h | Phase 2 並行 | Step 6 #1, #9, #10 含む |
| 11 | (Phase M 内) 個人情報マスキング | (M-4 含む) | Phase M | 変更なし |

**累計 125-175h** (v1.8 138-194h から **-13-19h**、内訳: マスタ -15-22h、Step 6 +8-12h、Step 1 +0.5h、UI-7 +2h)。

**進行順序** (v1.9 更新): **DB 移行 → マスタデータ整備 → UI-7 → UI-8〜11 → 会場モード → 著作権対応 (Step 6) → Phase M → Phase S → Phase 2 早期** の直列推奨。
弁護士相談は Step 6 と並行 (相談前に Step 6 着手 OK、着手前に方針確認可)。

**Phase 順序の再評価 (v1.9)**:
- v1.8 では DB 移行 → マスタデータ → UI-7 → UI-8〜11 → 会場モード → Phase M → Phase S
- v1.9 で**著作権対応 (Step 6) を会場モードと Phase M の間に挿入** (UI-7 で自撮り強制 + autocomplete を実装後、利用規約・通報・削除窓口を一括整備)
- マスタデータ整備が 5-10h に圧縮されたため、UI-7 着手までの待ち時間が短縮 (DB 移行 + マスタ = 13-22h → UI-7 まで最短 16h で到達)
- 弁護士相談は Step 6 と並行 (方針確認 → 実装 → レビューの 2 回コール想定)
- Phase M / Phase S の設計は変更なし

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

#### 配送業者 API 連携 (Phase S Step 4 完全化) — v1.5 で追加
- **対象**: ヤマト/佐川/日本郵便、または 17track.net 等の統合サービス
- **目的**: 追跡番号の自動同期、発送状況のリアルタイム検証
- **想定時間**: 半日〜1日 (契約後)
- **前提**: 法人契約 + 月額有償 ($20-100/月)
- **優先度**: 中 (β は手動入力で運用、Phase 2 中期で完全自動化)

#### KYC + デバイス fingerprint (詐欺パターン e 対策) — v1.5 で追加
- **対象**: 高額取引時の本人確認、アカウント譲渡防止
- **想定時間**: 2〜3 日
- **優先度**: 中 (Phase 2 中期、KYC ベンダー契約必要)

#### 共謀検知ロジック (詐欺パターン f 対策) — v1.5 で追加
- **対象**: sock puppet で Trust を偽装する複数アカウント検知
- **想定時間**: 1〜2 日
- **優先度**: 中 (Phase 2 中期、データ蓄積後)

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

### 7.8 物理制約の考慮 (Trust 先発送ルール撤回事例) (v1.5 追記)
**「ユーザーの実生活制約を設計時に必ず考慮する」**

事例 (Trust 先発送ルール撤回):
- Phase S 設計議論で「Trust 高い側が後発送」ルールを最初提案
- 意図: 詐欺リスク高い (Trust 低い) ユーザーが先に発送することで安全担保
- ユーザー指摘: 「**仕事の都合で発送日が限定される人を無視した設計**」で撤回
  - 平日仕事の社会人は週末しか発送できない
  - 学生は親に頼めない時間帯がある
  - 「Trust 低い = 先発送義務」だと現実的に不可能
- 修正版: 発送日合意制で双方の物理制約を許容、並行発送 + 写真証跡 + 追跡で詐欺対策

教訓:
- ユーザーの実生活 (仕事/学校/休日のみ発送可能) を設計時に必ず考慮
- 「理論的に合理的」な仕組みでも、**現実の摩擦で実用にならないリスク**
- 新規ユーザー差別 (Trust 低い = 不利) になる仕組みは**新規参入障壁**を生む
- 戦略 2-5「Trust = 判断材料」を「Trust = 権利」に解釈すると戦略違反 (権利化禁止)
- 詐欺対策は**多層防御**で組む (発送日合意 + 並行発送 + 写真証跡 + 追跡 + 自動監視 + 仲裁)、単一ルール (先発送順位) に頼らない

→ Phase S 採用版 (v1.5) で物理制約を許容しつつ詐欺対策を多層化、戦略整合性確保。

### 7.9 UX × 詐欺対策の同時達成 (Vision API 採用事例) (v1.6 追記)
**「UX 摩擦削減と詐欺抑止が同じ手段で両立する場合は躊躇わず採用する」**

事例 (追跡番号: 手動入力 → 写真 + Vision API 自動抽出):
- v1.5 Phase S 当初設計: 追跡番号は手動入力、配送 API なしでは偽造検出不可と諦めた
- ユーザー指摘: 「**手動入力負担 + 偽造検出不能の両方が課題、写真と AI で解決できないか**」
- 検討結果:
  - UX 側: 12-13 桁の手動転記 (誤入力 + 摩擦) → 撮影 1 アクションで完了
  - 詐欺対策側: 番号文字列のみだと偽造容易 → 伝票画像実物の存在を強制 + Vision API 抽出 + 配送業者 prefix 検証で抑止
  - コスト: ~$0.017/OCR、月 1000 取引で ~$17、許容範囲
  - リスク: API 精度不足 → 手動入力 fallback で連続性確保

教訓:
- 「**UX 改善案**」と「**詐欺対策案**」を別々に検討すると見落としが起きる
- 「課題 A の対策」が「課題 B の副次的解決」になる構造を意図的に探す
- 「配送 API なしだと無理」のような早期諦めは再検討対象 (Vision API のような後発手段が出る)
- AI 機能は単なる UX 装飾ではなく、**信頼性インフラ**として設計に組み込める
- ただし fallback は必須 (API 障害で機能停止しない設計、4 階層 fallback で連続性確保)

→ C-S3 を Vision API ベースに拡張 (v1.6)、UX × 詐欺対策の同時達成を確認。

### 7.10 現場一次データ > Web リサーチスコア (Phase 1 ターゲット転換事例) (v1.8 追記)
**「現場の一次データ (X 観察) は Web リサーチのスコアより上位の判断材料。スパイク型 vs 定常型の構造視点が重要」**

事例 (Phase 1 ターゲット転換、TREASURE/K-POP → 鬼滅 + コナン + サンリオ):

- 2026-05-08 に Web リサーチ (`memory/project_research_matrix_2026-05-08.md`) で 38 候補 × 10 軸の重み付きスコアを計算、トップ 5: 鬼滅 129.5 / コナン 129 / 呪術 124.5 / 刀ミュ 120 / SEVENTEEN 118.5
- claude.ai 議論で「規模単一軸での判断」に偏りが続き、ユーザーから「複数領域にまたがる思考をしないとあかん」と厳しい指摘
- 多次元評価マトリクスを作成しても、**判断の決め手は Web リサーチのスコアではなく「ユーザー実測 X 過去 10 分の交換投稿数」**:
  - アニメ系 12-16 件 (定常型、底値が高い)
  - INI 22 件 (スパイク型、ピーク高いが谷間あり)
  - TREASURE 1 件 (規模に比してスパイク中の谷間)
- → **「スパイク型 vs 定常型」という構造視点** で判断、定常型 3 候補 (鬼滅 + コナン + サンリオ) に確定

教訓:

- **Web リサーチのスコアは判断材料の一つ**、現場の一次データ (X 譲求の実測、ヒアリング 20+ 人、ポップアップ周辺観察) は**より上位の判断材料**
- 数値スコア化すると「規模単一軸」の罠に陥りやすい。10 軸の重み付き合計でも、**定常型 vs スパイク型の構造視点が抜けると本質を外す**
- ユーザー本人が「現場でこうだった」と言う観察は、Web リサーチ 1000 件分よりも価値がある場合がある
- 判断プロセスの順序: **(1) 戦略仮説 → (2) Web リサーチで候補絞り込み → (3) 現場一次データで構造視点検証 → (4) 確定**。逆順 ((1) → (2) で完結) は失敗パターン
- スパイク型は谷間で離脱リスク (アイドル系の活動休止期、シーズンオフ)、定常型は底値が高く継続率優位 — **β 期間 (3 ヶ月) のように短い評価窓ではスパイクのピーク値より底値の安定性が重要**
- 関連: `memory/project_claude_self_calibration.md` の失敗パターン 1 「数値で逃げる」、失敗パターン 3 「整理屋に堕ちる」

→ Phase 1 ターゲット転換 (v1.8 / strategy v2.2) で構造視点を組み込み、定常型流動性戦略に確定。今後の戦略議論では「Web スコア + 現場一次データ + スパイク/定常の構造視点」の 3 点セットで判断。

### 7.11 著作権リサーチで判明、サンリオ最厳格 + IP 弁護士相談 β 前必須 (v1.9 追記)
**「ターゲット IP の著作権ポリシーは IP ごとに大きく異なる。3 IP の中で最も厳格な IP に合わせて設計する」**

事例 (Phase 1 ターゲット 3 IP の著作権リサーチ、`memory/project_copyright_research_2026-05-09.md`):

- 鬼滅 (アニプレックス + 集英社 + ufotable): 摘発実績多数だが対象は無許諾グッズの製造・販売者、プラットフォーム自体への直接訴訟事例は公開情報になし
- コナン (小学館 + ShoPro + 読売 TV + TMS): 個人開発・スタートアップ規模の摘発事例は公開情報になし、海賊版サイトには積極的
- サンリオ: ⚠️ **3 IP 中最厳格**。米国版で fair use 不成立を明文化、Etsy DMCA 大量送付、Definitely Diva 訴訟 ($150K-$2M 請求)、EU 競争法 622 万ユーロ制裁金、世界規模の訴訟経験
- → **設計指針はサンリオに合わせて引き締める** (3 IP 共通の最大公約数ではなく、最厳格 IP に合わせる)

教訓:

- 複数 IP を同時にターゲットする場合、IP ごとの著作権ポリシーは大きく異なる。最厳格 IP に合わせて設計するのが安全 (緩い IP でだけ安全な設計は、厳格 IP で違反になる)
- サンリオのようにライセンスを本業とする企業は、無断使用への金銭的動機・組織的体制が他 IP より強い。過小評価しない
- 「グレーゾーン」を明確にラベリングすることが重要。法律家ではない我々は「OK」「NG」「グレー」の 3 段階で線を引き、グレーは弁護士相談 or β スコープ外に倒す
- **β リリース前に IP 専門弁護士 1 回相談 (5-10 万円程度) は必須投資**。コードベースのバグ修正より優先順位が高い (法的リスクは技術的負債と異なり、後から累積で爆発する性質)
- 関連: `memory/project_copyright_research_2026-05-09.md` の β Day 1 必須 13 項目、Q1-Q6 の暫定回答 + 確証度

→ 章 3.13 著作権コンプライアンス (v1.9 新設) に β Day 1 必須 13 項目 + Step 6 (8-12h) を組み込み。

### 7.12 マスタ設計はハイブリッド (大カテゴリ + 主要キャラのみ事前登録) で工数 1/3 削減 + UX 維持 (v1.9 追記)
**「事前マスタは最小限で良い。ユーザー入力で補完するハイブリッド型のほうが工数効率も拡張性も高い」**

事例 (v1.8 → v1.9 のマスタ設計転換):

- v1.8 当初設計: 鬼滅 30+ + コナン 30+ + サンリオ 10-15 = 70-75 キャラ + 33-47 グッズシリーズの完全マスタ事前登録、工数 20-32h
- v1.9 転換: 大カテゴリ 3 + 主要キャラ 25-30 のテキスト最小マスタ + ユーザー入力補完 (`user_keyword_history` 蓄積、5 件以上で運営追加判断)、工数 5-10h
- 工数削減: **-15-22h (約 1/3 に圧縮)**
- UX 影響: フリーテキスト入力可 + autocomplete fallback で十分機能する (上弦の壱「黒死牟」のような派生キャラは事前登録より「ユーザーが入れたキーワードが集まったらマスタ追加」のほうが現場感に合う)

教訓:

- マスタ事前登録の網羅性は β リリース時点では不要。**ユーザーの実需要に応じて拡張するほうが、不要なキャラを大量に抱えるより合理的**
- 「網羅マスタ」設計は完璧主義の罠。アプリは β でリリースして観察するもの、マスタも同じ
- 表記揺れは canonical name + aliases 配列で吸収できれば良い (M-search の members.ts 同設計が機能している実績あり)
- ユーザー追加キーワードの集計 (`v_master_candidates` view、5 件以上) で運営工数を月 1-2h に圧縮可能
- 関連 (副次効果): マスタテーブルに image_url を持たない設計と相性が良い。画像ナシのテキスト最小マスタなら、IP ごとの著作権チェック工数も激減

→ 章 3.10 マスタデータ整備計画 (v1.9 全面書き換え) に反映、合計 -13-19h の工数削減。

### 7.13 機能比較と市場の取り方の緊張 (v1.10 追記)
**「競合分析の中で出る『機能比較』議論は、戦略の核心ではなく実装観点の補助に留める。戦略の中心は『現場の摩擦解消』軸を維持する」**

事例 (トレポータル実機調査 + 4 Phase 議論、`memory/project_competitor_analysis_treportal_v2.md`):

- ユーザーがトレポータル Web 版を実機登録 → ナビ最適化・検索バー・構造化カード等の機能比較議論が発生
- claude.ai は「整理屋モード」(失敗パターン 3、`memory/project_claude_self_calibration.md`) に陥りやすく、5 つの仮説を整理して提示
- 既存 memory「機能比較ではなく市場の取り方で勝つ」(`memory/project_competitor_analysis_treportal.md` v1) との緊張が発生

教訓:

- 機能比較を完全に避けるのは無理。ただし「機能で勝つ」ではなく「**市場の摩擦を解消する**」観点で機能を設計する
- Phase 1 仮説のうち「Trust 4 階層」「venue モード」「ハイブリッドマスタ」は memory 整合 (摩擦解消)
- 「ナビ最適化」「検索バー」「ファーストビュー」は機能比較寄りなので**慎重に扱う** (実装観点の補助、戦略の核心ではない)
- X DM の信頼問題、現地交換の場所問題、取引相手判断の Trust 問題 — これらを解消する機能なら memory 制約と整合
- 競合分析の出力を「整理屋モード」に堕とさないために、**ユーザーが解決したい現場摩擦に紐づくか**を毎回確認する習慣

→ 章 3.14 UI 設計指針 (v1.10 新設) で機能比較寄りの仮説を実装する際、本教訓を参照しつつ「現場摩擦解消」観点を維持。

### 7.14 アニメ × K-POP のハイブリッド戦略 (v1.10 追記)
**「カテゴリ間の時期分散 (流動性ピークの非重なり) を活かし、リソースピーク重なりを避けながら両カテゴリを同時取り。『できる最大限』を狙う本気度設計の実装例」**

事例 (Phase 1 アニメ + Phase 1.5 K-POP の構造、章 3.17):

- Phase 1 (鬼滅+コナン+サンリオ): 通年・春ピーク (コナン劇場版)、定常型流動性
- Phase 1.5 (INI / LAPONE): 秋ピーク (ドームツアー)、スパイク型流動性
- → リソースピークが時期分散されるため、単独創業者でも両方取りに行ける構造
- 旧戦略 (`memory/project_research_results_2026-05-08.md`) では INI を「スパイク型 + ライバル視」で排除していたが、**INI 単独 + 時期分散** で復活可能と判断

教訓:

- 「ターゲット絞り込み」と「ハイブリッド戦略」は対立しない。**選択軸を変えれば両立可能**
- 旧戦略の排除候補も、**新しい選択軸 (時期分散) で再評価**すれば復活の余地あり
- 「最大限取りに行く」は単純な拡張ではなく、**構造的に持続可能な拡張**を意味する
- 燃え尽きリスク管理として **decision gate** を組み込む (章 3.17-2)、戦略の意志は committed・タイミングは antifragile
- 関連: `memory/project_research_matrix_2026-05-08.md` (10 軸マトリクス)、`memory/project_competitor_analysis_treportal_v2.md` (4 Phase 議論)

→ 章 3.17 Phase 1.5 (INI 追加) 計画 (v1.10 新設) に反映、ブランドメッセージは「アニメ + K-POP の推し活アプリ」に進化予定。

### 7.15 競合の規約レベルでの構造的弱点を突く (v1.11 追記)
**「競合分析は機能・UI・規模だけでなく、利用規約・ガイドライン・規約禁止事項にも踏み込む。規約レベルで模倣困難な差別化ポイントを発見できる場合がある」**

事例 (トレポータル利用規約全文分析、`memory/project_treportal_terms_analysis_2026-05-10.md`):

- ユーザーがトレポータルアプリの利用規約全文を取得 (制定 2025-02-24)
- claude.ai 分析で **第 11 条「商品の手渡しを強要する行為」を禁止** を発見
- → これはトレポータルが**規約レベルで現地交換オプションを提供できない構造**を意味する
- → Swaply の会場モード戦略は「機能差別化」ではなく「**規約レベルで競合が模倣困難な差別化**」だった
- 既存 memory「機能比較ではなく市場の取り方で勝つ」(`memory/project_competitor_analysis_treportal.md` v1) の追加証明

教訓:

- 競合分析は **(1) 機能/UI、(2) 市場規模/MAU、(3) 創業者・規模、(4) 規約・ガイドライン** の 4 層で行う
- 規約レベルの差別化は競合が追従するコストが高い (規約変更 + 法的整合性 + ユーザー教育)
- **★最重要原則**: 規約に書かれている禁止事項は、**その競合が「やらない / やれない」と決めた構造**。Swaply はその真逆を取れば差別化できる
- 副次効果: トレポータル規約から「権利者向け削除申立窓口の不在」「『○○風』未追従」も発見、Swaply は業界標準を Day 1 で先行取り込み
- リスク管理: 規約は変更可能なため、**3-6 ヶ月毎に再取得・再分析**して構造的優位の維持を確認 (章 3.18-4 規約変更モニタリング計画)
- 関連: `memory/project_treportal_terms_analysis_2026-05-10.md` (10 個の発見 + 規約全文)、`docs/source/terms_of_service_draft_v1.md` (Swaply ToS たたき台)

→ 章 3.13 補強「規約レベルでの構造的優位」(v1.11 追加)、章 3.18 Swaply 利用規約の構造 (v1.11 新設) に反映。

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
