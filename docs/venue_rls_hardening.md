# venue RLS ハードニング記録 (③ 三部作)

> venue_holds / venue_trades の書き込み経路を DEFINER RPC 一本に収束させ、RLS + GRANT の
> 二重防御を成立させるまでの記録。③-A → ③-B → ③-C の順で、非破壊 → 破壊的の順に適用した。
> 本ドキュメントは **完了記録** (本番適用済) であり、掲載 SQL は本番に適用した内容の再現。
> repo docs は本番実体と乖離しうるため、参照時は本番の `pg_policies` / `role_table_grants` を正とすること。

## 全体像

| フェーズ | 内容 | 破壊性 | 適用 | 記録ファイル |
|---|---|---|---|---|
| ③-A | venue write を DEFINER RPC 4種に集約 (create/decline/cancel_hold, confirm_trade) + lib を RPC 経由に書換 | 非破壊 | 済 | `docs/migration_rpc_venue_holds_trades_writes.sql` |
| ③-B | cancel 4 RPC を INVOKER→DEFINER 化 (ALTER) | 非破壊 | 済 | `docs/migration_rpc_venue_trade_cancel_definer.sql` |
| ③-C | venue_holds / venue_trades の RLS を SELECT-only に絞り、write GRANT を剥奪 | **破壊的** | 済 (2026-07-09) | 本ドキュメント |

③-C は破壊的 (旧クライアントの直接 write を拒否する) ため、③-A/③-B の RPC 版が全クライアントに
配信済みであることを前提に、実機回帰 OK 後に適用した。

---

## ③-C: venue_holds / venue_trades RLS write 締め出し (本番適用済 2026-07-09)

### 変更前 (本番実体)
- ポリシー: `"Participants can manage their holds"` / `"Participants can manage their venue trades"`
  - `cmd = ALL`, `roles = {public}`
  - `using` / `with check` = `(auth.uid() = proposer_id OR auth.uid() = receiver_id)`
- GRANT: anon / authenticated とも `INSERT / UPDATE / DELETE / SELECT` を全付与

### 変更後
- ポリシー: `venue_holds_select_participants` / `venue_trades_select_participants`
  - `cmd = SELECT`, `roles = authenticated`, 当事者条件を維持
  - ALL ポリシーは drop
- GRANT: `authenticated = SELECT のみ` (write 3 種 revoke)、`anon = write + select 全 revoke`

### 適用手順 (create 先行・drop 後追いで無停止)
1. **SELECT 専用ポリシーを別名 create** (ALL と共存・非破壊)
2. **実機検証ゲート①** (read 正常確認)
3. **ALL ポリシー drop** (SELECT ポリシー存在下で deny-all 窓ゼロ)
4. **実機検証ゲート②** (read + RPC 全経路確認)
5. **write GRANT revoke** (authenticated write 3 種 + anon 全 write + select)
6. **実機検証ゲート③** (最終・全経路確認)

> create を先に入れ drop を後追いにすることで、「ポリシーが一瞬も無い = deny-all」の窓を作らない。
> GRANT revoke を最後に回すのは、DEFINER RPC は owner 権限で書くため RLS/GRANT の影響を受けず、
> revoke 後も write RPC が動作することを段階的に確認するため。

### 適用した SQL (本番適用内容の再現)

```sql
-- ── Step 1: SELECT 専用ポリシーを別名で create (ALL と共存・非破壊) ──
create policy venue_holds_select_participants
  on public.venue_holds
  for select
  to authenticated
  using (auth.uid() = proposer_id or auth.uid() = receiver_id);

create policy venue_trades_select_participants
  on public.venue_trades
  for select
  to authenticated
  using (auth.uid() = proposer_id or auth.uid() = receiver_id);

-- ── (ゲート① read 正常確認後) ──

-- ── Step 3: ALL ポリシーを drop (SELECT ポリシー存在下で deny-all 窓ゼロ) ──
drop policy "Participants can manage their holds" on public.venue_holds;
drop policy "Participants can manage their venue trades" on public.venue_trades;

-- ── (ゲート② read + RPC 全経路確認後) ──

-- ── Step 5: write GRANT 剥奪 ──
-- authenticated: write 3 種を剥がし SELECT のみ残す
revoke insert, update, delete on public.venue_holds  from authenticated;
revoke insert, update, delete on public.venue_trades from authenticated;
grant  select                  on public.venue_holds  to   authenticated;
grant  select                  on public.venue_trades to   authenticated;
-- anon: write + select を全剥奪 (会場機能は認証必須)
revoke insert, update, delete, select on public.venue_holds  from anon;
revoke insert, update, delete, select on public.venue_trades from anon;

-- ── (ゲート③ 最終・全経路確認後) ──
```

### 適用後 検証クエリ
```sql
-- ポリシー: SELECT 専用のみ・authenticated・当事者条件が残っているか
select tablename, policyname, cmd, roles, qual
from pg_policies
where tablename in ('venue_holds','venue_trades')
order by tablename, policyname;
-- 期待: *_select_participants 各1行、cmd=SELECT、roles={authenticated}、
--       qual に (auth.uid()=proposer_id OR auth.uid()=receiver_id)。ALL ポリシーは出ない。

-- GRANT: authenticated=SELECT のみ、anon=無し
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('venue_holds','venue_trades')
order by table_name, grantee, privilege_type;
-- 期待: authenticated に SELECT のみ。INSERT/UPDATE/DELETE と anon の行は出ない。
```

### 前提 (実施前に確認済)
- **クライアントアクセスは全 SELECT-only** — `lib/supabase.ts` の venue_holds / venue_trades 参照
  5 箇所を grep 確認 (全て `.select()`、直接 write なし)。
- **write は ③-A / ③-B の DEFINER RPC 経由に集約済** — DEFINER は RLS/GRANT をバイパスするため、
  絞っても write RPC は影響を受けない。
- **cancel 4 RPC は ③-B で DEFINER 化済** — INVOKER のままだと RLS 絞りで書けなくなるため、
  ③-C の前提として ③-B を先行させた。AUTH_MISMATCH ガードは DEFINER でも本文に残存 (本番確認済)。

### 復元用 (万一の保険)
```sql
-- ALL ポリシー復元
create policy "Participants can manage their holds"
  on public.venue_holds
  for all
  to public
  using      (auth.uid() = proposer_id or auth.uid() = receiver_id)
  with check (auth.uid() = proposer_id or auth.uid() = receiver_id);
create policy "Participants can manage their venue trades"
  on public.venue_trades
  for all
  to public
  using      (auth.uid() = proposer_id or auth.uid() = receiver_id)
  with check (auth.uid() = proposer_id or auth.uid() = receiver_id);

-- GRANT 復元
grant insert, update, delete on public.venue_holds  to authenticated;
grant insert, update, delete on public.venue_trades to authenticated;
```
> 注: 復元して INVOKER 前提の直接 write に戻す場合は、③-A/③-B の DEFINER RPC と併用しても
> 害はない (RPC は引き続き動く)。復元は「RLS 絞りを一時的に緩める」保険であり、通常は不要。

### 結果
venue write 経路が **DEFINER RPC 一本に完全収束**。当事者による直接 DML (状態機械バイパス) は
RLS と GRANT の**二重防御**で不可能になった。read は当事者限定 SELECT のまま維持。

---

## 関連する未解決 (β1 レビューで別途指摘済み)

③-C は「当事者による write バイパス」を塞いだが、DEFINER RPC 内のロジック検証漏れは別問題として残る:
- **create_venue_hold の宛先/supply_post 未検証** (β1 レビュー High) — 任意宛 Hold・テキスト/画像注入が
  可能。RLS 収束とは独立に RPC 内バリデーションの追加が必要。`docs/migration_rpc_venue_holds_trades_writes.sql`
  の create_venue_hold 参照。

read 側の追加論点 (checkin 偽装・参加者 user_id 公開・supply_post SELECT 命名乖離) も β1 レビューに記録。
