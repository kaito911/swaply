-- 会場モード テーブル一括作成
-- Supabase SQL Editor で手動実行してください

-- ─────────────────────────────────────────
-- 1. venues（会場マスタ）
-- 運営が手動でinsertする
-- ─────────────────────────────────────────
create table public.venues (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null,
  venue_name    text        not null,
  event_date    date        not null,
  starts_at     timestamptz,
  ends_at       timestamptz,
  status        text        not null default 'upcoming',
  created_at    timestamptz not null default now(),
  constraint venues_status_check check (status in ('upcoming', 'open', 'closed'))
);

-- ─────────────────────────────────────────
-- 2. venue_checkins（チェックイン）
-- ─────────────────────────────────────────
create table public.venue_checkins (
  id         uuid        primary key default gen_random_uuid(),
  venue_id   uuid        not null references public.venues(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint venue_checkins_unique unique (venue_id, user_id)
);

alter table public.venue_checkins enable row level security;

create policy "Users can manage their own checkins"
  on public.venue_checkins for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Anyone can read checkins"
  on public.venue_checkins for select
  using (true);

-- ─────────────────────────────────────────
-- 3. venue_supply_posts（当日供給板）
-- ─────────────────────────────────────────
create table public.venue_supply_posts (
  id            uuid        primary key default gen_random_uuid(),
  venue_id      uuid        not null references public.venues(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  card_name     text        not null,
  group_name    text,
  want_card     text,
  status        text        not null default 'active',
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  constraint venue_supply_posts_status_check check (status in ('active', 'withdrawn', 'held'))
);

alter table public.venue_supply_posts enable row level security;

create policy "Users can manage their own supply posts"
  on public.venue_supply_posts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Checked-in users can read supply posts"
  on public.venue_supply_posts for select
  using (true);

-- ─────────────────────────────────────────
-- 4. venue_holds（Venue Hold）
-- ─────────────────────────────────────────
create table public.venue_holds (
  id              uuid        primary key default gen_random_uuid(),
  venue_id        uuid        not null references public.venues(id) on delete cascade,
  proposer_id     uuid        not null references auth.users(id) on delete cascade,
  receiver_id     uuid        not null references auth.users(id) on delete cascade,
  proposer_card   text        not null,
  receiver_card   text        not null,
  supply_post_id  uuid        references public.venue_supply_posts(id),
  status          text        not null default 'pending',
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint venue_holds_status_check check (status in ('pending', 'held', 'expired', 'cancelled', 'converted'))
);

alter table public.venue_holds enable row level security;

create policy "Participants can manage their holds"
  on public.venue_holds for all
  using  (auth.uid() = proposer_id or auth.uid() = receiver_id)
  with check (auth.uid() = proposer_id or auth.uid() = receiver_id);

-- ─────────────────────────────────────────
-- 5. venue_trades（現地取引）
-- ─────────────────────────────────────────
create table public.venue_trades (
  id              uuid        primary key default gen_random_uuid(),
  venue_id        uuid        not null references public.venues(id) on delete cascade,
  hold_id         uuid        not null references public.venue_holds(id) on delete cascade,
  proposer_id     uuid        not null references auth.users(id) on delete cascade,
  receiver_id     uuid        not null references auth.users(id) on delete cascade,
  proposer_card   text        not null,
  receiver_card   text        not null,
  status          text        not null default 'pending',
  proposer_confirmed_at timestamptz,
  receiver_confirmed_at timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint venue_trades_status_check check (status in ('pending', 'proposer_confirmed', 'completed', 'cancelled'))
);

alter table public.venue_trades enable row level security;

create policy "Participants can manage their venue trades"
  on public.venue_trades for all
  using  (auth.uid() = proposer_id or auth.uid() = receiver_id)
  with check (auth.uid() = proposer_id or auth.uid() = receiver_id);

-- ─────────────────────────────────────────
-- venues は RLS なし（公開データ）
-- ─────────────────────────────────────────
-- venuesテーブルは運営管理のため全員readのみ可
create policy "Anyone can read venues"
  on public.venues for select
  using (true);

alter table public.venues enable row level security;
