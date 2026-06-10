-- bookmarks (他人の出品を保存するブックマーク)
-- Supabase SQL Editor で手動実行してください
--
-- ─────────────────────────────────────────
-- 用途
-- ─────────────────────────────────────────
--   - ♡ ボタン (home.tsx / listing/[id].tsx) で他人の listing を保存
--   - app/bookmarks.tsx で一覧表示
--   - HeaderActions の ♡ アイコンから到達 (/bookmarks)
--
-- ─────────────────────────────────────────
-- 非用途 (重要)
-- ─────────────────────────────────────────
-- 求リスト (wanted_cards) とは別概念。両者を統合しないこと。
--   - matcher / easyScore の入力にしない
--   - searchWantedCards / searchDirectMatch の対象にしない
--   - card_wanted_links (Phase B で新設) の対象にもしない
-- 上記は全て wanted_cards 専用、bookmarks は純 UI 用途 (保存/参照) のみ。
--
-- ─────────────────────────────────────────
-- FK 方針
-- ─────────────────────────────────────────
--   - user_id は public.profiles(id) を参照 (auth.users 直参照は避ける)
--     2026-06 commit 6cb9dc9 のアカウント削除/tombstone 方針に整合
--   - card_id は public.cards(id) を参照
--   - いずれも ON DELETE CASCADE
--     (退会時 / 出品取消時に bookmark も自動削除、個人用データなので妥当)
--
-- ─────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────
--   - private SELECT: 自分のブックマークのみ閲覧可
--   - INSERT / DELETE: 自分のみ
--   - 「N 人が保存」集計は今は不要
--     将来必要なら SECURITY DEFINER の RPC で別途実装 (Phase 3+)

CREATE TABLE public.bookmarks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id    uuid        NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookmarks_unique_per_user UNIQUE (user_id, card_id)
);

-- 自分のブックマーク一覧 (created_at DESC) 高速化
CREATE INDEX bookmarks_user_id_created_at_idx
  ON public.bookmarks (user_id, created_at DESC);

-- 将来「N 人が保存」集計用 (今は未使用、Phase 3+ で検討)
CREATE INDEX bookmarks_card_id_idx
  ON public.bookmarks (card_id);

-- RLS 有効化 + private SELECT policy
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own bookmarks"
  ON public.bookmarks
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
