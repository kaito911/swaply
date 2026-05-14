-- live DB の master 系 seed 状況を確認する読み取り専用クエリ。
-- Supabase SQL Editor で実行してください。
--
-- 期待結果 (Step 2 完了時点):
--   master_works:        3 行 (kimetsu / conan / sanrio)
--   master_characters:  73 行 (鬼滅 35 + コナン 25 + サンリオ 13)
--   master_item_types:  24 行
--
-- もし 0 行のテーブルがある場合、検索でキャラがヒットしない原因はこれです。
-- 該当 migration を Supabase SQL Editor で実行してください:
--   docs/migration_master_works_characters.sql  (schema)
--   docs/migration_master_characters_seed.sql   (73 行 seed)
--   docs/migration_master_item_types.sql        (schema)
--   docs/migration_master_item_types_seed.sql   (24 行 seed)

select 'master_works' as table_name, count(*) as row_count from public.master_works
union all
select 'master_characters', count(*) from public.master_characters
union all
select 'master_item_types', count(*) from public.master_item_types
order by table_name;

-- 鬼滅キャラが入っているか個別確認 (期待: 35 件)
select count(*) as kimetsu_chars from public.master_characters where work_id = 'kimetsu';

-- 炭治郎が引けるか直接確認 (期待: 1 行)
select id, display_name_ja, aliases from public.master_characters where id = 'kimetsu_tanjiro';
