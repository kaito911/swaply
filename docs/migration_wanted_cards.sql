-- wanted_cards テーブル最小実装
-- Supabase SQL Editor で手動実行してください

create table public.wanted_cards (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  card_name   text        not null,
  group_name  text,
  member_name text,
  series      text,
  status      text        not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint wanted_cards_status_check check (status in ('active', 'fulfilled', 'archived')),
  -- 同一ユーザーによる同一カードの重複登録を防ぐ（需要DBの整合性保護）
  constraint wanted_cards_unique_per_user unique (user_id, card_name, group_name, member_name, series)
);

-- updated_at 自動更新トリガー
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_wanted_cards_updated_at
  before update on public.wanted_cards
  for each row
  execute function public.update_updated_at_column();

-- RLS 有効化
alter table public.wanted_cards enable row level security;

-- ポリシー: 自分の wanted_cards のみ全操作可能
create policy "Users can manage their own wanted_cards"
  on public.wanted_cards
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
