-- cards テーブルに want_* 系列 + bbox 系列を追加 (純 additive migration)
-- Supabase SQL Editor で手動実行してください
--
-- 経緯:
--   Step 3.5a で lib/types.ts:132-147 に Card interface 拡張を先取り済
--   (bbox_x/y/w/h, image_url_cropped, want_image_url, want_image_back_url,
--    want_characters[], want_item_types[], want_works[])。
--   TypeScript 側は optional として defensive に書かれており、DB 投入前でも
--   undefined のまま落ちない設計。本 migration で DB 側を後追いする。
--
-- 設計方針:
--   - want_characters / want_item_types / want_works は既存 characters /
--     item_types と同様 NOT NULL DEFAULT '{}' で揃え、SELECT/matcher 側で
--     null check を不要にする (既存行は空配列で初期化、明示 NULL は禁止)。
--   - bbox_x/y/w/h は numeric (精度未指定)。画像クロップ生成側
--     (expo-image-manipulator) と matcher 側で同じ単位を扱えば OK。
--   - image_url_cropped / want_image_url / want_image_back_url は text NULL 許容。
--     値は Supabase Storage の URL を想定。
--   - GIN index は want_characters / want_item_types / want_works の 3 列に付与
--     (matcher v3 で .overlaps 検索する想定。characters / item_types と同パターン)。
--   - bbox_* / image_url_cropped にはインデックス不要 (検索条件にはならない)。
--
-- 実行順序:
--   1. bbox 5 列追加 (NULL 許容)
--   2. want_* 5 列追加 (text 系は NULL 許容、text[] 系は NOT NULL DEFAULT '{}')
--   3. GIN index 3 件追加
--
-- 関連:
--   - lib/types.ts:132-147 (Card interface 3.5a 先取り)
--   - lib/matcher.ts:70 (want_characters[] を読む matcher v3、3.5b 後に発火)
--   - refactor_plan v1.11 章 3.9 (DB schema 拡張)
--   - handoff_ui12 §3 機能 B / F (求の構造化 + bbox spike)
--
-- 後続 (本 migration の scope 外):
--   - 3.5c: lib/supabase.ts:createCard に新列引数追加 + 出品 form 再設計
--   - 3.5c: get_trade_detail_by_offer RPC mirror の jsonb_build_object 拡張
--   - 3.5d: matcher v3 で want_characters / want_item_types / want_works を活用

-- ─────────────────────────────────────────
-- 1. bbox 5 列追加 (NULL 許容)
-- ─────────────────────────────────────────
alter table public.cards
  add column if not exists bbox_x            numeric,
  add column if not exists bbox_y            numeric,
  add column if not exists bbox_w            numeric,
  add column if not exists bbox_h            numeric,
  add column if not exists image_url_cropped text;

-- ─────────────────────────────────────────
-- 2. want_* 5 列追加
--    text 系: NULL 許容 (画像未設定を許す)
--    text[] 系: NOT NULL DEFAULT '{}' (空配列を default、null 禁止で defensive)
-- ─────────────────────────────────────────
alter table public.cards
  add column if not exists want_image_url      text,
  add column if not exists want_image_back_url text,
  add column if not exists want_characters     text[] not null default '{}',
  add column if not exists want_item_types     text[] not null default '{}',
  add column if not exists want_works          text[] not null default '{}';

-- ─────────────────────────────────────────
-- 3. GIN index 3 件追加 (.overlaps / @> / <@ / && 用)
--    matcher v3 で want_characters / want_item_types / want_works に対する
--    overlap 検索を高速化する。characters / item_types と同パターン。
-- ─────────────────────────────────────────
create index if not exists cards_want_characters_gin_idx
  on public.cards using gin (want_characters);

create index if not exists cards_want_item_types_gin_idx
  on public.cards using gin (want_item_types);

create index if not exists cards_want_works_gin_idx
  on public.cards using gin (want_works);
