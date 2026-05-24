-- user_oshi テーブル作成
-- Supabase SQL Editor で手動実行してください

create table public.user_oshi (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  group_name  text        not null,
  member_name text,
  created_at  timestamptz not null default now(),
  constraint user_oshi_unique_per_user unique (user_id, group_name, member_name)
);

-- RLS 有効化
alter table public.user_oshi enable row level security;

-- ポリシー: 自分の user_oshi のみ全操作可能
create policy "Users can manage their own oshi"
  on public.user_oshi
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
