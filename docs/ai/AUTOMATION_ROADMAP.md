# Automation Roadmap

## 0. 目的

この文書は、Swaplyの半自動開発体制を
「AIが実装担当、人間が最終承認」
まで持っていくための段階導入ロードマップである。

目的は以下。

- 開発速度を上げる
- 実装品質を安定させる
- repo理解の再現性を上げる
- DB事故を防ぐ
- AIの権限境界を明確に保つ
- 人間の判断対象を高付加価値領域に絞る

この文書は理想論ではなく、
Swaplyの現状repoを前提に、安全に前進するための現実ロードマップとして扱う。

---

## 1. 基本方針

### 1-1. 責務分離

Swaplyの開発は以下で分離する。

- 仕様確定: 人間
- UI/UX最終判断: 人間
- 本番DB変更: 人間
- RLS変更: 人間
- merge承認: 人間

- 画面実装: AI
- 関連ファイル探索: AI
- 型修正: AI
- lint / typecheck / build: AI
- PR作成: AI

### 1-2. 非ゴール

以下は当面、自動化しない。

- AIによる本番DB変更
- AIによるRLS変更
- AIによるmain/masterへの直接push
- AIによるmerge
- AIによる仕様変更
- AIによるUI/UXの自己判断変更
- AIによるrelease実行

### 1-3. 原則

- コードを正としない
- UIはUI正本を優先する
- 状態はDB正本を優先する
- 差分だけで進めない
- 危険領域は常に停止条件を持つ
- AIの権限は必要最小限から始める

---

## 2. 現在地

現時点で確認できている前提は以下。

- Expo + React Native
- Expo Router
- TypeScript
- Supabase利用
- GitHub Actions CIあり
- `npm run lint` あり
- `npm run typecheck` あり
- `npm run build` あり
- `npm run ci:local` と `npm run ci:validate` を運用コマンドとして採用可能
- `test` script は未導入

### 現在できること
- AIがrepoを読んで関連ファイルを探索する
- AIが画面実装する
- AIが型修正する
- AIがlint/typecheck/buildを回す
- AIがPR本文を作る

### まだ未完成のこと
- test運用
- PR記載漏れの機械チェック
- branch protection前提の完全運用
- repo責務マップの明文化
- DB変更レビュー運用の固定
- RLSレビュー運用の固定

---

## 3. 到達目標

最終目標は以下。

1. 人間が仕様を定義する
2. AIがrepoを読む
3. AIが関連ファイルを探索する
4. AIが画面実装・型修正を行う
5. AIが lint / typecheck / build / test を回す
6. AIが branch / commit / PR を作る
7. CI が自動実行される
8. 人間が実機確認を行う
9. 人間が仕様・UI/UX・本番変更・RLS・mergeを判断する

---

## 4. フェーズ設計

## Phase 0: 運用ルールの固定

### 目的
AIが勝手な流儀で実装しないようにする。

### 完了条件
- `LOCAL_AGENT_RUNBOOK.md` がある
- `IMPLEMENTATION_FLOW.md` がある
- `PULL_REQUEST_TEMPLATE.md` がある
- AIの許可範囲 / 禁止範囲が文書化されている

### 成果物
- `docs/ai/LOCAL_AGENT_RUNBOOK.md`
- `docs/ai/IMPLEMENTATION_FLOW.md`
- `.github/PULL_REQUEST_TEMPLATE.md`

### 状態
進行中

---

## Phase 1: PR運用の固定

### 目的
AIが出すPRの品質を最低限そろえる。

### やること
- PRテンプレート固定
- 影響範囲の記載強制
- Source of Truth 記載強制
- 危険領域チェックの標準化
- 実機確認項目の明文化

### 完了条件
- PRごとに目的・対象ファイル・関連ファイル・影響範囲が残る
- 実機確認項目が毎回書かれる
- DB/RLS/危険領域の有無が毎回可視化される

### 必要ファイル
- `.github/PULL_REQUEST_TEMPLATE.md`
- `docs/ai/PR_REVIEW_CHECKLIST.md`
- `docs/ai/CHANGE_IMPACT_TEMPLATE.md`

---

## Phase 2: ローカルAI実装フローの固定

### 目的
AIがローカルrepo上で安全に実装できるようにする。

### やること
- 実装前の確認手順固定
- 実装後の検証手順固定
- branch作成ルール固定
- commit粒度固定
- 停止条件固定

### 完了条件
- AIが毎回同じ順序で動く
- 危険領域では停止できる
- 無関係ファイルの巻き込みが減る

### 必要ファイル
- `docs/ai/LOCAL_AGENT_RUNBOOK.md`
- `docs/ai/IMPLEMENTATION_FLOW.md`

---

## Phase 3: CIの意味付け強化

### 目的
CIを「ただ通ればいいもの」ではなく、AI実装の品質ゲートにする。

### やること
- `ci:local` と `ci:validate` の運用固定
- lint / typecheck / build の責任範囲明確化
- CI失敗時のAI再修正フロー明文化

### 完了条件
- AIがローカルで回すコマンドとGitHub CIの意味が一致する
- CIで落ちる基本的な破綻をPR前に減らせる

### 必要ファイル
- `package.json`
- `.github/workflows/ci.yml`
- `docs/ai/CI_PROTOCOL.md`

---

## Phase 4: repo責務の見える化

### 目的
AIがrepoを読むたびに迷わないようにする。

### やること
- route map 作成
- domain map 作成
- UI正本参照先一覧化
- DB責務一覧化
- 危険領域一覧化

### 完了条件
- どのファイルが何の責務かをAIが判断しやすくなる
- 関連ファイル探索の精度が上がる

### 必要ファイル
- `docs/ai/REPO_MAP.md`
- `docs/ai/ROUTE_MAP.md`
- `docs/ai/DOMAIN_MAP.md`
- `docs/ai/DB_RESPONSIBILITY_MAP.md`

---

## Phase 5: test導入

### 目的
lint/typecheck/build だけでは防げない回帰を止める。

### 優先順位
1. 状態遷移
2. pure function
3. query helper
4. 権限境界
5. 主要画面の表示条件

### 最優先テスト対象
- offers status
- trades status
- shipments status
- owner_user_id の整合
- Trust集計
- ホーム表示レーンの組み立て
- カード表示条件
- 調整金制約ロジック

### 完了条件
- `test` script が追加されている
- 主要危険領域に最低限の回帰防止がある
- PR前にAIが test を回せる

### 必要ファイル
- `package.json`
- テスト設定ファイル
- `__tests__/` 配下ファイル群

---

## Phase 6: DB変更運用の固定

### 目的
DB変更をAIの通常実装フローから切り離し、事故を防ぐ。

### やること
- migrationの扱いを人間承認必須にする
- DB変更テンプレを作る
- 状態遷移変更テンプレを作る
- RLSレビュー手順を固定する

### 完了条件
- DB変更は通常PRと分離される
- RLS変更は必ず人間判断になる
- フロント修正とDB修正が混ざりにくくなる

### 必要ファイル
- `docs/ai/DB_CHANGE_PROTOCOL.md`
- `docs/ai/RLS_REVIEW_PROTOCOL.md`
- `docs/ai/STATE_MACHINE_REGISTRY.md`

---

## Phase 7: GitHub保護運用の固定

### 目的
AIがPRまで作れても、危険なmergeが起きない状態にする。

### やること
- main branch protection 有効化
- PR必須化
- CI成功必須化
- review必須化

### 完了条件
- main に直接入らない
- CI失敗PRがmergeされない
- 人間承認なしでmergeされない

### 必要設定
- GitHub branch protection
- repository settings

---

## Phase 8: 半自動開発体制の完成

### 目的
AIが安全に実装を進め、人間が高判断コスト領域だけを握る状態にする。

### 成功状態
- AIが画面実装を行う
- AIが関連ファイルを探索する
- AIが型修正する
- AIが lint / typecheck / build / test を回す
- AIがPRを作る
- 人間は仕様、UI/UX、Supabase本番変更、RLS、merge承認に集中する

---

## 5. 自動化対象と非対象

## 自動化対象
- 画面実装
- 関連ファイル探索
- 型修正
- import修正
- lint
- typecheck
- build
- test
- branch作成
- commit作成
- PR作成

## 非自動化対象
- 仕様確定
- UI/UX最終判断
- Supabase本番変更
- RLS変更
- migration適用
- merge承認
- release判断

---

## 6. 停止条件

以下に該当したら、AIは自動実装を停止して人間に確認を返す。

- 仕様が不明
- UI正本と既存画面が矛盾
- DB変更が必要
- RLS変更が必要
- 状態遷移変更が必要
- `owner_user_id` に影響する
- `cards / offers / trades / shipments / Trust` に波及する
- 許可範囲を超える
- CIまたはローカル検証が複数回失敗する

---

## 7. 直近の優先順位

直近でやる順番は以下。

1. `AUTOMATION_ROADMAP.md` 作成
2. `PR_REVIEW_CHECKLIST.md` 作成
3. `CHANGE_IMPACT_TEMPLATE.md` 作成
4. `CI_PROTOCOL.md` 作成
5. branch protection 設定確認
6. test導入設計
7. repo責務マップ作成
8. DB/RLS運用プロトコル作成

---

## 8. 成功判定KPI

以下で進捗を測る。

### 品質
- CI fail率
- merge後バグ率
- 危険領域の事故件数
- DB不整合件数

### 速度
- タスク定義からPRまでの時間
- PRからmergeまでの時間
- 実機確認完了までの時間

### 運用
- PR記載漏れ率
- 実機確認漏れ率
- AIが最初に当てる関連ファイル精度
- 停止条件発動時の誤実装率

---

## 9. 更新ルール

この文書は以下の場合のみ更新する。

- repo構成が変わった
- CI運用が変わった
- test運用が入った
- GitHub運用が変わった
- Supabase運用が変わった
- 実運用で事故が発生し、段階設計を見直す必要が出た

思いつきで更新しない。