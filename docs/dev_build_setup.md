# Push 通知 dev build 手順 (PR4-d / iOS 先行)

PR4-c までで Push 通知のサーバ側経路と app 側 tap deep-link listener は main 入り済み。本ドキュメントは iPhone 実機で **実 Expo Push 受信 → tap deep-link → 画面遷移** までを一気通貫で検証するための手順をまとめる。

## 1. 目的

- PR4-d: iPhone 実機で Push 通知の **受信** と **tap deep-link** を確認する
- 対象はまず iOS のみ (Android / Firebase / FCM は後段、本ドキュメントの範囲外)
- 本セッションで実機テスト本番は実施しない。手順整理と repo 側の前提整備のみ

## 2. 前提

- latest main: `070a1d5` (commit `feat(push): add tap deep-link listener`)
- app 側 tap listener (`components/PushNotificationResponseHandler.tsx`) は PR4-c で main 入り済み
- Push サーバ側 E2E (会場 Hold / 会場 DM、dummy token cleanup) は PR4-b までで確認済み
- `SEND_PUSH_SECRET` は新値運用 (PR4-b ローテーション済み)
- **Apple Developer Program は加入済み**
- iOS bundle identifier: `com.swaply.jp` (`com.swaply.app` は Apple Developer 側で利用不可だったため `.jp` に変更)
- Android package: `com.swaply.app` のまま (Android / Firebase は後段、本 PR では変更しない)
- **Apple Developer 側 App ID `com.swaply.jp` 作成済 (description: スワップリー)**
- **Push Notifications capability ON 確認済 (証明書方式ではなく、後段で APNs Key 方式を採用するため証明書数 0 で問題なし)**
- **APNs Key は本ドキュメント §4 で作成 (まだ未作成)**
- EAS projectId: `c4601014-cc59-4ecb-9df8-f30596856c26`
- 検証機: iPhone 実機 (Simulator / Expo Go は Push token 発行不可のため不可)

## 3. repo 側の変更 (PR4-d-prep)

| ファイル | 変更内容 |
|---|---|
| `eas.json` | **`development-device` profile を新規追加**。実機向け dev build 用 |
| `docs/dev_build_setup.md` (本ファイル) | 新規作成 |
| `app.json` | 変更なし |
| `google-services.json` | 追加なし (Android 着手時) |
| `android.googleServicesFile` | 追加なし (同上) |

### `eas.json` の差分

```json
"development-device": {
  "developmentClient": true,
  "distribution": "internal"
}
```

注意:

- `ios.simulator` を **付けない** (省略時の default = false = 実機向け)
- 既存 `development` profile (シミュレータ用、`ios.simulator: true`) はそのまま残す。Mac 上での迅速な動作検証用に温存
- `preview` / `production` / `submit` 設定は無変更

## 4. ユーザーが Apple Developer Console でやること

| # | 作業 | 詳細 |
|---|---|---|
| 1 | App ID 確認 | **✅ 完了済**: Identifiers → bundle id `com.swaply.jp` の App ID 作成済 (description: スワップリー) |
| 2 | Push Notifications capability ON | **✅ 完了済**: 上記 App ID の Capabilities で **Push Notifications** ON 確認済。証明書数 0 で OK (証明書方式ではなく後段で APNs Key 方式で接続するため) |
| 3 | APNs Key 作成 | (未) Keys → "+" → **Apple Push Notifications service (APNs)** にチェック → Continue → Register |
| 4 | `.p8` ファイルダウンロード | (未) 1 回しかダウンロードできないので確実に保存。Key ID / Team ID を控える |
| 5 | `.p8` の保管 | (未) **repo には絶対に入れない**。ローカルの secure な場所 (Keychain / 1Password 等) に保管。EAS credentials アップロード後はローカルから消しても良い |

## 5. ユーザーが EAS でやること

### 5-1. ログイン

```powershell
npx eas login
```

Expo アカウントで認証。

### 5-2. credentials 設定 (interactive)

```powershell
npx eas credentials
```

- platform を選択: **iOS**
- profile を選択: **development-device**
- Apple Developer ログイン
- **APNs Key の登録** → 上記 §4 で取得した `.p8` をアップロード
- Key ID / Team ID を入力

完了後、credentials は **Expo のサーバ側で管理**。repo には書かない。`.p8` ファイル本体はローカルから削除可。

### 5-3. credential / secret の取扱い (再掲)

| 値 | 保管場所 | repo |
|---|---|---|
| `.p8` (APNs Key) | EAS credentials / ローカル secure storage | **NG** |
| Apple Team ID / Key ID | EAS credentials 設定時のみ手入力 | **NG** (commit 履歴に残らないこと) |
| Apple Developer ログイン情報 | OS keychain / 個人 | **NG** |
| Expo アカウント token | `eas login` で OS 標準保存 | **NG** |
| `SEND_PUSH_SECRET` | Supabase Edge Function env + Webhook header | **NG** |
| Apple Bundle ID / EAS projectId | `app.json` に既に commit 済 | OK (公開情報) |

## 6. build コマンド

```powershell
npx eas build --profile development-device --platform ios
```

- キュー待ち + ビルドで合計 **25-45 分** (初回はやや長め)
- 完了するとブラウザに build URL が出る
- iPhone の Safari で URL を開くか、QR コードを iPhone のカメラで読み取ると、Internal Distribution 形式のインストールページが開く

## 7. インストール

- iPhone で「インストール」ボタンを押す
- 初回は **Development Build アプリ** として開く (アイコンに「Swaply」、アプリは普通に立ち上がる)
- **Expo Go ではなく** dev build のアプリで確認すること (Expo Go では Push token 取得不可)

## 8. 実機確認項目 (最低 7 項目)

| # | 項目 | 操作 | 期待 |
|---|---|---|---|
| 1 | pre-prompt から通知許可 | 初回起動 → ホーム到達 → 1.2 秒後に pre-prompt → 「通知を許可する」 | OS の通知許可ダイアログ → 許可 → modal 閉じる |
| 2 | `push_tokens` に実 Expo Push Token が保存される | 上記許可直後、Supabase SQL Editor で `select * from public.push_tokens where user_id = '<自分の id>';` | `expo_push_token` が `ExponentPushToken[xxxxx]` 形式で 1 行入っている |
| 3 | 会場 Hold Push が届く | 別 user で会場 Hold 申請 | iPhone に通知バナー (タイトル「会場でHold申請が届きました」) |
| 4 | 会場 DM Push が届く | 別 user で venue DM 送信 | iPhone に通知バナー (タイトル「会場交換のメッセージが届きました」) |
| 5 | Hold 通知 tap → `/venue-tab` 遷移 | 上記 Hold 通知を tap | 会場タブが開く |
| 6 | DM 通知 tap → `/venue/trade/<id>` 遷移 | 上記 DM 通知を tap | 該当の venue trade DM 画面が開く |
| 7 | foreground / background / killed の 3 状態確認 | 各状態で Hold/DM を発生させ tap | 3 状態とも通知出現 + tap で遷移成立 |

### 補足: 3 状態の検証手順

- **foreground**: アプリ表示中。iOS は標準で foreground バナーが出ないことがある (`setNotificationHandler` 未設定のため)。「通知センターを下に引いて確認」「通知 logs を Supabase Function logs で見る」で受信は確認可能
- **background**: アプリをホーム画面に下げる (スワイプアップで終了させない) → 通知発生 → ロック画面 or 通知センターに表示 → tap
- **killed**: アプリを **app switcher から swipe up で終了** → 通知発生 → ロック画面 or 通知センター → tap で cold start → 500ms 遅延後に該当画面遷移

## 9. 手動 push テスト例 (PowerShell)

実機の `push_tokens` 行が登録された後、自分宛に手動 push を打って受信を即確認する。secret 実値はリポジトリに書かない。

```powershell
$SUPABASE_PROJECT_REF = "tayrdjuizpyrxohduspe"
$SEND_PUSH_SECRET = "<local-only>"
$TARGET_USER_ID = "<target-user-id>"

Invoke-RestMethod -Method POST `
  -Uri "https://$SUPABASE_PROJECT_REF.functions.supabase.co/send-push" `
  -Headers @{
    "Content-Type" = "application/json"
    "x-send-push-secret" = $SEND_PUSH_SECRET
  } `
  -Body (@{
    user_id = $TARGET_USER_ID
    title = "PR4-d 実機テスト"
    body = "通知バナーが出ればOK"
    data = @{
      type = "venue_hold_requested"
      route = "/venue-tab"
    }
  } | ConvertTo-Json)
```

期待:
- iPhone に通知バナー
- tap で会場タブが開く
- `Invoke-RestMethod` のレスポンス: `ok=True, sent=1, removed=0` (有効 token に届いた)

venue trade DM 版もテストする場合は `data` を以下に差し替え:

```powershell
data = @{
  type = "venue_trade_message"
  route = "/venue/trade/<実 venue_trade.id>"
  venue_trade_id = "<実 venue_trade.id>"
}
```

## 10. 詰まりやすいポイント

| # | 症状 | 原因 | 対策 |
|---|---|---|---|
| 1 | `development` profile を間違えて使うと実機にインストール不可 | `ios.simulator: true` で simulator 専用 build になる | **必ず `development-device` profile を使う** |
| 2 | iOS Simulator / Expo Go で Push token が取れない | SDK 53+ 仕様で発行不可 | 実機 + dev build 必須 |
| 3 | APNs Key / EAS credentials の紐付けミス | `eas credentials` で誤って別 profile に登録、Key ID / Team ID 不一致 | `eas credentials` を再実行して上書き |
| 4 | iOS で通知許可ダイアログが出ない | 過去に「許可しない」を選んでいる | 設定アプリ > Swaply > 「通知」を ON にリセット、または app を delete & 再インストール |
| 5 | foreground で通知バナーが出ない | `setNotificationHandler` 未設定 (PR4-c スコープ外) | foreground でも受信自体は来ている (Supabase Function logs で確認可能)。通知センターを下に引くと履歴に残る。表示制御は別 PR |
| 6 | killed 状態 tap で deep-link が動かない | navigator マウント完了より早く `router.push`、500ms 遅延では不足のケース | PR4-c の遅延を 800-1000ms に増やす、または `useFocusEffect` ベースの ready 検知に改修。状況を見て後続 PR で対応 |
| 7 | secret / `.p8` / Service Account JSON を repo に入れてしまう | 焦り / うっかり commit | **`.p8` / SA JSON は repo に絶対入れない**。EAS credentials のみで管理 |
| 8 | build キュー時間が長い | Expo 無料枠の優先度 | 時間に余裕を見るか、Expo 有料プランを検討 |
| 9 | 実機で token は取れるが Push が届かない | Expo Push API → APNs 経路の不一致 (`BadDeviceToken` / `Unregistered` 等が ticket に出る) | `notify-on-event` / `send-push` logs で ticket を確認、必要なら APNs Key を再生成 |
| 10 | `eas build` で App ID 未登録エラー | Apple Developer 側で `com.swaply.jp` の App ID が無い | Apple Developer Console で先に作る (本 PR 時点では `com.swaply.jp` で作成済) |

## 11. 残課題 (本ドキュメントの後段で対応)

- **Android (Firebase + FCM)**: 後段。`google-services.json` + `app.json` `android.googleServicesFile` 設定 + EAS credentials に FCM V1 SA 登録 + `eas build --profile development-device --platform android`
- **`setNotificationHandler` (foreground 表示制御)**: 別 PR。foreground 中の通知バナーを制御
- **pending deep link queue (未ログイン時の resume)**: 別 PR。未ログイン状態で tap → login 後に意図を resume
- ~~**dev build 後の実機検証結果ドキュメント化**: 検証完了後に本ファイル §8-9 の結果を追記する PR (PR4-b と同パターンの運用反映 commit)~~ → **§12 で完了 (2026-06-19)**
- **通常申請 / 通常承認 Push (offers / trades)**: 別 PR。`notify-on-event` に分岐追加 + Webhook 追加
- **`notifications` テーブル + dedupe**: 別 PR。Webhook retry に伴う重複 Push を idempotency key で抑止

## 12. ✅ PR4-d 実機 Push 受信確認 完了 (2026-06-19)

`development-device` profile での iOS dev build を起点に、iPhone 実機での Push token 登録 → `send-push` 手動送信受信 → Webhook 経由 Push 受信 → 通知 tap deep-link 遷移までを一気通貫で確認した。

本 docs §11 残課題のうち「dev build 後の実機検証結果ドキュメント化」は本セクションで完了。本ドキュメントには ExpoPushToken 全文、APNs `.p8`、Apple ID、`SEND_PUSH_SECRET` 値、テスト user_id は記載しない (`venue_id` のみテスト痕跡として記録)。

### 12-1. 環境構築結果

| 項目 | 結果 |
|---|---|
| `eas build --profile development-device --platform ios` | ✅ 成功 |
| iPhone 実機 (デベロッパモード ON) に dev build インストール | ✅ 成功 |
| `npx expo start --dev-client` で Metro 接続 + Swaply 表示 | ✅ 成功 |
| pre-prompt → 通知許可 ON | ✅ 成功 |
| `public.push_tokens` に iOS 実 ExpoPushToken 登録 | ✅ 成功 (2026-06-19 付) |

repo 側の追加変更:
- `expo-dev-client: ~6.0.21` を `package.json` に追加 (dev client 接続のため必須)

### 12-2. `send-push` 手動送信テスト (実機受信 + tap deep-link)

PowerShell から `curl.exe` で `send-push` Edge Function に直接 POST。

| 確認項目 | 結果 |
|---|---|
| `send-push` レスポンス | `ok=true, sent=1, removed=0, tickets=[{status:ok}]` |
| iPhone のロック画面に Push バナー表示 | ✅ |
| `data.route = "/venue-tab"` 通知 tap → Swaply dev build 起動 → 会場モード遷移 | ✅ |

`SEND_PUSH_SECRET` は本フェーズ着手時に再ローテーション実施 (旧値忘失のため)。詳細は `docs/push_webhook_setup.md` §9-10 参照。

### 12-3. Webhook 経由 (会場 Hold 実イベント) E2E

PR4-d 実機テスト用に新規会場を 1 件作成:

| 項目 | 値 |
|---|---|
| venue_id | `f23ed9f4-4b8f-420b-83c9-510c6cf360e8` |
| title | PR4-d Push実機テスト会場 |
| event_date | 2026-06-19 |
| status | open |

実 E2E フロー (server 側 + 実機 + tap deep-link):

1. 出品者ユーザーが上記会場で会場出品 (`venue_supply_posts` INSERT)
2. 別ユーザーが同会場にチェックイン → 当該出品に Hold 申請
3. `venue_holds` INSERT (status='pending', receiver_id = 出品者) → Database Webhook (`notify_on_venue_hold_insert`) 発火
4. `notify-on-event` → `send-push` → Expo Push API → APNs → iPhone 配信
5. 出品者の iPhone にロック画面 Push バナー (タイトル「会場でHold申請が届きました」) 到達
6. 通知 tap → Swaply dev build 起動 → `data.route` allowlist (`/venue-tab`) 検証 → 会場モード遷移

結果: **会場 Hold 実イベントの Webhook 経由 → 実機受信 → tap deep-link まで完全成功**。PR1〜PR4-c のサーバ → 実機経路は一気通貫で機能確認済。

### 12-4. PR4-d で確認できなかった項目 (別 PR で対応)

- **会場 DM Push 実機受信確認**: 本フェーズでは会場 Hold 実イベントのみ実機確認。会場 DM 経路はサーバ側 E2E (`docs/push_webhook_setup.md` §9-6) のみで、実機 tap で `/venue/trade/<id>` に遷移するかは未検証
- **foreground 中の通知バナー表示** (`setNotificationHandler` 未配線、PR4-c スコープ外): 本フェーズではロック画面 / 通知センター経由でのみ確認、foreground 中の挙動は別 PR
- **killed 状態 (アプリスワイプ終了後) からの cold start tap deep-link**: 500ms 遅延の十分性は体系的に検証していない。実害が見えたら PR4-c 遅延の調整 or `useFocusEffect` ベースに改修
- **Android 実機**: 後段。Firebase Project + `google-services.json` + FCM V1 SA + Android dev build が必要

## 関連

- PR1: `docs/migration_push_tokens_table.sql` / `lib/pushNotifications.ts`
- PR2: `components/PushPermissionPrePrompt.tsx`
- PR3: `supabase/functions/send-push/index.ts`
- PR4-a: `supabase/functions/notify-on-event/index.ts`
- PR4-b: `docs/push_webhook_setup.md` (§9 運用反映 / §9-9 ローテーション完了)
- PR4-c: `components/PushNotificationResponseHandler.tsx`
- PR4-d-prep: `eas.json` `development-device` profile + 本ドキュメント
