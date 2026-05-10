-- cards テーブルに image_back_url 列を追加
-- Supabase SQL Editor で手動実行してください
--
-- 経緯:
--   Step 3 commit 6 (57f69e9) の confirm.tsx toInsertRow v2 実装で image_back_url を
--   INSERT 対象にしたが、cards テーブルに image_back_url 列が未追加 (Phase 1 検証で
--   DB schema 完全 dump をしていなかった見落とし)。
--   実機テストで「Could not find the 'image_back_url' column of 'cards' in the schema
--   cache」エラーが発生したため、列追加。
--
-- 設計方針:
--   - β 前テストデータ (63 件) のため data migration 不要 (NULL 初期化で十分)
--   - 表面 (image_url) と同じ TEXT 型、NULL 許可
--   - lib/types.ts:74 で既に `image_back_url: string | null` と定義済 (コード側は対応済)
--
-- 関連: Card interface (lib/types.ts), confirm.tsx toInsertRow v2 (Step 3 commit 6)

alter table public.cards
  add column image_back_url text;
