-- pg_trgm extension で表記ゆれ吸収検索を有効化
-- Supabase SQL Editor で手動実行してください
--
-- 目的:
--   master_works / master_characters / master_item_types / user_keyword_history
--   に対する similarity() 検索 (大文字小文字・ローマ字/カタカナ/漢字の表記ゆれ吸収)
--   を可能にする extension。
--   GIN index は各テーブル作成 migration 内で個別に作成する。
--
-- 注意: 適用前に Supabase Dashboard の Database > Extensions で
--       pg_trgm 未有効を確認してください (有効化済の場合は冪等にスキップされます)。

create extension if not exists pg_trgm;
