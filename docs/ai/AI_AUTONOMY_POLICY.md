# AI Autonomy Policy

## 0. 目的

この文書は、SwaplyにおいてAIに自動実行させる範囲と、
人間が最終責任を持つ範囲を明確に分離するための運用正本である。

目的は以下。

1. AIが安全に実装を進められるようにする
2. 本番DBやRLSなど事故コストの高い領域を人間が保持する
3. 実装速度を上げつつ、仕様逸脱と状態破綻を防ぐ

---

## 1. 基本方針

Swaplyの開発は以下の責務分離で行う。

- 仕様は人間が決める
- 実装はAIが行う
- 承認は人間が行う

AIは「補助」ではなく「実装担当」として扱う。
ただし、すべての権限を持たせてはならない。

---

## 2. AIに許可する作業

AIが自動で行ってよい作業は以下。

### 2-1. 実装作業
- 画面実装
- UI部品の接続
- 関連ファイル探索
- 型修正
- import修正
- 定数整理
- フロントエンドの軽微なロジック修正
- テスト追加
- テスト修正
- lint修正
- typecheck修正

### 2-2. repo作業
- feature branch 作成
- 変更ファイル確認
- git diff 整理
- commit 作成
- PR本文作成
- PR作成

### 2-3. 検証作業
- lint実行
- typecheck実行
- test実行
- 失敗ログ要約
- 修正再試行

---

## 3. AIに禁止する作業

以下はAIが自動実行してはならない。

### 3-1. 仕様変更
- UI/UXの自己判断変更
- 文言の勝手な変更
- 導線変更
- 状態遷移変更
- Trustロジック変更
- 料金・調整金仕様変更

### 3-2. DB / 権限変更
- Supabase本番変更
- migration実行
- RLS変更
- policy追加/削除
- 本番データ修正
- service_role 前提運用への変更

### 3-3. Git運用の禁止
- main / master 直接push
- 承認なしmerge
- release tag作成
- deploy実行

### 3-4. 環境・秘密情報
- `.env` の勝手な編集
- secretの出力
- API keyの再設定
- CI secretの変更

---

## 4. 人間が保持する権限

以下は必ず人間が最終判断する。

- 仕様確定
- UI/UX最終判断
- DB本番変更
- RLS変更
- migration適用
- PR承認
- merge承認
- release判断

---

## 5. AIの標準実行フロー

AIは毎回以下の順番で動く。

1. タスク確認
2. 対象ファイル探索
3. 関連ファイル探索
4. 影響範囲確認
5. Source of Truth照合
6. 実装
7. lint/typecheck/test
8. 変更要約
9. commit
10. PR作成
11. 人間レビュー待ち

---

## 6. Source of Truth

### Layer A: UI正本
- プロトタイプPDF
- 画面単位仕様書
- プロダクト仕様書

### Layer B: 状態正本
- Supabase DB
- 状態遷移設計
- エンジニア仕様書

### 禁止
- コードを正とみなすこと

---

## 7. AIの作業対象ディレクトリ

原則としてAIが触ってよい候補は以下。

- app/
- components/
- lib/
- constants/
- hooks/
- providers/
- types/
- __tests__/
- docs/ai/

ただし実際の許可範囲はrepo構造確認後に別文書で確定する。

---

## 8. AIの停止条件

以下の場合、AIは自動実装を停止し、人間確認に切り替える。

- 仕様書と既存UIが矛盾する
- DB構造が不明
- status遷移に影響する
- owner_user_id に影響する
- trades / offers / shipments / trust に波及する
- migrationが必要
- RLSが関係する
- CIが複数回連続で失敗する
- 修正範囲が想定より広い

---

## 9. 成功状態

この運用の成功状態は以下。

- AIが画面実装を自動で進められる
- AIがrepo探索を自動で行える
- AIがlint/typecheck/testまで自己完結できる
- AIがPRを出せる
- 人間は仕様確認・実機確認・承認に集中できる

---

## 10. 更新ルール

この文書は以下の場合のみ更新する。

- repo構造の変更
- CI運用の変更
- Git運用の変更
- Supabase運用の変更
- 実運用で事故が起きた場合