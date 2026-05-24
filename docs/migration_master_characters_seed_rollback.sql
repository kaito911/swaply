-- migration_master_characters_seed.sql の rollback
-- Supabase SQL Editor で手動実行してください
--
-- 採用方針: ユーザー指定通り work_id IN (...) で範囲削除
-- 注意: この方法は **kimetsu/conan/sanrio に紐づく全 master_characters を削除** します。
--       本 seed 適用後に追加された他のキャラ (運営が user_keyword_history から拡張した分など)
--       も全て削除されるため、部分ロールバックには適しません。
--       特定 ID のみ削除したい場合は別途 DELETE WHERE id IN (...) 形式で実行してください。

delete from public.master_characters
where work_id in ('kimetsu', 'conan', 'sanrio');
