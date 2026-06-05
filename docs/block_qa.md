# ブロック機能 双方向性 QA + 残課題

最終更新: 2026-06-05
位置付け: Phase 0 外部レビュー P1-1 への対応記録

---

## 1. 現状実装 (Phase 0、PR-C #15 で実装済)

| 動作 | 実装状況 | 根拠 |
|---|---|---|
| A → B のブロックで A の home に B のカードが出ない | ✅ 実装済 | `app/(tabs)/home.tsx` の `fetchNewCards / fetchEasyCards / fetchRecommendedCards` に `excludeOwnerIds` を渡す |
| A → B のブロックで A の search に B のカードが出ない | ✅ 実装済 | `app/(tabs)/search.tsx` の `SearchScreen` が `blockedUserIds` を 4 つの Pane (Member/Text/Wanted/Direct) に props で配布、各 query に `excludeOwnerIds` で渡す |
| A → B のブロックで A から B への新規提案を防ぐ | ✅ 実装済 (2026-06-05 追加防御) | `lib/supabase.ts:createOffer` 冒頭で `fetchMyBlockedUserIds()` を呼び、`receiverId` が含まれていれば throw |
| A が listing/[id].tsx で B のカード詳細を直接 URL で開く | ⚠️ 部分対応 | カード自体は表示される (RLS 上 cards は public read)。CTA は status='active' なら有効に見えるが、提案実行時に上記 `createOffer` 防御で拒否される。UI 上の事前 CTA disable はなし (Phase 1 検討) |
| A → B のブロックで既存の進行中取引が壊れない | ✅ 維持 | PR-C で `fetchMyOffers` / `fetchTradeDetailByOffer` / `acceptOffer` 等の取引 API は触っていない (kaito 指示準拠) |
| **B → A の提案を拒否 (完全双方向ブロック)** | ❌ **未実装** | §3 参照 |

---

## 2. Phase 0 追加防御 (2026-06-05)

### 2.1 `createOffer` 内の self-block guard

```ts
const myBlockedIds = await fetchMyBlockedUserIds()
if (myBlockedIds.includes(params.receiverId)) {
  throw new Error('ブロックしている相手には提案できません。ブロックを解除してから再度お試しください。')
}
```

これにより:
- A が誤って listing 詳細を URL 直叩きで開いて「提案する」を押しても、提案実行時に block check で拒否される
- 「ブロックしている相手には提案できません」Alert がアプリ側で表示される

---

## 3. 未実装の残課題: B → A の提案拒否 (Phase 1 で対応検討)

### 3.1 なぜ Phase 0 で完全双方向化しないか

`user_blocks` の RLS policy は本人視点 (`blocker_id = auth.uid()`) のみ select 可。B → A のブロック関係を A 側 (= proposer) から確認するには、RLS の制約上以下が必要:

- **案 A**: SECURITY DEFINER RPC を新規作成 (例: `check_block_relationship(target_user_id uuid)`) で双方向 block 関係を返す
- **案 B**: `user_blocks` RLS を緩和 (個人情報漏洩リスク、運用課題)
- **案 C**: `accept_offer_atomic_v3` 内に block check 追加 (受諾時拒否、提案自体は通る)
- **案 D**: `createOffer` 自体を RPC 化 (SECURITY DEFINER で server-side block check)

いずれも実装変更が大きく、Phase 0 (β 前最小範囲) のスコープを超える。

### 3.2 Phase 1 推奨案

**案 D (createOffer の RPC 化)** が最も clean:
- 既存の `createOffer` クライアント関数は維持しつつ、サーバー側で SECURITY DEFINER RPC で:
  - proposer/receiver の双方向 block 関係を確認
  - card status / owner 検証
  - offers + offer_items を 1 トランザクションで insert
- ブロック関係があれば exception 返却 (例: `BLOCKED_BY_RECEIVER`)
- アプリ側で適切なエラーメッセージ表示

これにより atomicity と block 双方向対応を同時に達成できる。

### 3.3 Phase 0 の許容範囲

Phase 0 では:
- A が B をブロック → A の home/search/listing 一覧から B のカード除外 (実装済)
- A が B をブロック → A から B への提案は createOffer で拒否 (実装済)
- B が A をブロック → A から B への提案は拒否されない (Phase 0 では仕様外)

「A 側でブロックを設定したのに B から提案が来る」可能性は残るが、これは:
- 受信側 A は B からの提案を受信タブで見ることになる (RLS で offers.proposer or receiver = auth.uid() のみ select、表示はされる)
- ただし、A は B をブロックしているので home/search で表示されない関係性は保たれる
- 提案を辞退する選択肢が残る

この穴は Phase 1 で塞ぐ。本書を引き継ぎ用 issue / docs として残す。

---

## 4. QA 実機確認手順

### 4.1 準備

- アカウント A / B を用意
- B が出品 X を持っている

### 4.2 シナリオ

#### Step 1: A から home/search で B の出品が見える
- A セッションで home / search 各種 → X が表示されること

#### Step 2: A が B をブロック
- A → 出品 X 詳細を開く
- 「このユーザーをブロックする」リンク押下
- 確認 Alert → 「ブロックする」

#### Step 3: A の home/search から B が消える
- A セッションで home / search 再表示
- 期待: X (B の出品) が表示されない

#### Step 4: A が B の出品に提案 (URL 直叩き等で偶然到達)
- A → /listing/{X の id} URL を直接開く (UI 上の遷移は基本ない)
- カード自体は表示される (RLS 上 public read)
- 「交換を提案する」CTA 押下 → offer/create で「提案する」実行
- 期待: 「ブロックしている相手には提案できません」Alert (2026-06-05 追加 guard)

#### Step 5: 既存取引が壊れないこと
- A と B の間に進行中の取引 (pending/in_transit) がある場合、それは取引中タブで引き続き表示される
- 取引画面で発送 / 受取確認 / キャンセル等の操作が可能

#### Step 6: A がブロックを解除
- 出品 X 詳細 → 「このユーザーのブロックを解除する」
- 期待: A の home/search に B の X が再表示される

### 4.3 Phase 0 で確認できないシナリオ

- B → A 方向の提案拒否 (B が A をブロックしている状態で A から B に提案できるか) — Phase 1 課題

---

## 5. 改訂履歴

- **v1 (2026-06-05)**: 初版。Phase 0 外部レビュー P1-1 対応。
  - 現状の片方向ブロック実装範囲を整理
  - `createOffer` に self-block guard 追加 (誤操作防止)
  - 完全双方向化は Phase 1 で RPC 化案 (案 D) を推奨
