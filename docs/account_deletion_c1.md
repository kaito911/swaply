# C-1: 退会時の完全削除 (審査ブロッカー・本番反映 + 実機検証済 2026-07-09)

> 退会 (`delete_my_account` RPC + `delete-account` Edge Function) で、UI が「削除する」と
> 約束した個人情報 (いいね・出品画像・端末トークン・avatar) を本番で完全に消すまでの記録。
> β1 レビューで審査ブロッカー (C-1) として挙げた項目の是正。
> 本ドキュメントは **完了記録** (本番反映 + 実機検証済)。DB/RPC/Storage の実体は本番を正とする。

## 背景

`app/account-delete.tsx` は「いいね / 出品画像 / 求リスト削除」を UI で約束するが、実装が追いついていなかった:
- `delete_my_account` RPC が **liked_cards / push_tokens を削除しない** (profiles が tombstone=匿名化のため、FK=profiles(id) CASCADE も発火しない)。
- Storage 実ファイル (`card-images` / `avatars`) を**削除しない** (RPC は DB の image_url を null 化するのみ)。

→ 削除の約束と実挙動が不一致 = **App Store 審査 / プライバシー / 規約の重大リスク**。

※ 住所 (`user_shipping_addresses`) は本番 RPC で**既に対応済**だった (当初レビューの推測を本番確認で訂正)。C-1 の実体は「いいね + storage 実ファイル」に絞られた。

## 是正 (2 ファイル)

### 1. `delete_my_account` RPC (CREATE OR REPLACE・本番適用済)
Step2 に 2 行追加:
```sql
delete from public.liked_cards where user_id = v_user_id;
delete from public.push_tokens where user_id = v_user_id;
```
- **`card_wanted_links` は追加不要** — `card_id → cards ON DELETE CASCADE` で、RPC の cards 物理削除時に自動消去される (本番 `confdeltype='c'` 確認済)。
- liked_cards / push_tokens は `user_id → profiles` CASCADE だが profiles tombstone のため自動消去されず、明示 delete が必須。

### 2. `delete-account` Edge Function (version 5 deploy 済)
`supabase/functions/delete-account/index.ts`。Step A (RPC) と Step B (auth 削除) の間に **Step A2: storage 実ファイル削除**を挿入:
- **card-images**: 汎用再帰 list (`listAllStorageFiles`、`entry.id == null` = フォルダ検出 → 再帰) で `${userId}/` 配下 (`venue-supply` / `venue-hold` / `wants` サブフォルダ含む) の全実ファイルパスを収集 → `.remove([...])` バッチ。
- **avatars**: `${userId}.jpg` を `.remove` (単一ファイル固定パス)。
- **best-effort**: 両方 try/catch で never throw。storage 失敗でも console.error にパスをログし、**Step B (auth 削除) に必ず進む** (アカウント消滅を優先)。冪等のため `AUTH_DELETE_FAILED` 再 invoke でも安全。

適用: `npx supabase functions deploy delete-account --project-ref tayrdjuizpyrxohduspe` → version 4 → **5 / ACTIVE** (2026-07-09、既存 link + login 済のため無停止 deploy)。

## 実機検証 (テスト垢 `a47fcd64` で退会・2026-07-09)

| レイヤー | 検証項目 | 結果 |
|---|---|---|
| RPC | liked_cards | 1 → 0 (いいね削除の約束を実証) |
| RPC (CASCADE) | card_wanted_links | 1 → 0 (cards 物理削除の CASCADE) |
| RPC | profiles.handle | NULL → `deleted_user_a47fcd64` (匿名化) |
| Edge Function | card-images/`{uid}`/ フォルダ | 消滅 (storage 実ファイル削除) |
| Auth (Step B) | auth.users | 1 → 0 |

→ **全レイヤー (RPC / Storage / Auth) の連携動作を 1 回の退会で確認**。

## backlog

- **M-cleanup-9**: 退会 storage 残存の定期 GC。best-effort で消し残った「auth.users 非存在の userId フォルダ」を回収する恒久ジョブ。β1 は best-effort + ログ (`[delete-account] ...remove failed` / `cleanup threw`) で許容し、監視ログの頻度を見てから着手。

## 結果

**審査ブロッカー C-1 解消**。UI で約束した個人情報削除 (いいね・出品画像・端末トークン・avatar・求リンク・住所) が本番で完全動作する。

## 関連ファイル
- RPC: `docs/migration_rpc_delete_my_account.sql` (本番現行は liked_cards/push_tokens delete 追記済み)
- Edge Function: `supabase/functions/delete-account/index.ts` (commit `88a23b7`、本番 version 5)
- UI: `app/account-delete.tsx`
- backlog: `.claude` メモリ M-cleanup-9
