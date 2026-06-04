-- migration_reports_reporter_nullable.sql
-- reports.reporter_id を nullable 化 (Phase 0 PR-D アカウント削除対応)
--
-- ⚠️ 適用順序の注意:
--   本 migration は PR-B の `docs/migration_reports.sql` が **先に適用済** であることを前提とする。
--   PR-B 未適用の場合、reports テーブル自体が存在せず本 ALTER は失敗する。
--
-- Supabase SQL Editor で kaito が手動実行してください。
-- Dashboard 未適用、docs 保存のみ。
--
-- 経緯:
--   PR-D アカウント削除で、削除ユーザーが reporter として作成した通報を
--   匿名化保持する必要がある (運営対応のため通報内容自体は残す)。
--   現状の reports.reporter_id NOT NULL では reporter 匿名化 (NULL 化) が
--   できないため、nullable 化する。
--
-- 設計方針:
--   - reporter_id を nullable に変更 (NOT NULL を drop)
--   - RLS policy は変更しない:
--     - 既存: "Users can read their own reports" → using (auth.uid() = reporter_id)
--     - reporter_id IS NULL の行は auth.uid() = NULL とは一致せず、本人にも見えなくなる
--     - 運営は service_role 経由で RLS をバイパスして確認 (β1 では DB 直接)
--   - 既存 INSERT ポリシーは with check (auth.uid() = reporter_id) のため、
--     新規通報は引き続き reporter_id を要求 (匿名通報を許可するわけではない)

alter table public.reports
  alter column reporter_id drop not null;

-- 確認クエリ:
-- select column_name, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'reports' and column_name = 'reporter_id';
-- 期待: reporter_id | YES
