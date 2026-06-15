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

## 関連

- PR1: `docs/migration_push_tokens_table.sql` / `lib/pushNotifications.ts`
- PR2: `components/PushPermissionPrePrompt.tsx`
- PR3: `supabase/functions/send-push/index.ts`
- PR4-a: `supabase/functions/notify-on-event/index.ts` (本ファイルの対象)
- 後続: app 側 deep-link listener、dev build、実機受信確認、(オプション) notifications テーブル / dedupe
