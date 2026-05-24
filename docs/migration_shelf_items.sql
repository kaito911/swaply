-- shelf_items テーブル作成
-- Supabase SQL Editor で手動実行してください

create table public.shelf_items (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  card_name   text        not null,
  group_name  text,
  member_name text,
  series      text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at 自動更新トリガー
create trigger update_shelf_items_updated_at
  before update on public.shelf_items
  for each row
  execute function public.update_updated_at_column();

-- RLS 有効化
alter table public.shelf_items enable row level security;

-- ポリシー: 自分の shelf_items のみ全操作可能
create policy "Users can manage their own shelf_items"
  on public.shelf_items
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 同一ユーザーによる同一カードの重複登録を防ぐ
alter table public.shelf_items
  add constraint shelf_items_unique_per_user
  unique (user_id, card_name, group_name, member_name, series);
