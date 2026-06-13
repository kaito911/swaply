# 会場モード要件定義 v1.1

- バージョン: v1.1（確定寄り）
- 最終更新: 2026-06-13
- 対象: Swaply 会場モード刷新（β1）
- 前提: 実装は Claude Code が担当。本書はリポジトリ上に固定する仕様。実装コードは含まない。

## 凡例（情報の確からしさ）

- **[確定]** CC のコード / DB 調査で裏が取れた事実、または本プロジェクトのプロダクト判断として確定したもの。
- **[推測]** 設計上の推奨・方針。妥当性は高いが最終決定者の承認で変わり得る。
- **[要確認]** 実装前に CC が一次情報（実スキーマ / コード）で確定すべきもの。本書の数値・命名で勝手に埋めない。

**横展開前提（全体に効く方針）**: 当面の獲得対象は TREASURE。ただしアニメ系・他 K-POP グループへ展開する可能性が高いため、「拡張可能な構造は P0、拡張の中身（実データ seed・ジャンル別 UI）は P2」 とする。会場モードのマスタ / マッチングキーはジャンル非依存の汎用属性で持ち、TREASURE はその 1 データセットとして運営登録する。

---

## 1. 会場モードの定義

会場モードは、単なる当日掲示板ではなく **「イベント単位のリアルタイム手渡し交換ハブ」** である。

会場モードが完走させるべきコアループ（P0）:

```
出品 → 気づく → Hold → 承認 → DM で合流 → 手渡し確認 → 履歴保持
```

**[確定]** 現状はこのループが「気づく」で切れている。投稿者が自分宛 Hold に気づけず、承認導線に到達できず、成立後の合流連絡手段がなく、完了履歴も見えない。本刷新の本質は「バグ修正」ではなく、このループを一度も最後まで通っていない状態を解消することである。

会場モードは概念的に 3 レーンで構成される（旧設計の Smart Matching / Live Supply Board / Venue Shelf に対応）:

- **成立候補（Smart Matching）** = 双方の譲求が噛み合う相手を提示。
- **当日供給板（Live Supply Board）** = 今この場で出している短命投稿。
- **会場商品棚（Venue Shelf）** = 持っていく交換候補の永続リスト。表向きはコレクション管理だが、本質は供給を生み出す供給 DB である。

---

## 2. β1 / P0 の完成条件

以下 15 項目がすべて満たされたとき、会場モードは β1 の P0 最小完成形とする。

1. イベントが表示され、イベント詳細に入れる
2. 当日供給板に写真付き投稿できる
3. キーボード被りなしで入力できる
4. 自分の会場投稿一覧が見える
5. 投稿に対して Hold 申請できる
6. 受信 Hold / 送信 Hold が分離して見える
7. Hold に気づける バッジ / CTA がある
8. Hold 承認 / 拒否ができる
9. Hold 承認で venue_trade が生成される
10. Hold 承認後、venue_trade 専用 DM が開く
11. 自由入力テキスト + 定型文で合流連絡ができる
12. 双方が手渡し完了確認できる（どちらが先でもよい）
13. completed 履歴が残る（取引アイテムのスナップショット込み）
14. active venue_trade 中は退会拒否される
15. 退会後も相手側に「削除済みユーザー」として履歴が残る

**運用上の区別**: A-3 E2E が走る地点（trade 生成 + active 退会拒否 = trade flow PR 後） と β1 プロダクト最小（DM PR 後） は別物として管理する。

---

## 3. P0 / P1 / P2

### P0（無いと会場モードが成立しない）

- イベント表示ロジック修正（複数日・status・時刻ベース）
- 当日供給板への写真付き投稿（image 列追加 + storage RLS）
- 投稿フォームのキーボード被り修正 + 期限 15 / 30 / 60 分選択
- 自分の会場投稿一覧画面
- 受信 Hold / 送信 Hold の分離 + 気づき導線（バッジ / CTA） + 投稿ごと Hold 件数
- Hold 承認 / 拒否 / キャンセル導線 + 承認待ち期限 + 期限切れ表示
- 複数 Hold → 投稿者選択式 + 承認時の supply_post close + 他 pending 自動 declined + 二重成立 DB 防御
- venue_trade 状態再設計（案 A・対称確定・receiver_confirmed バグ修正）
- 取引アイテムのスナップショット（venue_trade 生成時に商品名・画像・求内容を保持）
- venue_trade 専用 DM（自由入力 + 定型文 + 未読 + 証跡保持・編集 / 削除不可）
- 双方手渡し確認 → completed → 履歴保持
- active venue_trade 中の退会拒否（active 判定の更新を含む）
- 退会後も相手側に「削除済みユーザー」として履歴が残る

### P1

- 会場商品棚 + 棚 → 供給板ワンタップ投稿（P1 最上位 = 供給エンジン）
- 成立候補（Strong のみ・都度計算・非永続）
- 参加予定（RSVP） / チェックイン
- DM の Realtime 化
- 通報 UI（証跡データは P0 で保持済みのため、UI のみ P1）
- 承認待ち期限切れの自動掃き出し（pg_cron）

### P2

- イベント情報の自動取得・ユーザー申請
- 位置情報・QR 合流・会場マップ
- **誰にでも送れる一般自由 DM**（venue_trade 専用 DM は P0、本項目とは別物として扱う）
- DM の画像送信・位置情報共有・音声送信
- Medium / Weak 成立候補、複雑なレコメンド、Push 通知、主催者 / 事務所連携、在庫管理、差額決済、匿名配送
- venue_checkins.user_id / venue_supply_posts.user_id の profiles 参照寄せ（M-cleanup）
- storage 実ファイルの退会時クリーンアップ
- profiles 手動 DELETE 防御
- 複数日イベントの「日別ルーム」分割
- アニメ系・他 K-POP グループの実データ seed + ジャンル別 UI 最適化（拡張の中身）

---

## 4. 画面要件

各画面に空状態・エラー状態を必須で定義する。

| 画面 | 目的 | 主表示 | 主 CTA | 空 / エラー | 優先 |
|---|---|---|---|---|---|
| イベント一覧 `/venue/index` | 入口 | 開催中 / 近日 / 参加予定カード（名称・会場・日付・状態・件数）＋未読 Hold バッジ | イベントを開く | 「対象イベントなし」/ 再取得 | P0 |
| イベント詳細 `/venue/[id]` | ハブ | 最上部に「届いた Hold (n)」固定 / 当日供給板 / (P1: 成立候補・棚) | 出品 / Hold 画面 / 合流 | セクション別フォールバック | P0 |
| 当日供給板 | 募集閲覧 | 写真・譲 / 求・投稿者 Trust・残時間 | Hold 申請 | 「募集なし」/ 期限切れは非表示 | P0 |
| 会場出品フォーム | 出品 | 写真・譲 / 求・期限 15 / 30 / 60 | 投稿 | 写真アップ失敗時に入力保持＆リトライ | P0 |
| 自分の会場投稿一覧 | 管理 | active / 期限切れ・Hold 件数バッジ | 取り下げ / 受信 Hold へ | 「未出品」 | P0 |
| Hold `/venue/holds`（受信 / 送信 / 成立済タブ） | Hold 全把握 | 受信: 相手の譲 / 求 + 承認 / 拒否、送信: 状態、成立済: DM へ | 承認 / 拒否 / キャンセル | タブ別「なし」/ 対象投稿削除済の表示 | P0 |
| 会場取引詳細 + DM | 合流〜完了 | 相手 Trust・双方の譲 / 求（スナップショット）・状態・DM スレッド・定型文チップ・手渡し完了 | 送信 / 完了確認 | 送信失敗 / 退会済相手 / cancelled は閲覧のみ | P0 |
| 会場商品棚（作成・編集） | 事前準備・供給源 | 写真・商品名・作品 / グループ・キャラ / メンバー・シリーズ / ツアー・求め | 供給板に出す / 編集 / 削除 | 「棚が空」 | P1 最上位 |

---

## 5. DB 要件

**[確定]** 既存テーブルとカラムの現状を踏まえた差分のみ記載。

### venue_supply_posts

- **[確定]** status: `active` / `withdrawn` / `held`、expires_at あり（作成時 +30 分固定）、cron なし、読取時に `active AND expires_at > now()` でフィルタ、DB 上は期限切れも active のまま。`held` は定義のみで書き込み経路なし。画像カラムなし。
- 変更方針: `image_path`（text, nullable）を追加する。
- 変更方針: `held` への書き込み経路を持たせる（承認時のロック先）。
- 変更方針: `expires_at` を作成時に 15 / 30 / 60 分のユーザー選択値で設定する（既定 30 分）。
- 方針: `expired` status は追加しない（enum に無く、expires_at 派生で処理する）。post 期限は板の表示可否のみを支配し、pending Hold の生存には影響させない（§10 参照）。

### venue_holds

- **[確定]** status: `pending` / `held` / `expired` / `cancelled` / `converted`、expires_at あり（+30 分）。ただし `pending → expired` 自動遷移なし、fetch フィルタなし、受信 / 送信を合算取得。
- 変更方針: `declined` を CHECK に追加する（拒否 / 兄弟 Hold 承認時の自動非 active 化を意味づけ）。
- 方針: ステータス運用を整理する。
  - 承認された 1 件 → `converted`（trade 生成済み）
  - 拒否 / 兄弟承認で自動 → `declined`
  - 申請者の取消 → `cancelled`
  - 承認待ち期限切れ → `expired`（lazy 判定。P1 で pg_cron）
  - `held`（holds 側）は本設計では使用しない（legacy 扱い）。
- 変更方針: `expires_at` の既定を承認待ち期限（10〜15 分、§10）に合わせる。**[要確認]** 既定値を 10 / 15 のどちらにするか。

### venue_trades

- **[確定 → PR4a 適用済 2026-06-13]** status を `pending` / `partially_confirmed` / `completed` / `cancelled` に再設計済。
  - 旧バグ: コードが `${role}_confirmed` を生成するため receiver 先行確定で CHECK 違反 (B2)
  - PR4a で CHECK migration + role 中立対称確定に書き換え。`receiver_confirmed` バグ消滅。
  - 本番 `proposer_confirmed` 行: 0 件 (適用前確認、データ移行 UPDATE は 0 行成功)。
  - 詳細: `docs/migration_venue_trades_state_partially_confirmed.sql`
- 変更方針: スナップショット列を追加（`offered_snapshot` / `wanted_snapshot`、jsonb 想定）。venue_trade 生成時に商品名・画像（image_path）・求内容を確定値として保持する。**[要確認]** 構造化属性までスナップショットするか（最低でも商品名 + 画像 + 求内容）。
- **[要確認]** `completed_at` 列が既存か。無ければ追加。
- **[要確認]** venue_trades が `supply_post_id` を直接持つか、Hold 経由か（二重成立防御のキーとスナップショット取得元に影響）。

### 二重成立防御

- 同一 supply_post につき非終端 trade（`pending` / `partially_confirmed`）は最大 1 件 を保証する partial unique index を張る。
- 加えて承認 RPC をトランザクション化し、ロック下で「supply_post → held」「選択 hold → converted」「他 pending → declined」「trade 生成（スナップショット込み）」を原子的に行う。

### 新規テーブル（DM）

- `venue_trade_messages`（§8）
- `venue_trade_reads`（§8）

### FK 未寄せ（既存）

- **[確定]** `venue_checkins.user_id` / `venue_supply_posts.user_id` は `auth.users(id) ON DELETE CASCADE` のまま（PR #24 未対象）。
- 方針: スナップショットで履歴を守るため、これらの profiles 寄せは P2（M-cleanup） とする。

---

## 6. RLS 要件

**[確定]** 現状: venues = 誰でも read / checkins = 誰でも read・本人 manage / supply_posts = 誰でも read・本人 manage / holds = 当事者のみ / trades = 当事者のみ / storage = repo 上不明。

- **venues**: read = 誰でも（維持）。manage = 運営のみ（イベント登録）。
- **venue_checkins**: β1 は現状維持（read = 誰でも、manage = 本人）。**[推測]** 参加者限定 read に絞れれば絞る（checkin 自体が P1 のため優先度低）。
- **venue_supply_posts**: read = 認証ユーザー（維持）、manage = 本人（維持）。
- **venue_holds**: 当事者のみ（維持）。第三者に Hold 主体は秘匿。
- **venue_trades**: 当事者のみ（維持）。
- **venue_trade_messages**: SELECT / INSERT = 当該 trade の `proposer_id` / `receiver_id` のみ。INSERT は更に `sender_id = 自分` かつ送信窓内（§8）。UPDATE / DELETE = 禁止。
- **venue_trade_reads**: 自分の行（`user_id = 自分`）のみ upsert。
- **storage**: repo に無いため明示的に SQL で定義し直す方針。write = owner path スコープ、read = 公開（板写真は閲覧者に見える必要）。**[要確認]** バケットは `card-images` を venue prefix 流用か `venue-images` 新設か。
- **[要確認]** RLS は `profiles.id = auth.uid()` を前提に組む（tombstone の handle 生成から強く示唆。最終は policy で担保）。
- **tombstone 整合**: RLS は `profiles.id` 参照のため退会後も機能する。表示は「削除済みユーザー」。

---

## 7. 状態遷移

### venue_supply_posts（enum: `active` / `withdrawn` / `held` を維持）

```
active ──承認でロック──▶ held（成立済み・板から落ちる）
active ──本人取り下げ──▶ withdrawn
active ──expires_at < now()──▶（DB 上 active のまま。UI / RPC で無効扱い。held 化はしない）
```

- post 期限切れは「板表示の終了」のみ。pending Hold は受信 Hold 一覧で各自の承認待ち期限まで生存。
- cancelled trade 後の自動復帰はしない（再出品 = 新規作成、β1）。

### venue_holds（推奨 enum: `pending` / `converted` / `declined` / `cancelled` / `expired`、`held` は不使用）

```
pending ──投稿者が承認──▶ converted（同時に対象 supply_post → held、venue_trade 生成）
pending ──投稿者が拒否 / 兄弟 Hold 承認で自動──▶ declined  ← declined を CHECK 追加
pending ──申請者が取消──▶ cancelled
pending ──承認待ち期限切れ──▶ expired（lazy 判定。P1 で pg_cron）
```

- 複数 pending Hold を許容。投稿者が受信 Hold 一覧から 1 件を選択。
- 承認は原子的トランザクション（§5「二重成立防御」）。

### venue_trades（推奨 enum: `pending` / `partially_confirmed` / `completed` / `cancelled`）

```
pending ──片側が {自分 role}_confirmed_at をセット──▶ partially_confirmed
partially_confirmed ──もう片側もセット（両 timestamp 揃う）──▶ completed（completed_at セット）
pending / partially_confirmed ──当事者が取消──▶ cancelled
```

- **対称確定**: 確定アクションは常に「自分 role 側の timestamp」を書く。status 文字列に role を入れない（`receiver_confirmed` バグ消滅）。両者非 NULL → `completed`、片方のみ → `partially_confirmed`。冪等。
- `partially_confirmed` の自動失効はしない（片側が現物を渡した可能性 / β1 に紛争フローなし）。詰まりは手動キャンセルで解消（退会ブロックも解ける）。`pending` はイベント終了 + 猶予で掃き出し可（P1・pg_cron）。
- 退会 active 判定: `(pending, partially_confirmed)`（旧 `(pending, proposer_confirmed)` から更新）。

### venue_trade_messages（status 無し・追記専用・不変）

生成のみ。編集 / 削除なし。`kind = 'user' | 'system'`

### venue_trade_reads（status 無し）

`(trade_id, user_id)` ごとに `last_read_at` を upsert

---

## 8. DM 要件（venue_trade 専用 DM）

### 位置づけ

- **[確定]** Swaply に既存の DM / チャット機能はない。完全新規。P0。
- 自由 DM ではない。Hold 承認 → venue_trade 生成後に開く取引専用 DM。当事者 2 名のみ。
- 目的: 会場での合流・場所共有・目印・遅延連絡・完了前後の連絡。
- 自由入力テキストが主、定型文は補助（チップ）。
- メッセージは不変（編集 / 削除不可）・履歴保持＝証跡（証跡保持は P0）。
- 画像・位置・音声は β1 では後回し（P2）。

### テーブル: venue_trade_messages

| カラム | 型 | 備考 |
|---|---|---|
| `id` | uuid pk | `message_id`（将来通報用に保持） |
| `trade_id` | uuid not null → `venue_trades(id) ON DELETE CASCADE` | |
| `sender_id` | uuid not null → `profiles(id) ON DELETE CASCADE` | tombstone 前提のため実害なし。手動削除時は trade ごと CASCADE で一貫消滅 |
| `kind` | text not null default `'user'` | `'user'` / `'system'`（「成立しました」「手渡し完了」等で時系列が読める） |
| `body` | text not null | 長さ CHECK（例 1〜2000） |
| `created_at` | timestamptz default `now()` | |

- 編集 / 削除用カラムは持たない（不変）。

### テーブル: venue_trade_reads

| カラム | 型 | 備考 |
|---|---|---|
| `trade_id` | uuid → `venue_trades(id) ON DELETE CASCADE` | |
| `user_id` | uuid → `profiles(id) ON DELETE CASCADE` | |
| `last_read_at` | timestamptz | |

- PK: `(trade_id, user_id)`

### RLS

- **messages** SELECT / INSERT: 当該 trade の `proposer_id` / `receiver_id` のみ。INSERT は更に `sender_id = 自分` かつ送信窓内。UPDATE / DELETE = 禁止。
- **reads**: 自分の行のみ upsert（当事者条件付き）。

### 既読・未読バッジ

- 未読数 = `messages WHERE trade_id = ? AND created_at > my.last_read_at AND sender_id <> 自分 AND kind = 'user'`。
- バッジ表示先: 会場タブ / Hold「成立済み」タブ / 取引カード。

### 送信可否（窓）

- `pending` / `partially_confirmed`: 送信可。
- `completed`: `completed_at + 48h` まで送信可（24h でも可。定数で調整。複数日イベントでも取引単位なので過長にならない）。猶予後は閲覧のみ。
- `cancelled`: 送信不可・閲覧のみ。
- 送信可否は send RPC 側で窓判定する方針。RLS は「当事者 + 非 cancelled」を最低限の防壁とする。

### 退会後の表示

- sender / 相手が tombstone でも `profiles.id` 維持のため当事者 RLS は機能。表示は「削除済みユーザー」。本文は証跡として残る。

### 通報・証跡

- 証跡保持（不変 + 保持）= P0。
- 通報 UI = P1。ただし将来通報に使えるよう `message_id` / `trade_id` / `sender_id` / `body` / `created_at` を保持する（上記テーブルで満たす）。

### Realtime or polling

- β1 は polling: DM 画面表示中 5〜10 秒間隔 + 前面復帰時 refetch + pull-to-refresh。バッジは一覧再訪時更新。
- Realtime は P1（TREASURE 実戦のため、Supabase Realtime の有効化が軽ければ前倒し検討可）。

---

## 9. 画像要件

- **[確定]** cards は画像列 + `card-images` バケットを持つ。venue_supply_posts には画像列なし。storage RLS は repo に無い。
- 変更方針: `venue_supply_posts` に `image_path` を追加（`image_url` ではなく path。バケット / ドメイン変更耐性）。**[要確認]** cards 既存命名と統一する。
- バケット: β1 は `card-images` を venue prefix（例 `venue-supply/{user_id}/...`）で流用する方針。長期的には `venue-images` 新設が綺麗。**[要確認]** 最終決定。
- 写真の必須性: β1 は任意（強く推奨）。会場での速さを優先し、テキストのみ投稿も許す。棚経由投稿は写真を自動付与。
- アップロード失敗 UX: 入力テキストを保持・リトライ・再失敗時は画像なしで投稿可（graceful degrade）。
- storage RLS: write = owner path スコープ、read = 公開（§6）。
- 退会時の storage 実ファイル残存: β1 は残置を許容し P2 でクリーンアップ（グッズ写真の PII 混入は低リスク）。スナップショットで画像参照を保持するため、履歴側は別途 `image_path` を保持する点に留意。

---

## 10. 期限要件（3 種を分離）

| 種別 | 対象 | 値 | 実装メモ |
|---|---|---|---|
| 供給板表示期限 | `venue_supply_posts` | 15 / 30 / 60 分から選択・既定 30 | `expires_at`。投稿フォームで選択。板表示可否のみ支配 |
| Hold 承認待ち期限 | `venue_holds` | 10〜15 分 | `expires_at` を活用。`pending → expired` は lazy 判定（P1 で pg_cron）。**[要確認]** 既定値 |
| 合流猶予（completed 前） | `venue_trades` | `ends_at` 基準 + 猶予 | イベント終了基準でよい。`partially_confirmed` は自動失効しない |
| DM 送信猶予（completed 後） | `venue_trade_messages` | `completed_at + 48h`（24h でも可） | 取引単位。複数日でも過長にならない |

- 失効方式: β1 は **lazy**（fetch / RPC 時のフィルタ + 承認 RPC のガード）。`expires_at < now()` の post は板非表示、期限切れ pending Hold は承認不可。pg_cron での能動的掃き出しは P1。
- 供給板 post 期限と Hold 承認待ち期限は独立。post が板から消えても、pending Hold は受信 Hold 一覧で承認待ち期限まで生存する。

---

## 11. 退会 / 履歴保持要件

- **[確定]** `delete_my_account` は profiles を tombstone 化する。
  - profiles 行は物理削除しない（`delete from public.profiles` は存在しない）。
  - `handle = 'deleted_user_' + user_id 先頭 8 桁`、`display_name = '削除済みユーザー'`。
  - `avatar_url` / `shipping_name` / `postal_code` / `address_line1` / `address_line2` / `last_active_at` 等を NULL 化。`profiles.id` は維持。
- **[確定]** そのため PR #24 の `venue_holds` / `venue_trades` → `profiles ON DELETE CASCADE` は、通常退会では履歴を壊さない。
- 残リスク: profiles を手動 DELETE すると CASCADE で履歴が消える。→ 運用ルール + 将来的な DB 防御で対処（P2）。
- **取引アイテムのスナップショット（P0）**: supply_post 削除（退会時の auth.users CASCADE 等）で「何を交換したか」が失われないよう、venue_trade 生成時に商品名・画像（image_path）・求内容をスナップショットして保持する。これにより退会・投稿削除後も履歴が意味を保つ。
- active venue trade 判定 = `(pending, partially_confirmed)` の場合、退会拒否。`completed` / `cancelled` は退会可・履歴保持。
- tombstone 表示: 全 venue 面で「削除済みユーザー」を安全にレンダリング（名前 / アイコン NULL・Trust 欠落）。supply_post の SET NULL ケースは「投稿は削除されました」を表示。

---

## 12. PR 分割

### 実務順

1. 本 docs PR で `docs/venue_mode_requirements.md`（本書）と `docs/account_delete_qa.md` 追記を固定する。
2. 本 docs PR は PR #24 を merge しない（独立 PR として扱う）。
3. その後、PR #24 を DB 基盤 PR として main merge 判断する（§13）。
4. PR #24 を merge しても A-3 完了扱いにはしない（A-3 チケットは open のまま）。
5. venue P0 修正後に A-3 E2E を再開する。

### PR ブレークダウン

| PR | 優先 | 主内容 | DB 変更 | 依存 / リスク |
|---|---|---|---|---|
| **PR1** `docs/venue-mode-requirements` | – | 本書 + `account_delete_qa.md` 追記 | なし | 低 |
| **PR #24** merge | – | venue FK rewiring（既存）を main へ＝基線 | 適用済 | main ↔ 本番の履歴照合必須。以降の前提 |
| **PR2** `feat/venue-hold-inbox` | P0 | 受信 / 送信分離・バッジ・投稿別件数・承認 / 拒否 / キャンセル導線・自分の投稿一覧・承認待ち lazy expiry・declined 追加 | holds CHECK(`+declined`) | RLS 漏洩注意 |
| **PR3** `feat/venue-supply-form` | P0 | キーボード被り修正・`image_path` 追加・storage RLS 定義・期限 15 / 30 / 60 | image 列 + storage policy | アップ失敗 UX |
| **PR4a** `feat/venue-trade-state` | P0 | 状態再設計（案 A）・CHECK migration・`proposer_confirmed` 行移行・role 中立確定 RPC・`delete_my_account` active 更新 | trades CHECK | 高（A-3 面に再接触） |
| **PR4b** `feat/venue-trade-accept` | P0 | 承認 RPC 原子化（close / 他 pending declined / trade 生成）・partial unique 二重成立防御・アイテムスナップショット | unique index, snapshot 列 | 高（並行 Hold 競合） |
| **PR5** `feat/venue-trade-dm` | P0 | messages / reads・RLS・send 窓 RPC・未読バッジ・スレッド UI・system メッセージ・定型文 | 新規 2 表 | PR4 依存。RLS で第三者遮断 |
| **PR6** `feat/venue-shelf` | P1 最上位 | 棚 + ワンタップ投稿（供給エンジン） | 棚表 or cards 連携 | PR3 依存 |
| **PR7** `feat/venue-match` | P1 | 成立候補（Strong・都度計算）→ Hold 導線 | なし | PR2 / 3 依存 |
| **PR8** `test/venue-e2e` | P0 | 会場モードフル E2E（DM 込み）+ A-3 退会 E2E を統合した総合 QA | なし | PR4 / PR5 依存 |

- PR4 は 4a / 4b に分割（双方高リスク・独立テスト可）。
- **A-3 退会 E2E** は技術的には PR4a / PR4b 完了時点で再開可能（DM 非依存）。ただし A-3 チケットの最終 close は PR8 の総合 QA で会場モードフル E2E と一緒に検証してから行う。
- **会場モードフル E2E** は DM 完成（PR5）が前提のため PR5 後に実施。PR8 はこの両方を統合する QA PR。
- 順序: docs → PR #24 → (PR2 / PR3 並行) → PR4a → PR4b → PR5（ここで β1 プロダクト最小）→ PR6 → PR7 → PR8。
- イベント表示は列追加不要（venues に `starts_at` / `ends_at` 既存）。登録時に `starts_at` / `ends_at` を投入し、PR2 〜の表示ロジックで使用する。

---

## 13. PR #24 の扱い

**[確定]** PR #24 の状態: 本番 DB 適用済み / CI pass / main 未マージ / tombstone 前提は確認済み / A-3 E2E は venue UI P0 により blocked。

**採用方針**: 案 B（DB 基盤 PR として先に main merge）。最大の根拠はマイグレーション基線。PR4 で trades 状態の migration を積む以上、main 側履歴が本番と乖離していると以降の全 migration PR が偽基線の上に積まれ、順序衝突・適用ズレの温床になる。

### 本 docs PR との関係

- 本 docs PR（PR1）は `docs/venue_mode_requirements.md` と `docs/account_delete_qa.md` の固定のみを行う。
- **本 docs PR は PR #24 を merge しない**。
- 本 docs PR merge 後、PR #24 を DB 基盤 PR として merge 判断する（別 PR 操作）。
- **PR #24 を main merge しても A-3 完了扱いにはしない**。A-3 は PR4a / PR4b / PR8 で再開・完了する。
- venue P0 修正後に A-3 E2E を再開する。

### `docs/account_delete_qa.md` への追記内容（本 docs PR で反映）

```md
## A-3 venue FK audit / 退会処理の E2E 状況

- PR #24 は venue FK / delete_my_account の DB 基盤 PR として扱う。
- 変更は本番 Supabase DB に適用済み。
- delete_my_account の tombstone 前提は確認済み。
  - profiles は物理削除しない。
  - PII を NULL 化し、profiles.id は維持する。
  - 相手側履歴では「削除済みユーザー」として表示する設計。
- ただし A-3 E2E は venue モードの P0 未整備により blocked。
  - Hold 受信の気づき導線
  - Hold 承認導線
  - venue_trade 生成後の状態遷移
  - 会場取引履歴表示
  - venue_trade 専用 DM
  が未整備のため、会場取引ループを実機で完走できない。
- 本 PR / 本記録をもって A-3 完了扱いにはしない。
- venue モード P0 修正後に A-3 E2E を再開する。
- 既知リスク: 通常退会 RPC では発生しないが、profiles を手動 DELETE すると、ON DELETE CASCADE により venue 履歴や将来の DM 証跡が消える可能性がある。手動 DELETE は禁止運用とし、将来的に DB 防御を検討する。
```

### merge 前ガード

- main のマイグレーション履歴が本番 DB と完全一致していることを照合してから merge する。

---

## 14. 未決論点

### P0（実装前に CC が一次情報で確定）

- 取引アイテムのスナップショット粒度（商品名 + 画像 + 求内容は確定。構造化属性まで含めるか）。
- venue_trades が `supply_post_id` を直接持つか（二重成立防御キー・スナップショット取得元）。
- 本番の `status = 'proposer_confirmed'` 行数（移行スクリプト要否）。
- `venue_trades.completed_at` 列の有無。
- storage RLS の実定義 + バケット選択（`card-images` prefix 流用 vs `venue-images` 新設）。
- `image_path` vs `image_url` と cards 既存命名の統一。
- main ↔ 本番のマイグレーション履歴一致（PR #24 merge 前ゲート）。
- `profiles.id = auth.uid()` の厳密一致（RLS 前提）。

### P1

- Hold 承認待ち既定値（10 vs 15 分）。
- pg_cron 導入（lazy expiry → active sweep）。
- `venue_checkins` read 範囲の絞り込み。
- 会場商品棚の DB 方式（新規 `venue_shelf_items` vs cards 連携）。
- 成立候補の一致キー詳細（ジャンル非依存の汎用属性。通常交換の「求はリスト選択」と統一）。
- DM の Realtime 前倒し可否。
- 通報 UI の仕様。
- DM completed 後猶予の最終値（24h vs 48h、既定 48h）。

### P2

- `venue_checkins` / `venue_supply_posts.user_id` の profiles 寄せ（M-cleanup）。
- storage 実ファイルの退会クリーンアップ。
- profiles 手動 DELETE 防御（運用ルール + DB トリガ等）。
- 複数日イベントの「日別ルーム」分割。
- アニメ系・他 K-POP グループの実データ seed + ジャンル別 UI（拡張の中身）。

---

## 15. E2E / QA 観点

### A-3 退会 E2E（PR4a / PR4b 後に再開可能、DM 非依存）

A-3 退会 E2E は **DM の完成を待たずに**実施できる。trade 生成・active 退会拒否・completed 後の履歴保持を見るもので、PR4a（状態再設計）+ PR4b（承認 RPC 原子化）が揃った時点で技術的に再開可能。

- active trade（`pending` / `partially_confirmed`）中は退会拒否される。
- `completed` 後は退会可。退会で profiles が tombstone 化される。
- 相手側で「削除済みユーザー」として履歴 + スナップショットが読める（情報が欠落しない）。
- supply_post SET NULL ケースで「投稿は削除されました」が表示される。
- （DM tombstone 検証は会場モードフル E2E 側で実施）

### 会場モードフル E2E（PR5 後に実施、DM 込みコアループ）

会場モードフル E2E は **DM の完成（PR5）が前提**。Hold 承認後の合流連絡・未読バッジ・手渡し完了・履歴保持まで通しで見る。

1. 運営登録イベントが一覧に表示され、詳細に入れる（複数日・status・時刻ベース）。
2. 写真付きで当日供給板に投稿できる（キーボード被りなし）。
3. 別ユーザーが供給板から Hold 申請できる。
4. 投稿者がバッジ + 受信 Hold 一覧で Hold に気づける。
5. 投稿者が 1 件を承認 → 他 pending が自動 `declined` → supply_post が `held`（板から落ちる）。
6. venue_trade が生成され、スナップショット（商品名・画像・求内容）が保持される。
7. trade 専用 DM が開き、自由入力 + 定型文で送受信できる（未読バッジ）。
8. どちらが先でも手渡し完了確認できる（receiver 先行でも CHECK 違反が起きない）。
9. 両者確認で `completed`、履歴が残る。
10. DM が tombstone 表示で証跡として残る。

### PR8（総合 QA PR、`test/venue-e2e`）

- 上記 2 つを統合して実施する PR。
- 会場モードフル E2E と A-3 退会 E2E を同 PR で検証する。
- A-3 チケットの最終 close 判断はここで行う。
- 技術的には A-3 退会 E2E は PR4a / PR4b 後に再開できるため、PR8 を待たずに事前検証してもよい（その場合 PR8 では再現確認）。

### エッジ / 回帰

- 複数 Hold 並行承認の競合 → 二重成立しない（partial unique index + RPC ロックで厳密 1 件）。
- Hold 承認待ち期限切れの承認不可。
- 供給板 post 期限切れと pending Hold 生存の独立性（post が板から消えても Hold は受信一覧で生存）。
- `cancelled` trade の DM は閲覧のみ。
- `completed` 後の DM 送信窓（`completed_at + 48h`）。
- supply_post SET NULL 時の「投稿は削除されました」表示。
- 画像アップロード失敗時の入力保持・リトライ・画像なし投稿。
- 複数日イベント（TREASURE 想定）: イベントが `starts_at..ends_at` をまたいで板 open になる。Day1 成立取引の DM 窓は `completed_at` 基準で、`ends_at` に引きずられない。
- 横展開耐性: TREASURE seed でマッチング / マスタが機能し、構造としてアニメ系・他 K-POP を追加できる（ジャンル決め打ちのハードコードがない）。

### 現場検証（観察者前提の注意）

- 7 月の TREASURE ライブは会場モードの実地検証（ファンとしてではなく運営者として）。
- 「ファンならこう感じるはず」を前提に置いた UX 判断は、主催者・コミュニティで検証する。設計が暗黙のファン感覚に依存していないかをレビュー観点に含める。
