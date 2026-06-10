-- bookmarks → liked_cards へ table 名 + 関連オブジェクト rename
-- Supabase SQL Editor で手動実行してください
--
-- ─────────────────────────────────────────
-- 背景
-- ─────────────────────────────────────────
-- Phase A の初期 commit (97b9a3c) で「いいね」専用テーブルを `bookmarks` 名で作成。
-- その後、product 命名「いいね」と DB 名 `bookmarks` の不整合を解消するため
-- liked_cards に rename する判断 (2026-06、wanted_cards との対称性も意図)。
--
-- データ実体は既に Supabase に存在 (row_count = 0 だが table object はある) のため、
-- DROP + recreate ではなく ALTER で rename する。
--
-- ─────────────────────────────────────────
-- 命名整合
-- ─────────────────────────────────────────
--   DB:  liked_cards    (← wanted_cards と対称)
--   TS:  LikedCard      (← WantedCard と対称)
--   UI:  「いいね」      (product 名、不変)
--   route: /likes
--
-- 求リスト (wanted_cards) とは別概念で、責務は分離する:
--   - wanted_cards = 自分が交換で求める商品 (matcher / easyScore 入力)
--   - liked_cards  = 他人の出品 (cards) を「いいね」して保存したもの (純 UI 用途)
--
-- ─────────────────────────────────────────
-- 実行
-- ─────────────────────────────────────────

-- 1) table 本体の rename
ALTER TABLE public.bookmarks RENAME TO liked_cards;

-- 2) primary key index (Postgres は table 作成時に <table>_pkey 名で自動生成)
ALTER INDEX public.bookmarks_pkey RENAME TO liked_cards_pkey;

-- 3) 自前 index 2 件
ALTER INDEX public.bookmarks_user_id_created_at_idx
  RENAME TO liked_cards_user_id_created_at_idx;
ALTER INDEX public.bookmarks_card_id_idx
  RENAME TO liked_cards_card_id_idx;

-- 4) UNIQUE 制約 (制約名は INDEX 名と独立で持つ、明示 rename 必要)
ALTER TABLE public.liked_cards
  RENAME CONSTRAINT bookmarks_unique_per_user TO liked_cards_unique_per_user;

-- 5) RLS policy
ALTER POLICY "Users can manage their own bookmarks"
  ON public.liked_cards
  RENAME TO "Users can manage their own liked_cards";

-- ─────────────────────────────────────────
-- 確認 SQL
-- ─────────────────────────────────────────
--
-- (a) table 名確認 (期待: liked_cards 1 行、bookmarks は存在しない)
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('bookmarks', 'liked_cards');
--
-- (b) 列構成確認 (期待: id / user_id / card_id / created_at の 4 列、いずれも NOT NULL)
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'liked_cards'
-- ORDER BY ordinal_position;
--
-- (c) FK 参照先確認 (期待: user_id → profiles.id、card_id → cards.id)
-- SELECT kcu.column_name,
--        ccu.table_schema || '.' || ccu.table_name || '.' || ccu.column_name AS references
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage ccu
--   ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.table_schema = 'public'
--   AND tc.table_name = 'liked_cards'
--   AND tc.constraint_type = 'FOREIGN KEY';
--
-- (d) index 確認 (期待: 4 件、すべて liked_cards_ prefix)
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'liked_cards'
-- ORDER BY indexname;
--   bookmarks_pkey                       → liked_cards_pkey
--   bookmarks_unique_per_user            → liked_cards_unique_per_user
--   bookmarks_user_id_created_at_idx     → liked_cards_user_id_created_at_idx
--   bookmarks_card_id_idx                → liked_cards_card_id_idx
--
-- (e) RLS 確認 (期待: relrowsecurity = true)
-- SELECT relname, relrowsecurity
-- FROM pg_class WHERE relname = 'liked_cards';
--
-- (f) policy 確認 (期待: "Users can manage their own liked_cards" 1 件、cmd=ALL)
-- SELECT policyname, cmd
-- FROM pg_policies WHERE schemaname = 'public' AND tablename = 'liked_cards';
--
-- (g) 行数確認 (期待: 0)
-- SELECT COUNT(*) FROM public.liked_cards;
