-- migration_master_works_characters.sql の rollback
-- Supabase SQL Editor で手動実行してください
--
-- 注意: cards.work_id / character_id が論理参照しているため、
--       本 rollback 前に migration_extend_cards_to_items_rollback.sql を先に実行することを推奨。
--       (FK 制約はないので技術的には独立 drop 可能、データ整合性のみ要注意)

-- 順序: child テーブル → parent テーブル
drop table if exists public.user_keyword_history;
drop table if exists public.master_characters;
drop table if exists public.master_works;

-- 関連 trigger / index は drop table で自動削除される
