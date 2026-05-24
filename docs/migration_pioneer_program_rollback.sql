-- Pioneer 制度 DB 最小実装 ロールバック
-- Supabase SQL Editor で手動実行してください

-- ─────────────────────────────────────────
-- 1. pioneer_applications テーブル削除
-- ─────────────────────────────────────────

drop trigger if exists pioneer_applications_set_updated_at on public.pioneer_applications;
drop table if exists public.pioneer_applications cascade;

-- set_updated_at 関数は他で使用される可能性があるので残す
-- 削除する場合: drop function if exists public.set_updated_at() cascade;

-- ─────────────────────────────────────────
-- 2. profiles テーブル拡張のロールバック
-- ─────────────────────────────────────────

-- 制約削除
alter table public.profiles
  drop constraint if exists profiles_pioneer_status_check,
  drop constraint if exists profiles_pioneer_number_range,
  drop constraint if exists profiles_pioneer_number_unique,
  drop constraint if exists profiles_pioneer_consistency_check;

-- 列削除
alter table public.profiles
  drop column if exists is_pioneer,
  drop column if exists pioneer_number,
  drop column if exists pioneer_joined_at,
  drop column if exists pioneer_status,
  drop column if exists pioneer_forfeited_reason;
