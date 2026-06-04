-- migration_user_blocks.sql
-- user_blocks テーブル新規作成 (ブロック機能、Phase 0 PR-C)
--
-- Supabase SQL Editor で kaito が手動実行してください。
-- Dashboard 未適用、docs 保存のみ。
--
-- 用途:
--   - 「自分がブロックした相手」を保存する単方向リスト
--   - β1 では「自分の home / search / listing 一覧から相手の出品を非表示」する目的
--   - 相手→自分への表示制御 (双方向ブロック効果) は Phase 1.5+ で検討
--
-- 設計方針:
--   - blocker_id != blocked_user_id (自分自身のブロックを禁止)
--   - UNIQUE (blocker_id, blocked_user_id) で重複防止 (冪等性確保)
--   - INSERT / SELECT / DELETE は自分のレコードのみ (UPDATE は許可しない、解除は DELETE)
--   - 既存 trade / offer / shipment への影響なし (kaito 指示: 進行中取引には影響させない)

-- ─────────────────────────────────────────
-- 1. user_blocks テーブル
-- ─────────────────────────────────────────

create table public.user_blocks (
  id              uuid        primary key default gen_random_uuid(),
  blocker_id      uuid        not null references auth.users(id) on delete cascade,
  blocked_user_id uuid        not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint user_blocks_self_block_check
    check (blocker_id <> blocked_user_id),
  constraint user_blocks_unique
    unique (blocker_id, blocked_user_id)
);

-- ─────────────────────────────────────────
-- 2. インデックス
-- ─────────────────────────────────────────

-- 自分がブロックした相手一覧 (fetchMyBlockedUserIds 用、最頻アクセス)
create index user_blocks_blocker_idx
  on public.user_blocks (blocker_id);

-- 「自分がブロックされたか」逆引きは β1 では不要だが、将来の被ブロック側通知用に索引追加
create index user_blocks_blocked_idx
  on public.user_blocks (blocked_user_id);

-- ─────────────────────────────────────────
-- 3. RLS 設定
-- ─────────────────────────────────────────

alter table public.user_blocks enable row level security;

-- ブロック作成: blocker_id = auth.uid() のみ
create policy "Users can create their own blocks"
  on public.user_blocks
  for insert
  with check (auth.uid() = blocker_id);

-- ブロック参照: blocker_id = auth.uid() のみ
-- (被ブロック側からの逆引きは β1 では不可、Phase 1.5+ で双方向見直し時に追加)
create policy "Users can read their own blocks"
  on public.user_blocks
  for select
  using (auth.uid() = blocker_id);

-- ブロック解除: blocker_id = auth.uid() のみ
create policy "Users can delete their own blocks"
  on public.user_blocks
  for delete
  using (auth.uid() = blocker_id);

-- 注意:
--   - UPDATE のポリシーは作成しない → 全否定 (解除は DELETE で実施、UPDATE 不要)

-- ─────────────────────────────────────────
-- 4. 確認クエリ
-- ─────────────────────────────────────────

-- 期待される schema:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'user_blocks'
--   order by ordinal_position;
--
--   id              | uuid        | NO
--   blocker_id      | uuid        | NO  (FK auth.users ON DELETE CASCADE)
--   blocked_user_id | uuid        | NO  (FK auth.users ON DELETE CASCADE)
--   created_at      | timestamptz | NO
--
-- 制約確認:
--   - CHECK: blocker_id <> blocked_user_id
--   - UNIQUE: (blocker_id, blocked_user_id)
