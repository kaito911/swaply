-- ====================================================================
-- migration_venue_supply_posts_add_image_url.sql
-- 作成日: 2026-06-13
-- 目的  : venue_supply_posts に image_url (text, nullable) 列を追加。
--         当日掲示板 / my-posts / accept_venue_hold RPC の wanted_snapshot で
--         表示する。
--
--         列名は cards.image_url / wanted_cards.image_url と同じ命名規約で揃え、
--         中身は Supabase Storage の publicUrl 文字列 (uploadCardImage 戻り値) を
--         そのまま格納する設計。将来 storage 構成変更があれば backfill で対応。
--
-- 関連:
--   - bucket: 既存 'card-images' を流用 (path 規約: {userId}/venue-supply/{ts}.{ext})
--   - upload helper: lib/supabase.ts uploadCardImage をそのまま流用
--   - 連動 RPC 更新: docs/migration_rpc_accept_venue_hold.sql で
--     wanted_snapshot.image_url を含めるよう CREATE OR REPLACE で更新 (Block B3)
--   - 関連方針: docs/venue_mode_requirements.md §5 / §9 (PR3 範囲)
-- ====================================================================
--
-- 適用前提:
--   - 既存 venue_supply_posts には画像列が無いこと (Block A1 で確認)
--   - cards.image_url / wanted_cards.image_url と同じ「publicUrl 格納」流儀を踏襲
--   - β1 は任意項目 (NULL 許容)、既存行のバックフィル不要
--
-- ====================================================================

begin;

alter table public.venue_supply_posts
  add column image_url text;

commit;

-- ====================================================================
-- 適用後確認 (Block C の C1 / C2 と同等、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ 列追加確認
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'venue_supply_posts'
--     and column_name = 'image_url';
--   → 期待: 1 行、data_type='text', is_nullable='YES'
--
-- ◆ 既存行の image_url 全件 NULL 確認 (バックフィルなしで足りること)
--   select count(*) as total, count(image_url) as with_image
--   from public.venue_supply_posts;
--   → 期待: total=任意、with_image=0
--
-- ====================================================================
-- ロールバック (緊急時、image_url の値は消失する)
-- ====================================================================
-- ※ image_url に値が入った後の rollback は画像参照消失あり。
--   Storage 上の実ファイルは残るが DB から参照不能になる。
--   コード実装前 / 実機検証前のみ即時可。
--
-- alter table public.venue_supply_posts drop column if exists image_url;
