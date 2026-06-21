# 出品フロー 1ページ化 設計方針（確定版）

最終更新: 2026-06-21
ステータス: 方針確定・実装は次セッション

## 大前提（最重要・設計判断すべてに効く）
- Swaplyは「βテストで様子見」する事業ではない。
  すでにXに存在する推し活グッズ交換文化を移行・併用させるプラットフォーム。
- ユーザーは戻る場所（X）がある。「めんどい」と思わせた瞬間に負ける。
- βをテスト扱いしない。主要動線は「一生使えるレベル」に作り込んでからリリース。
- テストは創業者のオタク友達のレビュー。7/20の不特定ユーザー待ちではない。

## 確定方針
- 通常出品フロー（現6ステップ + confirm = 7画面）を1ページ化する。
- 下書き保存を新設する。
- 出品トップ画面を新設する。

## 新しい動線（2段構え）
[出品ボタン SubmitFab]
  ↓
[出品トップ画面]（新規作成）
  - 下書き一覧（保存した下書きがここに並ぶ）
  - 「新しく出品する」ボタン
  ↓
[出品作成1ページ]（6ステップを1ページに統合）
  譲セクション群：写真 / 作品 / キャラ / 種別 / 条件
  ───────────────
  求セクション：求リストから選ぶ（card_wanted_links、現状と同じ仕組み）
  ───────────────
  [下書き保存] [出品する]

## 確定事項
- 出品トップ画面は新規（現状は存在せず、出品ボタン→いきなりimage.tsx）。
- 求リンク（card_wanted_links）は現状のまま、1ページ内の1セクションに配置。
  やってることは現フローのwant.tsxと同じ。
- 譲セクション群と求セクションを視覚的に区切る。
- 下書き保存は1ページの集約stateを保存する形で自然に乗る。
- DB変更なし（既存のcards insert + card_wanted_links流用）。
- 並行稼働で安全移行（新ルート→FEATURE_FLAGS切替→動作確認後に旧フロー削除）。

## 現状の出品フロー（調査確定済み）
- 6ステップ + confirm = 7画面: image→work→characters→items→want→condition→confirm
- 各画面が独立route、データはURL paramsのバケツリレー（永続化なし）
- 途中離脱で全データ消失 → これが下書きが作れない根本理由
- select.tsx / ai.tsx / cardinfo.tsx はDEPRECATED（K-POP復活用に残置）
- 確定処理(confirm.tsx handleSubmit): uploadCardImage → cards insert → addCardWantedLinks
- 各ステップの中核ロジックは1ページ化で再利用可能（書き換えは20-30%、再配置が70-80%）

## 実装段取り（CCのPhase案）
- Phase A: 6ステップの入力UIをsection componentに抽出（components/listing/section/）
- Phase B: 出品作成1ページ（単一useReducer + 全section + 確定処理）
- Phase C: 出品トップ画面 + 下書き保存/一覧
- Phase D: FEATURE_FLAGSでルート切替 → 動作確認 → 既存6ステップ + redirect削除

## 次セッションで詰める残論点
- 縦スクロール疲労対策（推定1500-2500px）→ section折り畳み等
- MSA入れ子問題 → 会場sheet（PR-3.6d）のnestedScrollEnabled + keyboardShouldPersistTaps + onFocus measureLayoutパターン再利用で対処可
- 下書きの保存先（card_drafts テーブル新設 vs AsyncStorage）→ 集約stateをJSON保存が素直
- 譲/求の視覚的区切りのデザイン

## 写真AI自動入力について
- 本リリース後（DB負荷が大きい）。今回スコープ外で確定。
