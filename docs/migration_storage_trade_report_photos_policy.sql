-- ====================================================================
-- migration_storage_trade_report_photos_policy.sql
-- 作成日: 2026-07-04
-- 目的  : trade_reports 添付写真用 private バケットの RLS 設定。
--
--         申告者本人のみ upload / read / delete 可能。
--         被申告者・第三者からは完全遮断 (RLS で 0 行返す)。
--         運営は service_role で bypass。
--
-- 前提 (kaito が Dashboard で先に作成する必要あり):
--   - Storage セクションで新規バケット作成:
--     Name:              trade-report-photos
--     Public:            OFF (private、絶対に ON にしない)
--     File size limit:   5 MB (推奨)
--     Allowed MIME:      image/jpeg, image/png (推奨)
--
-- path 規約:
--   ${userId}/${uuid_or_ts}.${ext}
--   例: '1583f8d1-87ec-4ef8-bc43-59c61da24ca8/report_abc123.jpg'
--
-- 参考:
--   migration_storage_card_images_insert_policy_hardening.sql と同じ
--   「1st folder = 自分の user_id」で本人限定 policy を組む pattern。
--
-- ====================================================================

begin;

-- INSERT: 認証ユーザーが自分の folder にのみアップロード可
create policy "Users can upload own trade-report-photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'trade-report-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: 自分の写真のみ (private バケットのため public read なし)
--         被申告者・第三者からは 0 行返る
create policy "Users can read own trade-report-photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'trade-report-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: 自分の写真のみ
create policy "Users can delete own trade-report-photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'trade-report-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: policy 未作成 = 全否定 (写真の上書きは想定しない、削除 → 再アップで表現)

commit;

-- ====================================================================
-- 適用後確認クエリ
-- ====================================================================
--
-- ◆ バケット状態確認 (Dashboard で作成済のこと)
--   select id, name, public, file_size_limit, allowed_mime_types
--   from storage.buckets
--   where id = 'trade-report-photos';
--   → 期待: public = false
--
-- ◆ RLS policy (3 つ、UPDATE は無しであること)
--   select polname, cmd
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and polname like '%trade-report-photos%'
--   order by polname;
--   → 期待: 3 行 (INSERT / SELECT / DELETE)、UPDATE は無し
--
-- ◆ 被申告者・第三者からの露出遮断確認 (別ユーザーで実行)
--   select count(*) from storage.objects
--   where bucket_id = 'trade-report-photos';
--   → 期待: 0 (自分の folder しか SELECT できないため)
--
-- ◆ 他人 folder への上書き試行 (別ユーザーで実行)
--   from client: supabase.storage.from('trade-report-photos')
--                        .upload('other-user-id/foo.jpg', file)
--   → 期待: RLS 拒否エラー
--
-- ====================================================================
-- ロールバック (緊急時のみ)
-- ====================================================================
-- drop policy "Users can upload own trade-report-photos" on storage.objects;
-- drop policy "Users can read own trade-report-photos"   on storage.objects;
-- drop policy "Users can delete own trade-report-photos" on storage.objects;
