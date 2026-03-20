# Local Agent Runbook

## 0. 目的

この文書は、Swaplyでローカル実装エージェントを動かすときの標準手順を定義する。

ここでいうローカル実装エージェントとは、
開発PC上のrepoを読み取り、ファイル編集・コマンド実行・git操作・PR作成まで行うAIを指す。

---

## 1. この運用の完成形

完成形は以下。

1. 人間がタスクを定義する
2. AIが関連ファイルを探索する
3. AIが必要な画面実装を行う
4. AIが型修正を行う
5. AIが lint / typecheck を回す
6. 必要なら build を回す
7. AIが branch / commit / PR を作る
8. 人間が実機確認する
9. 人間が仕様・UI/UX・本番変更・RLS・mergeを判断する

---

## 2. AIに許可すること

* repo探索
* ファイル読み取り
* ファイル編集
* 画面実装
* 型修正
* import修正
* lint実行
* typecheck実行
* build実行
* branch作成
* commit作成
* PR本文作成
* PR作成

---

## 3. AIに禁止すること

* Supabase本番変更
* migration実行
* RLS変更
* policy変更
* main/master 直接push
* merge
* release
* `.env` 編集
* secret表示
* 仕様自己変更
* UI/UX自己変更

---

## 4. 推奨実行フロー

### 4-1. タスク入力

人間は以下をAIへ渡す。

* タスク名
* 目的
* 完了条件
* 変更可能範囲
* 禁止範囲
* 参照すべきUI正本

### 4-2. AI初動

AIは最初に以下を行う。

1. `app/` を読む
2. 関連 `lib/` を読む
3. 型定義を読む
4. 対象画面のルートを確認する
5. 既存の類似画面を探す
6. `docs/ai/` を読む
7. 変更影響を整理する

### 4-3. AI実装

AIは以下のみを実施する。

* 許可範囲内の編集
* 許可範囲内の新規ファイル追加
* 型修正
* lint修正
* 関連 import 修正

### 4-4. AI検証

AIは以下を実行する。

```bash
npm run ci:local
```

必要な場合のみ:

```bash
npm run ci:validate
```

### 4-5. Git処理

AIは以下を実施してよい。

* feature branch 作成
* git status 確認
* git diff 確認
* commit 作成
* PR作成

### 4-6. 人間確認

人間は以下を実施する。

* 実機確認
* UI/UX最終判断
* Supabase本番変更判断
* RLS変更判断
* マージ承認

---

## 5. 標準ブランチ戦略

AIは必ず feature branch で作業する。

命名例:

* feature/ui-home-lane-fix
* feature/propose-screen-alignment
* feature/listing-detail-ui

禁止:

* main 直接作業
* master 直接作業
* develop 直接作業

---

## 6. 標準コミット粒度

AIは1タスク1PRを基本とする。

望ましい:

* 1つの目的に閉じる
* UI変更とDB変更を混ぜない
* CI変更と画面変更をできるだけ分ける

避ける:

* 無関係ファイルの同時修正
* ついで修正
* 大量の整形混入

---

## 7. 実行コマンドの意味

### npm run ci:local

ローカル実装時の最低確認。

* typecheck
* lint

### npm run ci:validate

PR前またはCI相当確認。

* typecheck
* lint
* build

---

## 8. 停止条件

以下の場合、AIは作業を止めて人間へ確認を返す。

* 仕様が不明
* 仕様書と既存画面が矛盾
* DB変更が必要
* RLS変更が必要
* 状態遷移変更が必要
* owner_user_id に影響する
* trades / offers / shipments / Trust に波及する
* 許可範囲を超える
* 検証が複数回失敗する

---

## 9. 現時点の制約

現時点の repo では test script が存在しない。
そのため、AIが自動で回せる品質確認は以下に限定される。

* typecheck
* lint
* build

将来的に test 導入後は、この文書を更新する。

---

## 10. 成功状態

この運用の成功状態は以下。

* AIが画面実装を自律的に進められる
* AIが関連ファイルを自分で探索できる
* AIが型崩れを自分で直せる
* AIが lint/typecheck/build を自分で回せる
* AIがPRを作れる
* 人間は仕様・実機確認・承認だけに集中できる
