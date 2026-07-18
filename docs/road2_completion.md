# 道2（michi-2）完結記録 — 求のmaster構造化と検索・ナビ整理

作成日: 2026-07-19
目的: 道2の一連の決定と完了PRを repo に残し、次セッションでの再議論・思想の揺り戻しを防ぐ。
対象runtime: すべて OTA（EAS Update, channel=production, platform=ios）、runtimeVersion = `f41accd334bb4c417d6e1c9f47a50d454d787b6a`（build16）。DB/native/app.json 不変。

---

## 1. 背景と確定した思想（7/18 → 7/19 が最新）

- **版特定を諦め、求を文字master（group / member / item_type の3層）で構造化する方針に転換。**
- **求 = `cards.want_*`（`want_works` / `want_characters` / `want_item_types`, text[]）が正。** 出品カード自身の属性として求を持つ。
- **旧 `WantSection` / `wanted_cards`（求リスト＝リストから紐づけ選択する方式）はコード温存・UI非表示。** 将来「求リスト選択方式」に戻す可能性のための資産として残す（削除しない）。
- **7/18方針が 6/21 の思想を上書き:** 求リストは差別化の核ではなくなった。求がカード属性化したことで独立「求リストタブ」は不要 → 下タブから外し「出品」に置換。矛盾整理は不要（版特定放棄で前提が変わったため）。

関連メモリ: `project_want_input_separation`（道2新方針）。

---

## 2. 完了PR一覧（commit hash・すべて検証済み）

| PR | 内容 | commit | OTA group（本セッション分） |
|---|---|---|---|
| PR-2a | searchDirectMatch を master双方向overlapエンジンに書換 | `d969efe` | (compaction前) |
| PR-2a-fix | 指定軸のみAND overlap・必須撤廃・軸緩和 | `5dbaf8e` | (compaction前) |
| PR-2b | 検索マッチをチップ化＋ライブ検索＋ResultArea統一＋キーボード | `59fb23e` | (compaction前) |
| PR-2c | ホーム「マッチ率が高い交換」レーン（card毎双方向マッチ） | `c0956e3` | (compaction前) |
| 追修 | マッチタブ 上下スワップ（相手カード視点に統一） | `203be98` | `0f5beaeb` |
| 追修 | 求タブ検索バー placeholder を譲タブと統一 | `4b07057` | `5844dcb8` |
| PR-求Card化 | 求タブをCard化（向きB・道2整合・全カード表示） | `a213ca1` | `b79386da` |
| 追修 | マッチタブ＋ホームレーンを全カード表示（dedup解除） | `25865a5` | `5f53cf91` |
| PR-3③ | 検索3タブに「すべて表示」→3列グリッド | `26e8df5` | `4fbf0a2c` |
| PR-3① | 下タブ 求リスト→出品(action tab)＋グローバルFAB削除 | `d30ed96` | `c7eb5831` |
| PR-3⑤ | 求リストUI到達経路を全塞ぎ（案A・画面/DB温存） | `57fd97f` | `1c0442f6` |

---

## 3. 確定した技術事実（次セッションで再確認不要）

### 3.1 searchDirectMatch エンジン（lib/supabase.ts）
- 1クエリで master ID の双方向 overlap 判定。`myWants` → 相手カードの `characters`/`work_id`/`item_types`（相手の譲）と照合、`myOffers` → 相手カードの `want_*`（相手の求）と照合。指定軸のみ AND、全6軸空なら `[]`。
- **`dedupByOwner` 引数（既定 `true`）:** `true` = 1オーナー最上位1件、`false` = owner集約せず該当カード全件。
  - **検索3タブ（譲/求/マッチ）＋ホーム「マッチ率が高い交換」レーン = `false`（全カード表示）。**
  - **会場は searchDirectMatch を不使用**（呼出は home / search のみ）。
  - 既定 `true` を渡す既存呼出は無いため、`false` 明示箇所以外は影響なし（後方互換）。
- ホームレーンの段2 dedup（`bestByCard` = `offering_card.id` 単位・最高score）は残す＝同一相手カードの重複表示は防ぐ。

### 3.2 マッチタブの視点（app/(tabs)/search.tsx DirectMatchPane）
- **入力ラベルは自分視点**（上バー「譲を検索：相手が譲る商品」/ 下バー「求を検索：相手が求めている商品」）、**結果カードは相手カード視点**。
- **スワップ整合:** 上バー(offer* state) → `myWants`（相手 characters 照合）、下バー(want* state) → `myOffers`（相手 want_* 照合）。
- 「すべて表示」→3列グリッドへは **`mw_*`=offer(上バー) / `mo_*`=want(下バー)** で params 直列化し、遷移先で `myWants:{mw*}, myOffers:{mo*}` に戻す（スワップ整合厳守）。

### 3.3 求タブ 向きB（seller-side）
- 入力（自分が譲れるもの）→ `myOffers` → 相手カードの `want_*` 照合。`myWants` は空。`dedupByOwner:false`。
- **譲タブ（相手の `characters` 照合）と照合軸が逆** → 同じ入力でも別結果になり重複しない。
- 求タブの旧実装（wanted_cards＋素テキスト＋人返し）は searchWantedCards/WantedCardWithOwner として温存、UI経路のみ Card化に切替。

### 3.4 異体字問題の構造的解消
- 禰豆子（禰 = U+79B0）等、IME入力とDBの字形差でテキスト漢字照合が外れる問題。
- **チップ化（SearchAutocomplete で master を候補選択 → master ID を直接格納）により、テキスト漢字照合（findCharacterIdsByText）を経由せず構造的に解消。** 選択時に slug（例 `kimetsu_nezuko`）が入るため字形差が発生しない。

### 3.5 cards=140 は実データ
- `cards` は固有 RLS で anon role の read を弾き 0 行を返す。実データ 140 行は authenticated（アプリJWT）/ service role でのみ可視。「cards=0」は RLS の可視性アーティファクトであり、実データは K の実出品。**1行も削除・変更しない。**

### 3.6 PR-3① action タブの地雷回避（components/BottomTabBar.tsx）
- 下タブ中央「出品」は画面ではなく action タブ（`/listing/new/choose` へ push）。
- **`isSubmit` 早期分岐で `state.routes.find` の null 経路を通さない** → 空スロット化（過去の tab名不一致クラス）を回避。`isFocused` 常に false・badge 0。
- **出品タブは通常ラベル型**（他タブと同じ地味な見た目）。中央強調CTA型は過去に不具合 → 採用しない（K一次情報）。
- グローバル出品FAB（`_layout.tsx` の `<SubmitFab/>`）は廃止。**会場FAB（venue/[id].tsx の別呼出・hasTabBar=false）と SubmitFab コンポーネント本体は温存。**

### 3.7 求リスト概念のUI除去
- 求リストへの到達経路を全塞ぎ:（1）下タブ（PR-3①で出品に置換）、（2）mypage 設定リンク（削除）、（3）EmptyHomeState 第2CTA（削除）。
- **通常UIから `/wants` への能動導線はゼロ**（deep-link `/wants` はルート生存で開くが UI導線ではない）。
- **温存:** `app/(tabs)/wants.tsx` 画面本体（href:null）、DB `wanted_cards`、`searchWantedCards`/`WantedCardWithOwner` 定義。

---

## 4. 次セッションへの申し送り

- 道2は上記で**完結**。求=`cards.want_*` を正とする前提は確定済み、再議論不要。
- 求リストUIは意図的に隠した（削除ではない）。復活させる場合は wants.tsx / wanted_cards / searchWantedCards がそのまま使える。
- 残タスク全体の棚卸しは別途（本コミットと同時に実施したインベントリを参照）。
