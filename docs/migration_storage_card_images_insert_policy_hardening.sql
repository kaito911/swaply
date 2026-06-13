-- ====================================================================
-- migration_storage_card_images_insert_policy_hardening.sql
-- 作成日: 2026-06-13
-- 目的  : Supabase Storage 'card-images' バケットの INSERT policy を強化する。
--
--         Block A3 で発見した状態:
--           policy 名:   "Authenticated users can upload card images"
--           cmd:         INSERT
--           with_check:  (bucket_id = 'card-images'::text)  ← bucket チェックのみ
--
--         不足:
--           - auth.role() = 'authenticated' の明示なし
--           - (storage.foldername(name))[1] = auth.uid()::text の folder 制限なし
--           → 認証済 anyone が他人 folder にも書き込めてしまう構造
--
--         本 migration で ALTER POLICY して以下 3 条件を強制する:
--           (a) bucket_id = 'card-images'
--           (b) auth.role() = 'authenticated'
--           (c) (storage.foldername(name))[1] = auth.uid()::text
--
--         既存 uploadCardImage は `${userId}/${fileName}` 形式で保存しているため、
--         第 1 階層 folder は常に userId に一致 (cards / wants / venue-supply prefix
--         どの場合でも同じ)。本 hardening で既存 upload 経路は壊れない想定。
--
-- 関連:
--   - PR3 (venue 画像投稿) 範囲、upload 経路は uploadCardImage 流用
--   - 関連方針: docs/venue_mode_requirements.md §6 / §9 (storage RLS)
-- ====================================================================
--
-- 適用前提:
--   - card-images バケット存在 (Block A2 で確認済)
--   - 既存 INSERT policy "Authenticated users can upload card images" 存在 (Block A3 で確認済)
--   - 既存 upload 経路 (uploadCardImage in lib/supabase.ts) は `${userId}/...` を使用 (確認済)
--
-- ====================================================================

begin;

alter policy "Authenticated users can upload card images" on storage.objects
  with check (
    bucket_id = 'card-images'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

-- ====================================================================
-- 適用後確認 (Block C の C3 と同等、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ INSERT policy の with_check が 3 条件に強化されたか
--   select policyname, cmd, with_check
--   from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname = 'Authenticated users can upload card images';
--   → 期待: 1 行、with_check に
--     - "bucket_id = 'card-images'"
--     - "auth.role() = 'authenticated'"
--     - "(storage.foldername(name))[1] = (auth.uid())::text"
--     の 3 条件が AND で結合された式を含む
--
-- ◆ 既存 upload 経路 (cards / wants / venue-supply) が壊れていないこと
--   - 手動で実機 upload 試験 (本 migration 適用後の実機検証で確認)
--   - SQL レベルでの自動確認は実体 upload 経由でないと不可
--
-- ====================================================================
-- ロールバック (緊急時、緩い旧状態に戻す)
-- ====================================================================
-- ※ ロールバック後は認証済 anyone が他人 folder にも書き込み可能になるため
--    セキュリティ的に劣化する。本 migration 適用後に既存 upload が壊れる
--    重大バグ発覚時のみ実行を検討。
--
-- alter policy "Authenticated users can upload card images" on storage.objects
--   with check (bucket_id = 'card-images');
