# CI Protocol

## 0. 目的

この文書は、SwaplyにおけるCIおよびローカル検証の扱いを統一するための運用正本である。

目的は以下。

* AIが検証失敗時に雑な修正をしないようにする
* ローカル検証とGitHub CIの意味を一致させる
* 「通すためだけの修正」を防ぐ
* 危険領域への不用意な波及を止める
* 人間に戻すべき失敗を明確にする

---

## 1. 現在の前提

### ローカル実行コマンド

* npm run ci:local
* npm run ci:validate

### 内容

ci:local
→ typecheck + lint

ci:validate
→ typecheck + lint + build

### GitHub CI

* `.github/workflows/ci.yml` が validate を実行

### 制約

* test は未導入
* 現在の品質ゲートは以下のみ

  * typecheck
  * lint
  * build

---

## 2. 基本方針

### ローカル優先

PR前に必ずローカル検証する

順番:

1. npm run ci:local
2. 必要なら npm run ci:validate

---

### CIは品質ゲート

「通ればいい」は禁止

---

### 通すための修正禁止

* any乱用
* 意味を壊す削除
* 無理やり分岐
* console削除だけ
* 危険領域回避コード

---

### CI失敗 = 情報

* 関連ファイル漏れ
* 型理解不足
* 責務誤認

---

## 3. 実行フロー

### Step1: 実装後確認

* 対象ファイル
* 関連ファイル
* import
* 型
* ルート

---

### Step2: ローカル確認

npm run ci:local

---

### Step3: build必要判断

該当する場合のみ:

* 画面追加
* ルーティング変更
* import変更
* コンポーネント追加
* 構造変更

---

### Step4: validate

npm run ci:validate

---

### Step5: PR

結果を記載

---

## 4. コマンドの意味

### ci:local

* 型崩れ防止
* import崩れ防止

必須

---

### ci:validate

* build破綻確認
* 依存確認

必要時のみ

---

## 5. 失敗分類

### AIが直してよい

typecheck:

* importミス
* 型ミス
* props不整合

lint:

* 未使用
* フォーマット

build:

* import経路
* 軽微な参照ミス

---

### AIが止まる

* DB変更
* RLS変更
* 状態遷移変更
* owner_user_id影響
* offers/trades/shipments/Trust影響
* 仕様不明
* UI矛盾

---

## 6. 再試行ルール

* 最大2回

1回目: 修正
2回目: 確認

→ 失敗なら停止

---

## 7. ログ処理

必ず整理する:

* コマンド
* ファイル
* 原因
* 対象
* 危険領域影響
* 修正可否

---

## 8. PR記載

必ず書く:

* ci:local 結果
* ci:validate 結果
* build有無
* 再試行有無

---

## 9. 危険領域ルール

対象:

* cards
* offers
* trades
* shipments
* owner_user_id
* Trust
* RLS

禁止:

* 推測修正
* 状態変更
* DB補完

---

## 10. 停止時出力

* 失敗コマンド
* 原因候補
* 停止理由
* 確認事項
* 未変更領域

---

## 11. 禁止

* 無差別修正
* 原因未特定修正
* CI無視PR
* テスト未実装なのに成功扱い

---

## 12. 成功状態

* ローカルで破綻防止
* CI前に精度担保
* 危険領域で停止
* PRに検証履歴が残る
