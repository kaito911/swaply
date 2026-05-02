-- profiles テーブルに配送情報カラムを追加
-- Supabase SQL Editor で手動実行してください

alter table public.profiles
  add column if not exists shipping_name    text,
  add column if not exists postal_code     text,
  add column if not exists address_line1   text,
  add column if not exists address_line2   text;
