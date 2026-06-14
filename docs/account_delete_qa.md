# アカウント削除 QA 手順書

最終更新: 2026-06-05
位置付け: 初期 β リリース前のアカウント削除フロー検証手順 (Phase 0 外部レビュー指摘対応)

> 前回 QA で削除テストユーザーに `profiles` row が無く、profiles 匿名化 / traded cards 処理 / pending offers cancel 等の **検証が未実施** だった可能性があるため、フル状態のテストユーザーを用意して再検証する。

---

## 0. 関連 file

実装:
- `docs/migration_rpc_delete_my_account.sql` — RPC 本体
- `supabase/functions/delete-account/index.ts` — Edge Function
- `lib/supabase.ts` — `fetchActiveTradeCount` / `deleteMyAccount`
- `app/account-delete.tsx` — UI

確認文書 (本書):
- §1: Edge Function 本人性 (P0-1 確認結果)
- §2: フルテストアカウント準備 (P0-4)
- §3: 削除実行 + 検証クエリ (P0-4)
- §4: 削除後の相手側履歴 QA (P1-2)
- §5: RLS 確認結果 (P0-3 記録)

---

## 1. Edge Function 本人性確認 (P0-1)

### 1.1 確認内容

`supabase/functions/delete-account/index.ts` 全文確認 (2026-06-05):

| 観点 | 結果 | 根拠 |
|---|---|---|
| request body の user_id 等を信用していない | ✅ OK | `req.json()` / `req.body` / `req.text()` の呼び出し**ゼロ件**。body は読まない設計 |
| JWT から本人 uid を取得 | ✅ OK | L52-67: `Authorization` header → ANON_KEY client (`global.headers`) → `supabase.auth.getUser()` → `userData.user.id` を取得 |
| service_role 削除対象が本人 uid のみ | ✅ OK | L106: `supabaseAdmin.auth.admin.deleteUser(userId)` の `userId` は L68 で JWT 由来のローカル変数のみ |
| 他人の user_id を request に入れても削除されない | ✅ OK | body 未使用のため、攻撃者が `POST /functions/v1/delete-account` で `{ "user_id": "victim_uuid" }` を送っても無視される |

### 1.2 結論

**修正不要**。Edge Function は JWT 由来の本人 uid のみを削除対象とする設計。攻撃者による他人アカウント削除のベクトルは存在しない。

### 1.3 攻撃シミュレーション (検証クエリ)

curl で他人 uid を body に入れて呼び出しても、Authorization header の JWT 本人のみ削除される (body 無視):

```bash
# 期待: 本人 (token 所有者) が削除される。body の victim_uuid は無視される。
curl -X POST 'https://<project>.supabase.co/functions/v1/delete-account' \
  -H "Authorization: Bearer <own_jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "user_id": "victim_uuid_here" }'
```

→ Token 所有者の auth.users / profiles のみ処理。`victim_uuid_here` は無効化される。

---

## 2. フルテストアカウント準備 (P0-4)

### 2.1 対象ユーザーが持つべき状態

- ✅ `auth.users` に行あり (新規登録)
- ✅ `public.profiles` に行あり (`handle` / `display_name` / `avatar_url` / `shipping_name` / `postal_code` / `address_line1` / `address_line2` がすべて埋まっている)
- ✅ active or inactive な `cards` を複数持っている
- ✅ pending な `offers` を 1 件以上送っている (proposer 側)
- ✅ 可能なら `completed/traded` 履歴を持っている (trades + cards.status='traded')
- ✅ `reports` の `reporter_id` として紐づく通報を 1 件以上送っている
- ✅ `user_blocks` の `blocker_id` として誰かをブロックしている

### 2.2 準備手順

#### Step 1: 新規アカウント A を作成

アプリから新規登録 → `handle_A_<timestamp>` / `display_name=テストA` 等で onboarding 完了。

#### Step 2: アプリから状態を埋める

A のセッションで:
1. プロフィール編集で avatar / handle / display_name 設定
2. 配送情報 (shipping_name / postal_code / address_line1 / address_line2) 入力
3. 出品 3 件 (active 2 + inactive 1)
4. 別アカウント B の出品に提案 (pending offer 1 件)
5. 別アカウント C の出品を通報 (reports row 1 件)
6. 別アカウント D をブロック (user_blocks row 1 件)

#### Step 3: completed 履歴を作る (任意)

A と E の間で交換完了 (offer accept → 双方 shipment shipped → 双方 confirm receipt) し、A の cards 1 件が status='traded' になる状態を作る。

#### Step 4: 削除前スナップショット

削除前に Supabase Dashboard → SQL Editor で以下を実行し、結果をメモ:

```sql
-- A の uid を取得
select id from auth.users where email = 'A_test_email@example.com';
-- 以降 $A_UID として使う

-- A の profiles 行
select id, handle, display_name, avatar_url, shipping_name, postal_code,
       address_line1, address_line2, mode, trade_count, is_pioneer
from public.profiles where id = '$A_UID';

-- A の cards (status 内訳)
select status, count(*) from public.cards
where owner_user_id = '$A_UID' group by status;

-- A の offers (status 内訳)
select status, count(*) from public.offers
where proposer_user_id = '$A_UID' group by status;

-- A の trades (status 内訳)
select status, count(*) from public.trades
where proposer_user_id = '$A_UID' or receiver_user_id = '$A_UID'
group by status;

-- A の reports
select count(*) from public.reports where reporter_id = '$A_UID';

-- A の user_blocks
select count(*) from public.user_blocks where blocker_id = '$A_UID';
```

active trade 判定で削除拒否されないよう、上記 trades の `pending / in_transit / partially_received / disputed` は **0 件であること** を確認。

---

## 3. 削除実行 + 検証クエリ (P0-4)

### 3.1 アプリから削除実行

1. A セッションのまま「マイページ → アカウントを削除」
2. 「削除されるデータ」「履歴として残るデータ」を確認
3. 「削除」とテキスト入力 → CTA 押下
4. 二段 Alert → 「削除する」押下
5. 「アカウントの削除を完了しました」 Alert → login 画面遷移

### 3.2 削除後の検証クエリ

Supabase Dashboard → SQL Editor で以下を実行。$A_UID は §2.4 でメモした uid。

#### (a) auth.users から消えていること

```sql
select count(*) from auth.users where id = '$A_UID';
-- 期待: 0
```

#### (b) profiles が匿名化保持されていること

```sql
select id, handle, display_name, avatar_url,
       shipping_name, postal_code, address_line1, address_line2,
       mode, trade_count, ship_rate, is_pioneer, last_active_at
from public.profiles where id = '$A_UID';
-- 期待:
--   id            = $A_UID (維持)
--   handle        = 'deleted_user_<short_id>'  (匿名化)
--   display_name  = '削除済みユーザー'         (匿名化)
--   avatar_url    = null                        (NULL 化)
--   shipping_name = null
--   postal_code   = null
--   address_line1 = null
--   address_line2 = null
--   mode          = 'oshi' 等 (NOT NULL、維持)
--   trade_count   = 維持 (Trust 数値)
--   ship_rate     = 維持
--   is_pioneer    = 維持 (Pioneer 列維持方針 案 X)
--   last_active_at = null
```

#### (c) cards 二分処理

```sql
select status, count(*) from public.cards
where owner_user_id = '$A_UID' group by status;
-- 期待:
--   active   = 0 件 (物理削除)
--   inactive = 0 件 (物理削除)
--   reserved = 0 件 (active trade ガードで削除前に存在しないはず)
--   traded   = 元と同数 (匿名化保持、image_url / description は NULL)

-- traded の匿名化確認
select id, name, image_url, image_back_url, image_url_cropped,
       description, want_description, want_image_url, want_image_back_url
from public.cards
where owner_user_id = '$A_UID' and status = 'traded';
-- 期待:
--   name は維持 (相手の取引履歴で表示)
--   image_url / image_back_url / image_url_cropped = null
--   description / want_description = null
--   want_image_url / want_image_back_url = null
```

#### (d) pending offers cancel

```sql
select status, count(*) from public.offers
where proposer_user_id = '$A_UID' group by status;
-- 期待:
--   pending   = 0 件 (cancelled に遷移済)
--   cancelled = 元 pending + 元から cancelled だった分
--   accepted/declined/completed は元のまま (履歴保持)
```

#### (e) reports の reporter_id 匿名化

```sql
-- 削除前は count > 0、削除後は 0 (NULL 化されているため)
select count(*) from public.reports where reporter_id = '$A_UID';
-- 期待: 0

-- 通報内容自体は残っている (NULL の reporter_id で運営対応用に保持)
select count(*) from public.reports where reporter_id is null;
-- 期待: 削除前の A の reporter 件数分が増えている
```

#### (f) user_blocks の blocker 側削除

```sql
select count(*) from public.user_blocks where blocker_id = '$A_UID';
-- 期待: 0 (物理削除済)

-- 相手側 (B が A をブロックしていた行) は auth.users CASCADE で削除済
select count(*) from public.user_blocks where blocked_user_id = '$A_UID';
-- 期待: 0
```

#### (g) wanted_cards / shelf_items / user_oshi / user_keyword_history

```sql
select count(*) from public.wanted_cards where user_id = '$A_UID';
select count(*) from public.shelf_items  where user_id = '$A_UID';
select count(*) from public.user_oshi    where user_id = '$A_UID';
select count(*) from public.user_keyword_history where user_id = '$A_UID';
-- 期待: いずれも 0 (物理削除 + auth.users CASCADE 両方で 0 確実)
```

#### (h) venue 関連

```sql
select count(*) from public.venue_checkins      where user_id = '$A_UID';
select count(*) from public.venue_supply_posts  where user_id = '$A_UID';
select count(*) from public.venue_holds         where proposer_id = '$A_UID' or receiver_id = '$A_UID';
select count(*) from public.venue_trades        where proposer_id = '$A_UID' or receiver_id = '$A_UID';
-- 期待: 全て 0
```

#### (i) trades 履歴保持

```sql
select status, count(*) from public.trades
where proposer_user_id = '$A_UID' or receiver_user_id = '$A_UID'
group by status;
-- 期待: completed / cancelled / disputed が元のまま (履歴保持、相手側のため)
```

### 3.3 全部クリアなら QA OK

上記 (a)-(i) すべて期待通りなら、削除フロー検証完了。Apple 審査提出可能。

---

## 4. 削除後の相手側取引履歴 QA (P1-2)

### 4.1 検証シナリオ

A 削除後、A と過去取引した B のセッションで:

#### (a) trades タブ
- 取引一覧で A との完了取引が表示される (画面クラッシュなし)
- 相手名 (= proposer/receiver name) は **「削除済みユーザー」** と表示される (profile 匿名化により自動的にそう見える)
- avatar 部分は default placeholder

#### (b) 取引詳細画面 `/trade/[offerId]`
- A との完了取引詳細を開く → クラッシュなし
- counterpart profile に Trust badge / 数値が表示される (trade_count 等の数値列は維持)
- counterpart の shipping_name / postal_code / address_line* は null だが、完了済 trade のため住所表示は不要 → 画面崩れなし

#### (c) listing 詳細画面 `/listing/[id]` (A の traded カードを直接開いた場合)
- カード詳細表示 → クラッシュなし
- image が null → React Native の `<Image source={{ uri: null }}>` は placeholder 動作 (expo-image はエラー出ない)
- description / want_description が null → 表示部で「—」or 空文字に defensive fallback されているか確認
- 出品者表示は「削除済みユーザー」
- CTA は status='traded' のため「交換済み」disabled 表示で OK

#### (d) offer 詳細 (もし A と pending offer があったが削除時 cancel された場合)
- offer.status='cancelled' で表示される
- proposer/receiver name が「削除済みユーザー」
- 履歴自体は残る

### 4.2 既知の対応箇所 (コード上の defensive check)

以下のファイルで、profile が匿名化済 (handle が 'deleted_user_*') / 画像が null の場合の表示を確認:

| ファイル | 確認箇所 |
|---|---|
| `app/(tabs)/trades.tsx` | `getProfileName()` 等で profile.handle / display_name の null/anon 時 fallback |
| `app/trade/[offerId].tsx` | counterpart profile / shipment 表示 |
| `app/offer/[offerId].tsx` | proposer profile 表示 |
| `app/listing/[id].tsx` | owner profile + image_url null フォールバック |
| `app/(tabs)/mypage.tsx` (history タブ) | 相手 profile 表示 |

### 4.3 結論 (実装確認、2026-06-05)

profile 匿名化 (handle='deleted_user_<short_id>', display_name='削除済みユーザー') により、`profile.handle ?? profile.display_name ?? 'ユーザー'` のような既存パターンで自動的に「削除済みユーザー」が表示される。

image_url null は expo-image / RN Image の標準動作で placeholder 表示、クラッシュなし。

→ **Phase 0 範囲では追加修正不要**。実機 QA でクラッシュ等あれば別 PR で defensive fallback 追加。

---

## 5. RLS 確認結果 (P0-3)

### 5.1 reports (`docs/migration_reports.sql`)

```sql
alter table public.reports enable row level security;

create policy "Users can create their own reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

create policy "Users can read their own reports"
  on public.reports for select
  using (auth.uid() = reporter_id);
-- UPDATE / DELETE policy なし → 全否定
```

✅ 期待方針満たす:
- 認証ユーザーのみ insert 可能 (reporter_id = auth.uid() 限定)
- 他人通報を select できない (auth.uid() = reporter_id でフィルタ)
- UPDATE/DELETE は全否定 (運営は service_role でバイパス確認)
- reporter_id nullable (PR-D で migration 適用済) で削除後の履歴保持可能、NULL 化済通報は `auth.uid() = NULL` と一致しないため一般ユーザーから見えない

→ **追加 migration 不要**

### 5.2 user_blocks (`docs/migration_user_blocks.sql`)

```sql
alter table public.user_blocks enable row level security;

create policy "Users can create their own blocks"
  on public.user_blocks for insert
  with check (auth.uid() = blocker_id);

create policy "Users can read their own blocks"
  on public.user_blocks for select
  using (auth.uid() = blocker_id);

create policy "Users can delete their own blocks"
  on public.user_blocks for delete
  using (auth.uid() = blocker_id);
-- UPDATE policy なし → 全否定
```

✅ 期待方針満たす:
- blocker_id = auth.uid() のみ insert
- blocker_id = auth.uid() のみ delete
- 自分の block 一覧のみ select (他人 block 関係読めない)
- UPDATE 全否定 (解除は DELETE で実施)

→ **追加 migration 不要**

---

## 6. A-1 trade 側 E2E 再検証結果 (2026-06-10)

PR #22 で trade 系 6 FK を `profiles(id) ON DELETE CASCADE` に張り替えた後の実機 E2E 再検証記録。

### 6.1 前提

- `fix/fk-user-refs-to-profiles` の migration が main にマージ済 (`d2b7cec`)
- trade 系 6 FK (`trades.proposer_user_id` / `trades.receiver_user_id` / `shipments.user_id` / `trade_disputes.opened_by_user_id` / `trade_disputes.resolved_by_user_id` / `trade_items.owner_user_id`) が `profiles(id) ON DELETE CASCADE` であることを事前確認済
- `profiles.id` に `auth.users.id` への FK が無いこと (tombstone 設計成立) を事前確認済 (`Success, No rows returned`)

### 6.2 シナリオ S2: active trade guard

実機で確認済。

手順:
- X で出品
- Y で交換提案
- X で承認
- trade が `pending` の状態で停止
- X でアカウント削除画面へ
- 削除不可表示が出ることを確認

結果:
- active trade があるユーザーは削除不可
- 削除 CTA は実行できない
- → guard 合格

### 6.3 シナリオ S1: completed trade を持つユーザーの削除

実機で確認済。

手順:
- S2 で使った trade をそのまま進行
- X / Y 双方発送
- X / Y 双方受取確認
- trade `completed`
- X をアプリ退会フローで削除
- Y 側 UI で履歴確認

結果:
- アプリ退会フローで削除完走
- Y 側 UI で履歴が残ることを確認
- 「削除済みユーザー」表示を確認
- → completed trade 履歴保持 合格

### 6.4 DB 検証結果

削除対象ユーザー UID: `1583f8d1-87ec-4ef8-bc43-59c61da24ca8` (tombstone 化済 = 個人情報なし、検証エビデンスとして full UUID 保持)

| 確認項目 | 実測 | 期待 | 判定 |
|---|---:|---:|---|
| `auth.users` 残存数 | 0 | 0 | PASS |
| `profiles` tombstone 残存数 | 1 | 1 | PASS |
| `profiles.handle` | `deleted_user_1583f8d1` | `deleted_user_*` | PASS |
| `profiles.display_name` | 削除済みユーザー | 削除済みユーザー | PASS |
| profile 個人情報列 (avatar_url / shipping_name / postal_code / address_line1 / address_line2 / last_active_at) | NULL | NULL | PASS |
| `trades` (X 関与) | `completed` 1 件残存 | 残存 | PASS |
| `shipments` (X 発送) | 1 | 削除前と同値 | PASS |
| `trade_items` (X 所有) | 1 | 削除前と同値 | PASS |
| `cards` active / inactive / reserved | 0 | 0 | PASS |
| `cards` traded | 1 件残存、画像系 NULL | 残存 + 匿名化 | PASS |
| `wanted_cards` | 0 | 0 | PASS |

### 6.5 結論

- `profiles.id` に `auth.users.id` への FK がないため、`auth.users` 削除後も profiles tombstone が残る
- trade 系 6 FK は `profiles(id) ON DELETE CASCADE` であることを事前確認済み
- active trade guard は実機で正常動作確認済み
- completed trade を持つユーザー削除後も、`trades` / `shipments` / `trade_items` は保持される
- 相手側 UI で履歴が確認できる
- → **A-1 trade 側 end-to-end 再検証は PASS**

### 6.6 残課題 (2026-06-10 時点、その後の進捗は §7 参照)

- ~~A-3 venue 系 FK の張り替え (`venue_holds` / `venue_trades` / `venue_checkins` / `venue_supply_posts` 等は依然 `auth.users(id)` 参照) → §7 で進捗更新~~ → **[完了 2026-06-14]** §7.5 参照。会場関連データあり + 会場交換完了済ユーザーの実機 `delete_my_account` PASS により、venue FK が退会をブロックしないことを最終確認。
- その他 `auth.users(id)` 参照のまま残るテーブル (`wanted_cards` / `reports` / `user_blocks` / `shelf_items` / `user_oshi` / `user_keyword_history` / `pioneer_program_applications`) の処置方針確定
- ~~普通郵便・ミニレター時の発送通知失敗の調査~~ → **[解決済 2026-06-14]** PR #23 (`7eca046`) で 3 層対応済。
  - DB: `shipments_tracking_required_when_shipped_chk` を 3 OR 化 (`docs/migration_shipments_tracking_chk_relax_for_postal.sql`、`b8b982a`)。本番 DB 適用済を `pg_constraint` + `pg_proc` 直接確認 SQL で PASS 確認。
  - RPC: `submit_trade_shipment` を `p_shipping_method` 必須化の 4 引数版に拡張 (`docs/migration_rpc_submit_trade_shipment.sql`)、postal 時のみ `TRACKING_NUMBER_REQUIRED` を skip。
  - UI: `app/trade/[offerId].tsx` で `SHIPPING_METHOD_OPTIONS` に postal: `hasTracking=false` を追加、PostgrestError の `.message` を Alert 表示 (`6cba6db`)。
  - 実機スモーク (2026-06-14): 通常交換で「普通郵便・ミニレター」選択 + 追跡番号 / 配送業者なしで発送通知が成功することを確認。

---

## 7. A-3 venue FK audit / 退会処理の E2E 状況

- PR #24 は venue FK / `delete_my_account` の DB 基盤 PR として扱う。
- 変更は本番 Supabase DB に適用済み。
- `delete_my_account` の tombstone 前提は確認済み。
  - `profiles` は物理削除しない。
  - PII を NULL 化し、`profiles.id` は維持する。
  - 相手側履歴では「削除済みユーザー」として表示する設計。
- ただし A-3 E2E は venue モードの P0 未整備により blocked。
  - Hold 受信の気づき導線 → PR #26 で解消
  - Hold 承認導線 → PR #26 で解消
  - venue_trade 生成後の状態遷移 → **PR4a で解消** (役割中立対称確定 / `partially_confirmed` 導入、B1+B2 修正)
  - 会場取引履歴表示
  - venue_trade 専用 DM

  会場取引ループを実機で完走できない構造は PR4a 完了で技術的には解消。ただし A-3 退会
  E2E の最終 close は **PR8 の総合 QA** で会場モードフル E2E と統合検証してから判断する
  (`docs/venue_mode_requirements.md` §15 方針)。
- 本 PR / 本記録をもって A-3 完了扱いにはしない。
- venue モード P0 修正完了 + PR8 統合 QA 完走後に A-3 を close する。
- 既知リスク:
  - 通常退会 RPC では発生しないが、`profiles` を手動 DELETE すると、`ON DELETE CASCADE` により venue 履歴や将来の DM 証跡が消える可能性がある。
  - 手動 DELETE は禁止運用とし、将来的に DB 防御を検討する。
- 関連: 会場モード刷新の P0 / P1 / P2 仕様および A-3 再開条件は `docs/venue_mode_requirements.md` 参照。

### 7.5 A-3 / D-7 venue FK final close (2026-06-14)

- **実機確認結果** (2026-06-14、実機 QA):
  - 会場関連データがあるユーザーで `delete_my_account` を実行 → **成功**
  - 会場交換を完了させたユーザーで同じく `delete_my_account` を実行 → **成功**
- **判定**: PR #24 で張り替えた venue FK が `delete_my_account` をブロックしないことを実機で最終確認。tombstone 設計どおり `profiles.id` は維持され、相手側履歴は「削除済みユーザー」表示で保たれる。
- **A-3 / D-7 final close**: 本記録をもって、`§6.6` 先頭の `A-3 venue 系 FK の張り替え` 項目および棚卸し D-7「A-3 退会 E2E final close」を **完了扱い**。
- **スコープ限定**: 本 close は「venue FK が `delete_my_account` をブロックしないこと」に限定。**C-1 PR8 venue 統合 QA (会場モードフル E2E、取引履歴表示、venue_trade 専用 DM の通しシナリオ等)** は別タスクとして引き続き open。未確認の通しシナリオが残るため、本記録で C-1 全体を close しない。

---

## 8. 改訂履歴

- **v1 (2026-06-05)**: 初版。Phase 0 外部レビュー指摘を受けて作成。
  - P0-1 確認結果 (Edge Function 本人性 OK)
  - P0-3 確認結果 (RLS 両表 OK)
  - P0-4 フル QA 手順 + 検証クエリ
  - P1-2 相手側取引履歴 QA 結論
- **v2 (2026-06-10)**: §6 を追加。
  - PR #22 (FK 6 本張り替え) merge 後の実機 E2E 再検証結果を記録
  - S1 / S2 両シナリオ PASS を明記
  - DB 検証結果を表形式で残存 (UID `1583f8d1-87ec-4ef8-bc43-59c61da24ca8`)
- **v3 (2026-06-13)**: §7 を追加。
  - PR #24 (venue FK 5 本張り替え + `delete_my_account` venue active judgement 追加) の状態を記録
  - A-3 E2E が venue モード P0 未整備により blocked であることを明記
  - 本 PR / 本記録での A-3 完了扱いを否定
  - § 6.6 の残課題見出しを「2026-06-10 時点」と注記し §7 への参照を追加
- **v4 (2026-06-13)**: §7 の blocker 進捗を更新。
  - PR #26 で「Hold 受信の気づき導線」「Hold 承認導線」解消
  - PR4a で「venue_trade 生成後の状態遷移」解消 (`partially_confirmed` 再設計 + B1 修正)
  - 残 blocker: 会場取引履歴表示 / venue_trade 専用 DM
  - A-3 final close は PR8 統合 QA で判断する方針を明記
- **v5 (2026-06-14)**: §6.6 の残課題 1 件を消し込み。
  - 「普通郵便・ミニレター時の発送通知失敗の調査」を [解決済 2026-06-14] として PR #23 で 3 層対応済 (DB CHECK 緩和 / RPC 4 引数化 / UI 配送方法選択 + エラー表示) を記録
  - 本番 DB 適用確認 SQL (PR5 配送タスク完了確認) + 通常交換 postal 実機スモーク (2026-06-14) でいずれも PASS
- **v6 (2026-06-14)**: §7.5 を追加、A-3 / D-7 final close を記録。
  - 会場関連データありユーザー + 会場交換完了済ユーザーの `delete_my_account` 実機 PASS
  - PR #24 で張り替えた venue FK が退会をブロックしないことを最終確認
  - §6.6 の `A-3 venue 系 FK の張り替え` 項目を完了マーカーに置換
  - **C-1 PR8 venue 統合 QA (フル E2E / 取引履歴 / DM 通し) は別タスクとして引き続き open**、本 v6 で C-1 全体を close しない方針を明記
