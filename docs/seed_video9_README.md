# 動画 #9 用デモシードデータ — 使い方

最終更新: 2026-05-17

> **目的**: 動画 #9 (5/23 公開、SEVENTEEN ライブ前日関連、Pioneer 募集動線) の UI 画面録画用に、Swaply 開発環境を「ベータ版品質」に見せるシードデータを整備。

## 著作権セーフ保証

- **実在 IP の名前は完全に排除**: 「グループ A」「メンバー X」「キャラ D」等の汎用名のみ使用
- **実在グッズの写真・公式画像は使用しない**: 全画像 `placehold.co` (商用利用可、汎用プレースホルダー)
- **音声・BGM・ロゴは含まない** (DB データのみ)
- 詳細: `memory/project_copyright_research_2026-05-09.md`

## 投入されるデータ

| 種別 | 件数 | 識別マーカー |
|---|---|---|
| **profiles** UPSERT | 最大 10 名 (auth.users 数に依存) | `handle LIKE 'seed_demo_%'` |
| **cards** INSERT | **30 件** (auth.users 5 名なら 1 名 6 件、10 名なら 1 名 3 件) | `description LIKE '[SEED_V9]%'` |
| **wanted_cards** INSERT | **13 件** (Part A 7 + Part B 6) | seed プロフィール所有 + 特定 card_name |

### wanted_cards の分散構成 (直接交換 demo 対応)

| Part | 所有者 | 件数 | 目的 |
|---|---|---|---|
| **A** | seed_idx=1 (録画ユーザー) | 7 件 | Lane 1「いいねした交換」表示 |
| **B** | seed_idx=2-5 (他ユーザー) | 6 件 | 直接交換マッチング demo 成立 |

### 直接交換 demo のマッチングペア例 (seed_idx=1 録画ユーザー視点)
- 譲: 「アイドルカード」(seed_idx=1 所有) × 求: 「アクリルスタンド」 → seed_idx=2 とマッチ (seed_idx=2 が「アクリルスタンド」card 所有 + 「アイドルカード」を欲しい)
- 譲: 「ぱしゃっつ」 × 求: 「キャラ D アクリルスタンド」 → seed_idx=3 とマッチ
- 譲: 「グループ E メンバー Y」 × 求: 「コラボ クッション」 → seed_idx=4 とマッチ
- 譲: 「キャラ F マグネット」 × 求: 「キャラ F マグネット 別バージョン」 → seed_idx=5 とマッチ

### 30 件の cards ジャンル配分
| ジャンル | 件数 | 例 |
|---|---|---|
| K-POP 風 | 5 | アイドルカード セット A、アクリルスタンド L、公式トレカ 限定版 等 |
| サンリオ風 | 5 | キャラクター B マスコットぬいぐるみ、カフェ限定アクスタ 等 |
| あんスタ風 | 5 | ぱしゃっつ、キャラ C 缶バッジ、10 周年限定ノベルティ 等 |
| 鬼滅・コナン風 | 5 | キャラ D アクリルスタンド、TCG カード SR 等 |
| TREASURE 風 | 5 | グループ E メンバー Y トレカ、会場限定 フォトカード 等 |
| その他 (うたプリ・A3! 風) | 5 | キャラ F マグネット、グループ F 推し活セット 等 |

### 4 レーン構成データの分布
- **Lane 1 (いいねした交換)**: wanted_cards 7 件 ↔ seed cards のうち 7 件と fuzzy match → 表示
- **Lane 2 (あなたへのおすすめ)**: 全 30 件の中からマッチングスコア順
- **Lane 3 (新着の交換)**: created_at 直近 1-50 時間で分散、新着順
- **Lane 4 (成立しやすい交換)**: Trust スコア高めの seed_idx 6-10 が所有する 18 件相当

### Trust バッジ分布 (10 名)
| seed_idx | trade_count | Trust 想定 |
|---|---|---|
| 1 (録画ユーザー想定) | 5 | Trial Blue |
| 2 | 7 | Trial Blue |
| 3 | 12 | Blue |
| 4 | 15 | Blue |
| 5 | 20 | Blue |
| 6 | 25 | Blue |
| 7 | 30 | Gold Blue |
| 8 | 35 | Gold Blue |
| 9 | 40 | Gold Blue |
| 10 | 50 | Gold Blue |

---

## 実行手順

### 前提
1. Supabase dev プロジェクトに最低 **5 名の auth.users** が存在
   ```sql
   SELECT count(*) FROM auth.users;
   ```
2. 不足してる場合は Supabase Auth Dashboard or signup フローで追加作成

### Step 1: シード投入 (Supabase SQL Editor で実行)
1. Supabase Dashboard → SQL Editor → New query
2. `docs/seed_video9_demo.sql` の中身をコピペ
3. **Run** ボタンクリック
4. 最後の SELECT で確認:
   - `seed_users_count`: 5-10 (auth.users 数)
   - `seed_cards_count: 30`
   - `seed_profiles_count`: 5-10
   - `seed_wants_count: 13` (Part A 7 + Part B 6)

### Step 2: アプリ起動 (ローカル)
```bash
# プロジェクトルートで
npm run start

# iOS シミュレーター
npm run ios
# Android シミュレーター
npm run android
# 実機 (Expo Go)
# QR コードをスマホでスキャン
```

### Step 3: ログイン
- **最新 auth.user で signup or login** (seed_idx=1 = 録画ユーザー想定)
- このユーザーが Lane 1 「いいねした交換」に 7 件表示される視点

### Step 4: 録画 (15-30 分目安)

#### 録画推奨画面 (動画 #9 用)
| # | 画面 | 録画ポイント |
|---|---|---|
| 1 | ホーム (4 レーン全体) | スクロールで Lane 1 → 4 を見せる |
| 2 | Lane 1「いいねした交換」 | 7 件並ぶ様子、♡ filled 状態確認 |
| 3 | 出品詳細画面 | seed card の 1 件をタップ、Trust 表示・♡ overlay 操作 |
| 4 | 検索画面 | 「炭治郎」「ハローキティ」等の文字で検索 (seed cards は汎用名なので hit しないが、Phase 0.5b の UI を見せる) |
| 5 | 取引タブ | 提案 / 取引中サブタブ (実取引データは別途必要) |
| 6 | マイページ | Pioneer バッジ未表示状態 (Pioneer 申請動線示唆用、後日実装) |
| 7 | 出品フロー (listing/new) | 6 step の UI を見せる (実出品はしなくて OK) |

#### 録画しない画面 (実装途中 or 実データ不足)
- 会場モード (本シードでは venues データ未投入、後日追加可能)
- 通知一覧 (空表示のみ)
- 提案・取引フロー (実取引 + 配送データ必要)

### Step 5: ロールバック (録画完了後、任意)
1. Supabase Dashboard → SQL Editor → New query
2. `docs/seed_video9_demo_rollback.sql` の中身をコピペ
3. **Run** ボタンクリック
4. 確認: `remaining_seed_cards: 0`, `remaining_seed_profiles: 0`

#### ⚠️ ロールバックの制約
- **profiles の元データは復元不可** (元の handle / display_name / trade_count 等)
- rollback では `handle` を `user_NNN` 形式に変更するのみ
- 完全な原状回復が必要なら、test users を再作成

---

## 想定外発見・注意事項

### ① SVG プレースホルダーではなく placehold.co URL を使用
**経緯**:
- 当初仕様は「ローカル SVG ファイル を `public/seed-images/` 配置」だが、Expo RN アプリには `public/` 配下を URL 配信する仕組みがない (Web ビルド時のみ)
- cards.image_url は TEXT URL のため、ローカルファイルパスをそのまま指定できない
- 解決策: `placehold.co` の動的 URL を使用 (商用利用可、汎用プレースホルダー、即時動作)
- 例: `https://placehold.co/400x560/EC4899/FFFFFF?text=Card+001`
- 将来は Supabase Storage に SVG アップロード → URL 差替えで本格化可能

### ② venues / 会場モード データは別 commit
- 本シードは cards / profiles / wanted_cards のみ
- 会場モード demo (venue + checkin + holds) は別途必要なら追加可能
- 動画 #9 で会場モード画面を録画する場合は要追加

### ③ Pioneer バッジは別データソース
- Pioneer 制度の DB は別 migration (`migration_pioneer_program.sql`、commit `6c38cb9`) で実装済
- 本シードでは Pioneer 設定なし → マイページ Pioneer バッジ非表示
- 動画 #9 で Pioneer バッジを録画する場合は、seed_idx=1 ユーザーに is_pioneer=true + pioneer_number=1 を別 SQL で設定推奨

### ④ wanted_cards UNIQUE 制約により ON CONFLICT DO NOTHING
- 既に同じ wanted がある場合は無視 (再実行安全性)
- 削除は rollback SQL で実施

### ⑤ profiles の UPDATE は破壊的
- seed_idx=1〜10 の test profiles を上書き
- rollback では復元不可なので、seed 適用前に SELECT * FROM profiles を控えること推奨

---

## 関連ファイル

- `docs/seed_video9_demo.sql` (seed 投入 SQL)
- `docs/seed_video9_demo_rollback.sql` (rollback SQL)
- `docs/seed_video9_README.md` (本ファイル)
- `docs/migration_pioneer_program.sql` (Pioneer 制度 DB、別 commit)
- `memory/project_copyright_research_2026-05-09.md` (著作権精査)
- `docs/source/pricing_v2.md` (β1 リリース戦略、BILLING_ENABLED=false)
