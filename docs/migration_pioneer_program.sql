-- Pioneer 制度 DB 最小実装
-- Supabase SQL Editor で手動実行してください
--
-- 詳細規約: docs/policies/pioneer_policy_v1.md
-- 関連 memory: project_monetization_round5_finalized.md §7
-- 上限: 50 名 (β1 早期参加 30 + 改善協力推薦 20)

-- ─────────────────────────────────────────
-- 1. profiles テーブル拡張 (5 列追加)
-- ─────────────────────────────────────────

alter table public.profiles
  add column if not exists is_pioneer boolean not null default false,
  add column if not exists pioneer_number integer,
  add column if not exists pioneer_joined_at timestamptz,
  add column if not exists pioneer_status text not null default 'pending',
  add column if not exists pioneer_forfeited_reason text;

-- pioneer_status の値域 (CHECK 制約、enum 型ではなく text で柔軟性確保)
alter table public.profiles
  drop constraint if exists profiles_pioneer_status_check;
alter table public.profiles
  add constraint profiles_pioneer_status_check
    check (pioneer_status in ('pending', 'active', 'forfeited'));

-- pioneer_number の値域 (1-50)
alter table public.profiles
  drop constraint if exists profiles_pioneer_number_range;
alter table public.profiles
  add constraint profiles_pioneer_number_range
    check (pioneer_number is null or (pioneer_number between 1 and 50));

-- pioneer_number の一意性 (50 名上限 + 番号衝突防止)
alter table public.profiles
  drop constraint if exists profiles_pioneer_number_unique;
alter table public.profiles
  add constraint profiles_pioneer_number_unique
    unique (pioneer_number);

-- is_pioneer と pioneer_number / pioneer_joined_at の整合性
-- is_pioneer = true のとき pioneer_number / pioneer_joined_at は必須
alter table public.profiles
  drop constraint if exists profiles_pioneer_consistency_check;
alter table public.profiles
  add constraint profiles_pioneer_consistency_check
    check (
      (is_pioneer = false)
      or (
        is_pioneer = true
        and pioneer_number is not null
        and pioneer_joined_at is not null
        and pioneer_status = 'active'
      )
    );

-- ─────────────────────────────────────────
-- 2. pioneer_applications テーブル新規
-- ─────────────────────────────────────────

create table if not exists public.pioneer_applications (
  id                  uuid        primary key default gen_random_uuid(),
  applicant_user_id   uuid        not null references auth.users(id) on delete cascade,
  application_reason  text        not null,
  contribution_notes  text,
  status              text        not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected')),
  reviewed_at         timestamptz,
  reviewed_by         uuid        references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 同一ユーザーで pending 申請は 1 件のみ (重複申請防止)
create unique index if not exists pioneer_applications_one_pending_per_user
  on public.pioneer_applications (applicant_user_id)
  where status = 'pending';

-- updated_at 自動更新トリガー
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pioneer_applications_set_updated_at on public.pioneer_applications;
create trigger pioneer_applications_set_updated_at
  before update on public.pioneer_applications
  for each row
  execute function public.set_updated_at();

-- ─────────────────────────────────────────
-- 3. RLS ポリシー
-- ─────────────────────────────────────────

alter table public.pioneer_applications enable row level security;

-- ユーザーは自分の申請を read 可能
drop policy if exists "Users read own pioneer applications" on public.pioneer_applications;
create policy "Users read own pioneer applications"
  on public.pioneer_applications
  for select
  using (auth.uid() = applicant_user_id);

-- ユーザーは自分の申請を insert 可能
drop policy if exists "Users insert own pioneer applications" on public.pioneer_applications;
create policy "Users insert own pioneer applications"
  on public.pioneer_applications
  for insert
  with check (auth.uid() = applicant_user_id);

-- ユーザーは自分の pending 申請のみ update 可能 (contribution_notes の追記用)
drop policy if exists "Users update own pending pioneer applications" on public.pioneer_applications;
create policy "Users update own pending pioneer applications"
  on public.pioneer_applications
  for update
  using (auth.uid() = applicant_user_id and status = 'pending')
  with check (auth.uid() = applicant_user_id and status = 'pending');

-- 注意:
-- - profiles.is_pioneer / pioneer_number / pioneer_status の更新は admin (service_role) のみで運用する想定
-- - 既存 profiles RLS ポリシーは変更しない (Self update を許可している既存運用を維持)
-- - 厳密な admin-only update lock は別途運用設計 (Step 3.5e 時点で検討)
-- - admin による承認フローは Phase 2 で実装、本 migration は DB スキーマ準備のみ
