# 設計記録: 商品棚 (顔2 / 顔3) と cards.is_public

> このドキュメントは「決定」だけでなく「なぜそう決めたか」を残す。
> 将来これを読んだ人 (K または別の AI) が、この設計をそのまま実装できる粒度で書いてある。
> 決定だけ残すと後で理由が分からず再議論になるため、根拠を必ず併記している。

---

## 1. ステータス

- **設計完成 / β1 スコープ外 / density 到達後に実装**。
- 最終更新: 2026-07-09。
- 経緯: 顔2 (商品棚を提案の手札にする) / 顔3 (裏マッチング) の設計を完成させたが、
  β1 では発動機会が乏しいと判断し、UI からは消して設計のみ repo に記録した。
  非破壊の下地 (cards.is_public 等) は既に本番投入済みで、density 到達後に
  UI と RLS を足すだけで復活できる状態にしてある。

---

## 2. 商品棚の思想 (最重要・これが全ての設計判断の根拠)

- ×「持ってるものを見せたい」ではない。
- ×「相手を選びたい」でもない。
- ○「出品するのは渋る。でも自分が本当に欲しい商品が出てきた時に、交換提案できるように」
  = **切り札の温存**。

構造的に言うと、**棚はオプション (権利) であり、コミットメント (義務) ではない**:
- **出品** = 「求と交換する」という公の約束を負う。相手は誰でもいい。
- **棚**   = 約束せず持っておける。行使するかは自分が決める。

Swaply はこの思想を逆手に取り、交換を加速させるファクターにする。
軽い入口 (棚) で在庫を捕まえ、行使したくなる瞬間にそっと差し出す (= 顔3)。

---

## 3. なぜ β1 に入れないか

- 棚は density を **"増幅"** する機能であって、**"創る"** 機能ではない。
- 発動条件が「本当に欲しいものが出てきた時」→ **薄いフィードでは発動しない**。
- 実証: **shelf_items 本番 0 行**。顔1 (置くだけ) は既にリリース済みで誰も使っていない。
  (shelf.tsx に「登録すると成立しやすい交換候補に優先表示されます」と書いてあるのに
   優先表示は未実装 = ユーザーは「置いても何も起きない」を体感した。)
- 工数 (cards RLS 絞り + Storage signed URL 化 + 出品フロー改修 + ピッカー改修 = 中〜大) は
  density を **創る** 施策に振る。

---

## 4. 確定した設計 (復活時にそのまま実装できる粒度)

### 4.1 データモデル
- `shelf_items` 廃止 → `cards` に統合。
- **棚 = `is_public=false` / 出品 = `is_public=true`**。
- `status` (active→reserved→traded) = **ライフサイクル軸**。
  `is_public` = **可視性軸**。両者は直交する。
- **フィード可視条件 = `is_public=true AND status='active'`**。

### 4.2 なぜ cards 統合が唯一の道か
- 棚にも**写真必須** (現物写真 only の構造モート)。
- → 写真を持つと `shelf_items` と `cards` の差が `status` だけになる。
- → 別テーブルで持つ理由が消える。
- `offer_items.card_id` は FK → `cards(id)` ON DELETE CASCADE。
  → `shelf_items` は構造上 offer の参照先になれない。**統合が唯一の道**。

### 4.3 棚には求 (want) が不要。その根拠
- `scoreWantMatchV2` (`lib/matcher.ts:41-90`) は
  **「相手の求 × 自分カードの identity (characters[])」** で計算する。
- 自分カードの `want_*` は主入力ではない (line 70 の secondary fallback、現状 dormant)。
- → **棚カードが求を持たなくてもスコアは成立する**。
- ★ただし `characters[]` が空だと v1 (`wantParserMatcher` / TREASURE 辞書) に fallback し、
  STARTO / 鬼滅 / コナン等の非 K-POP で正規化が弱く品質劣化する。
- → **棚登録にもマスタ選択を必須にする** (`characters[]` を埋める)。
- v1 辞書の非 K-POP 拡張は無限作業なので採らない。

### 4.4 棚登録 UI
- ★分岐は「**入口**」に置く。出品ボタン → 「出品する / 棚に置く」を**先に選ばせる**。
- ★フロー最後で分岐するのは誤り。属性を全部入力し終わってから選ばせると
  「せっかくここまで入力したし出品しよ」となり、棚の存在意義が消える。
- 「出品する」→ 求を入力 → `is_public=true`。
- 「棚に置く」→ 求ステップをスキップ → `is_public=false`。
- どちらもマスタ選択を通るので `characters[]` が自動で埋まる。

### 4.5 提案ピッカー (`app/offer/create.tsx`)
- `fetchUserCards` に棚カード (`is_public=false`) を追加。
- ソートは既存の `scoreWantMatchV2` を**そのまま流用** (スコア関数の変更不要)。
- マッチ率の高い順に、棚と出品を混ぜて表示。
- 各カードの右上に「商品棚」「出品中」の小さいバッジ。
- ★棚を優先表示はしない。ユーザーの目的は「相手が欲しがるものを差し出す」であり、
  出所 (棚か出品か) は二次情報。

### 4.6 昇格・停止の導線
- **昇格**: 棚カード → 求を入力 → `is_public: false→true` (既存 WantSection 流用)。
- **停止**: 出品カード → 「出品を止める」→ `is_public: true→false`
  = そのまま商品棚に入る (「出品やめたけど、まだ持ってる」= 棚の意味と一致)。
- ★「出品を止める」機能は現状存在しない。**顔2 のスコープに含める**
  (`app/listing/[id].tsx` の自分の出品に配置。既存の `cards_update_own` RLS で書ける)。

---

## 5. 設計レビューで洗い出した穴と、その解決

| # | 穴 | 解決 |
|---|---|---|
| 1 | `is_public=false AND status='reserved'` が未定義 | 棚一覧に「取引中」として表示、選択不可。提案ピッカーは `status='active'` で引くので自動除外 |
| 2 | 提案拒否後も相手に棚カードが見え続ける | RLS の EXISTS に `o.status in ('pending','accepted')` を追加。加えて UI で「棚のカードは提案相手にのみ表示されます」と明示 (一度見せたものはスクショされる。技術で防げないので期待値を合わせる) |
| 3 | `/shelf` が何を表示するか未定義 | `cards WHERE is_public=false` の一覧。登録フォームは削除 (出品フローに統合) |
| 4 | 一括出品から棚に置けるか | β1 スコープ外。単品のみ。将来の拡張候補 |
| 5 | 「出品を止める」機能が存在しない | 顔2 のスコープに含める (§4.6) |
| 6 | Storage が公開バケット | `card-images` の SELECT ポリシーを `{public}→{authenticated}` に変更済 (2026-07-09)。完全解決は private bucket + signed URL 化。画像を出す全箇所の書換が必要なので β1 後 |

---

## 6. 復活時の前提条件 (これをやらずに棚を入れると事故る)

### 6.1 Step 3-c: cards の SELECT RLS を絞る
現在: `cards_select_authenticated (roles={authenticated}, qual=true)` = ログイン済みなら全 cards 読める。

絞り後:
```sql
is_public = true
OR owner_user_id = auth.uid()
OR EXISTS (offer_items 経由で自分が当事者。ただし o.status in ('pending','accepted') に限る)
OR EXISTS (trade_items 経由で自分が当事者)
```

★重要な前提: **`cards.owner_user_id` は交換完了後も移転しない**
- accept 時 (`accept_offer_atomic_v3`): `status='reserved'` に更新。`owner_user_id` は不変。
- 完了時 (`confirm_trade_receipt`): `status='traded'` に更新。`owner_user_id` は不変。
- 所有権は `trade_items` (オーナーのスナップショット) と取引履歴で表現される。
- → 閲覧許可は「所有権」ではなく「**当事者性**」で決めるしかない。だから EXISTS が 2 本要る。

性能: `idx_offer_items_card_id` / `idx_trade_items_card_id` は存在確認済み。
OR は Postgres が短絡評価するため、公開カード (`is_public=true`) は EXISTS を評価しない。

★**棚がない間は Step 3-c をやる価値がない**。
全 cards が `is_public=true` なので第 1 条件だけで全部通り、残り 3 条件は永久に評価されない
死に条件。得られる安全性はゼロで、破壊的変更のリスクだけが残る。**棚とセットで実施すること**。

### 6.2 Storage の signed URL 化
`card-images` を private bucket にし、署名付き URL で配信する。
現状は `{authenticated}` に絞っただけなので、URL を知っているログイン済みユーザーは
画像を見られる (cards の RLS で URL の流出は止まるが、一度見せた相手は控えられる)。
棚の写真を完全に守るには signed URL が必要。画像を出す全箇所の書換が要るので規模は大。

---

## 7. 既に入れた非破壊の下地 (削除しないこと)

- `cards.is_public boolean not null default true` (2026-07-09 本番適用、既存 130 件全て true)。
- `idx_cards_status_is_public (status, is_public)`。
- `lib/supabase.ts` の `is_public=true` 条件 12 箇所 (現状 no-op、復活時に効く)。
- `bulk.tsx` / `single-page.tsx` の `is_public: true` 明示。
- 死にコード除去: `app/card/[id].tsx` / `lib/cards.ts` / `data/cards.ts`
  (特に `getCards()` は status/owner/is_public フィルタなしの全件取得だった)。
- `cards_select_all (roles={public})` の drop = anon 締め出し。
- Storage "Anyone can view card images" `{public}` → `{authenticated}`。

★`is_public` を default true の**非破壊**で入れたから、棚を後回しにできた。
慎重に積んだことが選択肢を残した。**この原則を今後も守ること。**

---

## 8. 関連する決定

- `cards.status='inactive'` は使わない (設定するコードが存在しない)。
  フィード可視条件は `is_public=true AND status='active'` と定義する。
  `inactive` の CHECK 削除と `delete_my_account` の修正は **Phase 4 (旧フロー削除) で一緒に掃除**。

---

## 9. 顔3 (裏マッチング) ── 棚の完成形。棚とセットで β1 後

- 「A の棚 ↔ B の求」+「A の求 ↔ B の出品」の**二重一致**を検出し、システムが A に提案を投げる。
- 出品していない在庫を、眠らせずにマッチングに叩き起こす。
- ★これは押し売りではない。ユーザーは元々「本当に欲しいものが出たら出す」つもりで
  置いている。その「行使する瞬間」を教えるだけ。**棚の思想の完成形**。
- 顔2 だけでは棚は「見えない供給」に留まる (誰にも見えないので需要側からは存在しないのと同じ)。
- 単独では意味がなく、**棚とセットで実装する**。
- 実装には通知基盤・頻度制御・ミュート設定が要る (規模: 大)。

---

## 付録: 実装着手前のチェックリスト (復活時)

1. density が到達しているか (フィードに「本当に欲しいものが出てくる」密度があるか) を確認。
2. §6.1 Step 3-c の RLS 絞りを **本番現行定義を pull してから** 作成 (repo≠本番の原則)。
3. `idx_offer_items_card_id` / `idx_trade_items_card_id` の存在を再確認。
4. 出品フロー入口に「出品する / 棚に置く」分岐を追加 (§4.4)。
5. 棚登録にマスタ選択を必須化 (`characters[]` を埋める、§4.3)。
6. 提案ピッカーに棚カードを追加 + バッジ表示 (§4.5)。
7. 「出品を止める」導線を `listing/[id].tsx` に追加 (§4.6, §5-#5)。
8. Storage signed URL 化は顔2 と分離して規模判断 (§6.2)。
9. 顔3 は棚が回り始めてから (§9)。
