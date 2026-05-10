-- migration_pg_trgm.sql の rollback
-- Supabase SQL Editor で手動実行してください
--
-- 注意: pg_trgm に依存する GIN index が存在する間は drop extension が失敗します。
--       先に master_* テーブルおよび user_keyword_history を rollback してから本ファイルを実行してください。

drop extension if exists pg_trgm;
