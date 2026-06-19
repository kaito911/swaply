# Push 通知 Webhook 設定手順 (PR4-a)

`supabase/functions/notify-on-event` を Supabase Database Webhook と接続するための手順。Edge Function 本体は repo に含まれるが、Webhook 設定自体は Supabase Dashboard で行うため、本ファイルで手順を残す。

## 前提

- PR3 `send-push` Edge Function は deploy 済み。
- `SEND_PUSH_SECRET` は Supabase project の secret に設定済み (PR3 で設定した値を再利用する)。
- 本 PR4-a で追加する `notify-on-event` Edge Function は、PR3 と **同じ** `SEND_PUSH_SECRET` を再利用する。Push 経路 (notify-on-event → send-push) の単一責務として 1 つの secret で管理する。
- 本ドキュメントには secret 値そのものは絶対に書かない。Dashboard 入力時に手元で入れること。

## 1. notify-on-event を deploy する

リポジトリルートで以下を実行:

```bash
npx supabase functions deploy notify-on-event --no-verify-jwt
```

`--no-verify-jwt` の理由:
- 本 Edge Function は Supabase Database Webhook が送る Authorization 無し POST を受ける。
- 認証は `x-send-push-secret` ヘッダで自前で行う (PR3 send-push と同方式)。
- Supabase の標準 JWT 検証は無効化する。

deploy 後に `notify-on-event` の URL は以下になる:

```
https://<project-ref>.functions.supabase.co/notify-on-event
```

## 2. 接続テスト (Dashboard 設定前の疎通確認)

実 Webhook を貼る前に手元 curl で Edge Function 単体の挙動を確認する。

### 2-1. secret 無し → 401

```bash
curl -X POST "https://<project-ref>.functions.supabase.co/notify-on-event" \
  -H "Content-Type: application/json" \
  -d '{"type":"INSERT","table":"venue_holds","record":{}}'
```

期待: `401 {"error":"UNAUTHORIZED"}`

### 2-2. 不明 table → 200 skip

```bash
curl -X POST "https://<project-ref>.functions.supabase.co/notify-on-event" \
  -H "Content-Type: application/json" \
  -H "x-send-push-secret: <SEND_PUSH_SECRET>" \
  -d '{"type":"INSERT","table":"unknown_table","record":{}}'
```

期待: `200 {"ok":true,"skipped":"UNKNOWN_TABLE"}`

### 2-3. venue_holds INSERT 模擬 (token 0 件の receiver)

```bash
curl -X POST "https://<project-ref>.functions.supabase.co/notify-on-event" \
  -H "Content-Type: application/json" \
  -H "x-send-push-secret: <SEND_PUSH_SECRET>" \
  -d '{
    "type": "INSERT",
    "table": "venue_holds",
    "schema": "public",
    "record": {
      "id": "00000000-0000-0000-0000-000000000001",
      "venue_id": "00000000-0000-0000-0000-0000000000aa",
      "proposer_id": "00000000-0000-0000-0000-0000000000bb",
      "receiver_id": "<token 0 件の自分の user_id>",
      "status": "pending"
    },
    "old_record": null
  }'
```

期待:
```json
{
  "ok": true,
  "source": "venue_holds",
  "send_push": {
    "ok": true,
    "sent": 0,
    "removed": 0,
    "user_id": "<receiver_id>"
  }
}
```

### 2-4. venue_trade_messages INSERT 模擬 (kind='system' → 早期 skip)

```bash
curl -X POST "https://<project-ref>.functions.supabase.co/notify-on-event" \
  -H "Content-Type: application/json" \
  -H "x-send-push-secret: <SEND_PUSH_SECRET>" \
  -d '{
    "type": "INSERT",
    "table": "venue_trade_messages",
    "schema": "public",
    "record": {
      "id": "00000000-0000-0000-0000-000000000002",
      "trade_id": "00000000-0000-0000-0000-0000000000cc",
      "sender_id": null,
      "kind": "system",
      "body": "取引が開始されました",
      "system_event": "trade_created"
    },
    "old_record": null
  }'
```

期待: `200 {"ok":true,"skipped":"KIND_NOT_USER"}`

### 2-5. venue_trade_messages INSERT 模擬 (kind='user'、実 trade_id 必要)

`venue_trades` に実在する trade_id を渡す必要がある (service_role で SELECT して participants 抽出するため)。テスト用 trade_id を 1 件用意して以下:

```bash
curl -X POST "https://<project-ref>.functions.supabase.co/notify-on-event" \
  -H "Content-Type: application/json" \
  -H "x-send-push-secret: <SEND_PUSH_SECRET>" \
  -d '{
    "type": "INSERT",
    "table": "venue_trade_messages",
    "schema": "public",
    "record": {
      "id": "00000000-0000-0000-0000-000000000003",
      "trade_id": "<実 venue_trades.id>",
      "sender_id": "<participant の片方>",
      "kind": "user",
      "body": "test",
      "system_event": null
    },
    "old_record": null
  }'
```

期待: token 無しなら `send_push.sent = 0`、有効 token あれば通知配信。`sender_id` でない方の participant が宛先になる。

## 3. Supabase Dashboard で Database Webhook を 2 件設定

Dashboard → Database → Webhooks → Create a new hook で以下 2 件を作成。

### 3-1. `notify_on_venue_hold_insert`

| 項目 | 値 |
|---|---|
| Name | `notify_on_venue_hold_insert` |
| Table | `public.venue_holds` |
| Events | **INSERT のみ** (UPDATE / DELETE はチェックしない) |
| Type | HTTP Request |
| HTTP method | POST |
| URL | `https://<project-ref>.functions.supabase.co/notify-on-event` |
| HTTP Headers | `x-send-push-secret`: `<SEND_PUSH_SECRET 値、手元で入力>` |
| (任意) Filter | `status = pending` (Dashboard が conditional webhook 対応している場合) |
| HTTP params | (空) |

Filter `status = pending` を Dashboard で書けない場合は Edge Function 側で skip するため二重防御として無くても可。

### 3-2. `notify_on_venue_trade_message_insert`

| 項目 | 値 |
|---|---|
| Name | `notify_on_venue_trade_message_insert` |
| Table | `public.venue_trade_messages` |
| Events | **INSERT のみ** |
| Type | HTTP Request |
| HTTP method | POST |
| URL | `https://<project-ref>.functions.supabase.co/notify-on-event` |
| HTTP Headers | `x-send-push-secret`: `<SEND_PUSH_SECRET 値、手元で入力>` |
| (任意) Filter | `kind = user` (Dashboard で書ければ) |
| HTTP params | (空) |

## 4. 動作確認 (Webhook 経由)

### 4-1. dummy token を入れる

実機なしでも `push_tokens` に手で 1 行入れれば送信経路まで確認可能。

```sql
-- Supabase SQL Editor で
insert into public.push_tokens (user_id, expo_push_token, platform)
values (
  '<自分の user_id>',
  'ExponentPushToken[__dummy_token_for_test__]',
  'ios'
);
```

dummy token は Expo Push API で `DeviceNotRegistered` ticket が返り、PR3 send-push の cleanup ロジックで自動削除される。動作確認後にゴミが残らない設計。

### 4-2. venue_holds INSERT 動作確認

別 user で会場 Hold を申請する (アプリ上の通常操作 or SQL Editor で直接 `INSERT INTO venue_holds`)。

Supabase Function logs で:
- `notify-on-event` が 200 を返している
- `send-push` が呼ばれ、`DeviceNotRegistered` ticket を受けて `removed: 1` を返している
- 結果 `push_tokens` から dummy token が削除されている

### 4-3. venue_trade_messages INSERT 動作確認

`send_venue_trade_message` RPC (app の DM 画面送信、または SQL Editor から RPC を呼ぶ) で kind='user' の message を 1 件挿入する。

Supabase Function logs で:
- `notify-on-event` が 200 を返している
- `send_push.user_id` が sender_id でない方の participant になっている
- `send-push` の結果は token 状況に応じる

### 4-4. system message が Push されないこと

`venue_trades` を新規作成すると trigger `fn_venue_trade_emit_system_message` が走り、kind='system' の message が 1 件入る。Webhook はそれにも発火するが `notify-on-event` 側で `KIND_NOT_USER` で skip される。Function logs で確認:

```
{"ok":true,"skipped":"KIND_NOT_USER"}
```

## 5. 実機なしで確認できる範囲 / 実機ありで後日確認する範囲

| 確認項目 | 実機なし | 実機あり |
|---|---|---|
| Webhook 発火 → notify-on-event 到達 | ✅ Function logs | |
| payload parse / table 分岐 | ✅ | |
| skip 条件 (system / 自分自身 / 不明 table) | ✅ | |
| venue_trades participants 解決 | ✅ | |
| send-push 呼出 → ticket 取得 | ✅ | |
| dummy token → DeviceNotRegistered → 自動削除 | ✅ | |
| 端末でバナー / サウンド | ❌ | ✅ |
| tap → `/venue-tab` 遷移 | ❌ | ✅ |
| tap → `/venue/trade/<id>` 遷移 | ❌ | ✅ |
| foreground / background / killed 状態差 | ❌ | ✅ |

実機テストには iOS: Apple Developer + APNs Key + EAS credentials + dev build / Android: Firebase + `google-services.json` + FCM V1 SA + dev build が必要。

## 6. Webhook retry / 重複通知の注意

Supabase Database Webhook は失敗 (非 2xx / timeout) 時に **指数バックオフで自動 retry** する。本 Edge Function の HTTP ステータス設計は retry を意識した分岐になっている:

| ケース | レスポンス | retry? |
|---|---|---|
| secret 未設定 / 不一致 | 401 | しない (config error) |
| payload not JSON | 400 | しない (構造異常) |
| 不明 table | 200 | しない (skip) |
| skip 条件全般 (system / 自分自身 / proposer === receiver / status≠pending 等) | 200 | しない |
| 整合性異常 (sender が participant でない) | 200 | しない (retry しても解決しない) |
| venue_trades 取得失敗 | 500 | する (transient 想定) |
| venue_trades 行未発見 (commit timing race) | 500 | する |
| send-push non-OK | 500 | する |
| send-push の sent=0 (token 0 件) | 200 | しない (正常) |

retry が発生すると同じ INSERT イベントで Push が複数回飛ぶ可能性は **稀だがゼロではない**。厳密な dedupe (record.id を idempotency key として保持する notifications テーブル) は PR4-a スコープ外、必要なら後続 PR で追加する。

## 7. tap deep-link listener について

本 PR4-a では Push の **送信側** のみ実装。app 側で Push を tap した際に `data.route` に従って画面遷移する deep-link listener (`Notifications.addNotificationResponseReceivedListener`) は **別 PR** で実装する。送信される Push 自体は `data.route` を含んでいるが、PR4-a 完了時点の app は受信 listener を持たないため、tap 後の画面遷移は起きず通知を単に tap する = アプリを開くだけになる。

## 8. ロールバック

問題が起きた場合は Dashboard で Webhook 2 件を **Disable** する。Edge Function 自体は残したままでも、Webhook が無効なら送信経路が断たれる。コードを完全に剥がすには `supabase functions delete notify-on-event` で削除可能だが、通常は Webhook の Disable で十分。

## 9. PR4-b 運用反映結果 (2026-06-17)

PR4-a で main 入りした `notify-on-event` について、手元で deploy / Webhook 設定 / 模擬 payload テスト / 実 Webhook 経由の E2E (dummy token cleanup) を実施した。サーバ側経路は完了として close。実機 Push 受信確認・tap deep-link は別 PR。

### 9-1. deploy 完了

```powershell
npx supabase functions deploy notify-on-event --no-verify-jwt
```

- 結果: `Deployed Functions on project tayrdjuizpyrxohduspe: notify-on-event` で成功。
- Docker 関連 warning は出たが deploy 自体は完了。
- URL: `https://tayrdjuizpyrxohduspe.functions.supabase.co/notify-on-event`

### 9-2. 模擬 payload 疎通テスト

| ケース | 結果 | 判定 |
|---|---|---|
| secret なし `Invoke-RestMethod` | 401 Unauthorized | ✅ |
| secret あり + `unknown_table` payload | `ok=True, skipped=UNKNOWN_TABLE` | ✅ |
| secret あり + `venue_holds` 模擬 payload (token 0 件 receiver) | `ok=True, source=venue_holds, send_push.ok=True, send_push.sent=0` | ✅ (notify-on-event → send-push 内部呼び出し確認) |
| secret あり + `venue_trade_messages` kind='system' | `ok=True, skipped=KIND_NOT_USER` | ✅ (system message を skip) |

### 9-3. Database Webhook 2 件作成済み

| Webhook 名 | table | event | URL | header |
|---|---|---|---|---|
| `notify_on_venue_hold_insert` | `venue_holds` | INSERT | `https://tayrdjuizpyrxohduspe.functions.supabase.co/notify-on-event` | `x-send-push-secret` 設定済、`Content-type: application/json` |
| `notify_on_venue_trade_message_insert` | `venue_trade_messages` | INSERT | (同) | (同) |

### 9-4. テスト用会場の追加

E2E 検証用に Supabase Dashboard 経由で会場 1 件を追加:

| 項目 | 値 |
|---|---|
| venue_id | `234b380f-1a72-4754-b0ee-c60e6c4484ef` |
| title | Push通知テスト |
| venue_name | Swaplyテスト会場 2026/06/17 |
| event_date | 2026-06-17 |
| status | open |

アプリの会場一覧に表示確認済。

### 9-5. 会場 Hold Push サーバ側 E2E ✅

流れ:
1. アプリで会場投稿作成 → 別ユーザーから Hold 申請
2. `venue_holds` INSERT → Database Webhook 発火 → `notify-on-event` 起動
3. receiver 側に dummy token を入れた状態で再度 Hold 発火
4. `send-push` 経由で Expo Push API → dummy token は `DeviceNotRegistered` ticket
5. PR3 cleanup ロジックで `push_tokens` から自動削除

確認 SQL:

```sql
select *
from public.push_tokens
where expo_push_token = 'ExponentPushToken[__dummy_token_for_test__]';
```

結果: `No rows returned` → **会場 Hold Push サーバ側 E2E OK**。

### 9-6. 会場 DM Push サーバ側 E2E ✅

対象 venue_trade:

| 項目 | 値 |
|---|---|
| venue_trade_id | `df76bf24-2f00-4dd9-a0e4-21ac2fa0c635` |
| proposer_id | `d485c203-f4ec-437d-b46d-d8db7a1c0b9f` |
| receiver_id | `3eca930e-6740-4c31-b8e0-03234a2023a3` |

流れ:
1. 受信側 user に dummy token を追加
2. 会場 DM を 1 通送信 (`send_venue_trade_message` RPC 経由)
3. `venue_trade_messages` INSERT (kind='user') → Database Webhook → `notify-on-event`
4. service_role で `venue_trades` を SELECT し、sender 以外の participant を recipient に決定
5. `send-push` 経由 → dummy token が `DeviceNotRegistered` ticket
6. PR3 cleanup ロジックで自動削除

確認 SQL:

```sql
select *
from public.push_tokens
where expo_push_token = 'ExponentPushToken[__dummy_token_for_dm_test__]';
```

結果: `No rows returned` → **会場 DM Push サーバ側 E2E OK**。

### 9-7. 残課題 / 未実施

- **実機 Push 受信確認は未実施**: iOS / Android dev build + APNs Key / FCM credentials / EAS credentials が未整備のため、端末でのバナー / サウンド / 通知タップは未検証。別 PR (PR4-d 系) で対応する。
- **tap deep-link listener は未実装**: `data.route` に従って画面遷移する `Notifications.addNotificationResponseReceivedListener` は app 側未配線。送信される Push は `data.route` (`/venue-tab` / `/venue/trade/<id>`) を含むが、現状 app は受信しても何もしない。別 PR (PR4-c 系) で対応する。
- **dedupe / notifications テーブル**: Webhook retry に伴う重複 Push の dedupe は PR4-a/b スコープ外。実害が見えた段階で別 PR で検討。

### 9-8. ⚠️ `SEND_PUSH_SECRET` ローテーション推奨

PR4-b 検証中に `SEND_PUSH_SECRET` の値が一部画面に映る運用上のミスがあった。検証は完遂したがセキュリティ衛生として以下を推奨:

1. 新しいランダム値を生成 (例: `openssl rand -hex 32` 等で 32〜64 byte)
2. Supabase secrets を新値で上書き: `npx supabase secrets set SEND_PUSH_SECRET=<新しい値>`
3. Dashboard の Database Webhook 2 件 (`notify_on_venue_hold_insert` / `notify_on_venue_trade_message_insert`) の `x-send-push-secret` header を新値に更新
4. 旧値で疎通テストして 401 が返ることを確認

ローテーション中は短時間ながら Webhook と Edge Function の secret 不一致による 401 が発生し、Push が送られない時間帯が生まれる点に注意。アプリ稼働への影響は Push 通知のみで、取引・DM 等の core 機能には影響しない。

### 9-9. ✅ `SEND_PUSH_SECRET` ローテーション完了 (2026-06-17)

§9-8 で推奨した `SEND_PUSH_SECRET` のローテーションを実施し、Edge Function / Dashboard Webhook の両側で新値への切替を完了した。本ドキュメントには新旧いずれの secret 値も記載しない (placeholder のみ)。

#### 完了手順

1. 旧 `SEND_PUSH_SECRET` を破棄扱いとし、新しいランダム値を生成
2. `npx supabase secrets set SEND_PUSH_SECRET=<新値>` で Supabase secrets を上書き
3. `send-push` を `--no-verify-jwt` で再 deploy
4. `notify-on-event` を `--no-verify-jwt` で再 deploy
5. Dashboard の Webhook 2 件 (`notify_on_venue_hold_insert` / `notify_on_venue_trade_message_insert`) の `x-send-push-secret` header を新値に貼り替え

#### 検証結果

| 確認項目 | 結果 | 判定 |
|---|---|---|
| 旧 secret で `notify-on-event` 疎通 | `401 Unauthorized` | ✅ (旧値が完全に無効化) |
| 新 secret で `notify-on-event` 疎通 (`unknown_table` payload) | `ok=True, skipped=UNKNOWN_TABLE` | ✅ (新値が有効) |
| 新 secret 経路での Webhook E2E (会場 Hold) | dummy token cleanup OK | ✅ |

#### Webhook E2E 詳細

流れ:
1. receiver 側 user に dummy token `ExponentPushToken[__dummy_token_for_rotation_test__]` を追加
2. アプリで Hold 申請を発生
3. `venue_holds` INSERT → Database Webhook (新 header 値で送信) → `notify-on-event` → `send-push` → Expo Push API
4. dummy token は `DeviceNotRegistered` ticket
5. PR3 cleanup ロジックで `push_tokens` から自動削除

確認 SQL:

```sql
select *
from public.push_tokens
where expo_push_token = 'ExponentPushToken[__dummy_token_for_rotation_test__]';
```

結果: `No rows returned` → **ローテーション後も Push 経路 (Webhook → notify-on-event → send-push → Expo → cleanup) が維持されていることを確認**。

#### 残課題 (ローテーション完了後も §9-7 と同じく未実施)

- **実機 Push 受信確認は未実施** — dev build / Apple Developer / Firebase / EAS credentials 整備後に PR4-d 系で対応。
- **tap deep-link listener は未実装** — app 側 `Notifications.addNotificationResponseReceivedListener` は PR4-c 系で対応。

#### 結論

- `SEND_PUSH_SECRET` の値は完全に新値へ移行済み (旧値は無効、401 で拒否されることを確認)
- Edge Function (`send-push` / `notify-on-event`) 側に新 secret 反映 OK
- Dashboard Webhook 2 件に新 secret 反映 OK
- 会場 Hold Push サーバ側経路はローテーション後も維持確認 OK
- §9-8 のリスク (検証中の secret 露出) は本ローテーションで解消

### 9-10. ✅ 再ローテーション + 実機 Push 受信確認 完了 (2026-06-19)

PR4-d 実機検証フェーズで `SEND_PUSH_SECRET` を再度ローテーションし (作業途中で旧値を失念したため)、Edge Function 2 件再 deploy + Dashboard Webhook 2 件 header 貼り替えを完了。続けて iPhone 実機 dev build で Webhook 経由 Push の実機受信と tap deep-link 遷移までの E2E を完了した。

詳細手順と確認結果は `docs/dev_build_setup.md` §12 を参照。本ドキュメントには新旧 secret 値や ExpoPushToken は記載しない。

#### 主な確認結果

| 確認項目 | 結果 |
|---|---|
| 旧 secret で `notify-on-event` 疎通 | 401 ✅ |
| 新 secret で `notify-on-event` 疎通 | 200 ✅ |
| `send-push` 手動送信 → iPhone 実機受信 → tap で `/venue-tab` 遷移 | ✅ |
| 会場 Hold 実イベント → Webhook → `notify-on-event` → `send-push` → iPhone 実機受信 → tap で会場モード遷移 | ✅ |
| PR4-d テスト用会場 | `venue_id: f23ed9f4-4b8f-420b-83c9-510c6cf360e8` (新規作成、`event_date=2026-06-19`, `status=open`) |

これにより PR1〜PR4-d のサーバ → Webhook → Edge Function → 実機 → tap deep-link 経路は一気通貫で機能確認済み。

### 9-11. ✅ 会場 DM Webhook 実機 Push tap 確認 完了 (2026-06-20)

§9-10 (PR4-d) で会場 Hold 実イベントの実機受信を確認した続き。会場 DM 経路 (`notify_on_venue_trade_message_insert` Webhook → `notify-on-event` → `send-push` → iPhone → tap で `/venue/trade/<UUID>` 遷移) を実機で確認した。

iPhone 1 台のみのため、別ユーザー B からの DM 送信は **SQL Helper A** (`venue_trade_messages` への直接 INSERT、kind='user', sender_id = iPhone でない方) で代替。本番運用では `send_venue_trade_message` RPC 経由が通常経路。

詳細は `docs/dev_build_setup.md` §13 を参照。本ドキュメントには user_id / ExpoPushToken / secret は記載しない。

#### 主な確認結果

| 確認項目 | 結果 |
|---|---|
| `venue_trade_messages` INSERT (kind='user') → Webhook 発火 → `notify-on-event` で recipient 解決 | ✅ |
| `send-push` → Expo Push API → iPhone | ✅ |
| iPhone にロック画面 Push バナー (タイトル「会場交換のメッセージが届きました」) | ✅ |
| 通知 tap → Swaply dev build 起動 → `/venue/trade/<UUID>` DM 画面に直接遷移 | ✅ |
| PR4-e テスト用 | `venue_id: 6743c0a9-e09c-4ced-b2df-71108d8110f4` (event_date: 2026-06-20, status: open) / `venue_trade_id: ca2354cc-dd0e-4002-af92-33186a5543cf` |

これにより PR1〜PR4-e のサーバ → Webhook → Edge Function → 実機 → tap deep-link 経路は **Hold / DM 両系統で一気通貫機能確認済み**。

---

PR4-b (運用反映) はこれで close。残るは PR4-c (app 側 tap listener) / PR4-d (dev build + 実機受信確認) 系。

## 関連

- PR1: `docs/migration_push_tokens_table.sql` / `lib/pushNotifications.ts`
- PR2: `components/PushPermissionPrePrompt.tsx`
- PR3: `supabase/functions/send-push/index.ts`
- PR4-a: `supabase/functions/notify-on-event/index.ts` (本ファイルの対象)
- 後続: app 側 deep-link listener、dev build、実機受信確認、(オプション) notifications テーブル / dedupe
