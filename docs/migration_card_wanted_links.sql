-- card_wanted_links (出品と求リストの紐付け中間テーブル)
-- Supabase SQL Editor で手動実行してください
--
-- ─────────────────────────────────────────
-- 用途
-- ─────────────────────────────────────────
-- 出品 (cards) 作成時に、ユーザーの求リスト (wanted_cards) から「この出品で受け付ける求」を
-- 複数選択して紐付ける。出品詳細で他ユーザーが「この出品者がとくに求めているもの」を確認
-- できる。
--
-- 関連既存テーブル:
--   - cards          (出品、owner_user_id → profiles(id) ON DELETE CASCADE)
--   - wanted_cards   (求リスト、user_id → auth.users(id)、image_url 列 Phase B-1 で追加済)
--   - liked_cards    (いいね、card_id → cards(id))。本機能とは別概念、独立。
--
-- 設計方針:
--   - N:N 中間テーブル (1 出品に N 個の wanted_card 紐付け、1 wanted_card は M 出品に紐付け可)
--   - owner_user_id を denormalize 保持 (RLS で JOIN なしで auth.uid() 比較できる)
--   - FK 先は最新方針 (migration_fk_user_refs_to_profiles.sql) に合わせて profiles(id) を採用
--   - cascade: 出品削除 / 求商品削除 / ユーザー削除 (profiles 物理削除) で link も連鎖削除
--   - status による表示制御は wanted_cards.status を join 経由で見る (本テーブルに status 不要)
--
-- 非用途:
--   - matcher / easyScore / searchWantedCards / searchDirectMatch では使わない (Phase 1 範囲外)
--   - liked_cards (いいね) とは別概念、混在させない
--
-- ─────────────────────────────────────────
-- FK 先の根拠
-- ─────────────────────────────────────────
--   card_id        → cards(id):         出品削除で link 行も削除
--   wanted_card_id → wanted_cards(id):  求商品削除で link 行も削除
--   owner_user_id  → profiles(id):      最新 FK 方針 (migration_fk_user_refs_to_profiles)
--                                        と整合、退会時 (profiles 匿名化保持) で連鎖削除
--
--   ※ wanted_cards.user_id は依然 auth.users(id) (Phase 2 で別途整理予定、本 migration では
--     触らない)。owner_user_id を denormalize 保持しているため、本テーブル単独で auth.uid()
--     比較が可能、wanted_cards.user_id の FK 先に依存しない。
--
-- ─────────────────────────────────────────
-- RLS 方針
-- ─────────────────────────────────────────
--   1. card_wanted_links:
--      - INSERT/UPDATE/DELETE: 自分の出品の link のみ管理可 (auth.uid() = owner_user_id)
--      - SELECT: 誰でも読める (出品詳細で他ユーザーに見せるため)
--
--   2. wanted_cards に追加 SELECT policy:
--      - 既存「Users can manage their own wanted_cards」(FOR ALL) はそのまま維持 = 本人 private
--      - 新規「Anyone can read linked wanted_cards」(FOR SELECT) を追加
--        → card_wanted_links に紐付け済の wanted_cards だけ他人も読める
--      - RLS は SELECT policy が OR 評価のため、本人は引き続き全件読める / 他人は
--        紐付け済の row だけ読める、というセマンティクスを実現
--      - 求リスト全体は依然 private、紐付けで明示的に公開した row のみ部分公開
--
--   archived wanted_cards の扱い:
--     - RLS では status を考慮しない (active/archived 関係なく紐付き row は公開可)
--     - アプリ層で status='active' filter を行う (picker / 出品詳細表示)
--
-- ─────────────────────────────────────────
-- 既存テーブル / 既存機能への影響
-- ─────────────────────────────────────────
--   - cards テーブル: 無変更
--   - wanted_cards テーブル: SELECT policy が 1 件追加されるのみ、既存 row への影響なし
--   - matcher / easyScore / searchWantedCards / searchDirectMatch: 無影響
--                                                                 (本テーブルを読まない)
--   - listing/[id].tsx 既存 want chips 表示: 無影響 (cards.want_* fallback として残置)
--   - offer/create.tsx: 無影響
--   - home / venue / liked_cards / 検索: 無影響
--   - Phase B-0/B-1 で実装した /wants の追加モーダル: 無影響 (wanted_cards 単体操作のため)

-- ═══════════════════════════════════════════════════════════════════════
-- 実行
-- ═══════════════════════════════════════════════════════════════════════

-- 1) テーブル本体
CREATE TABLE public.card_wanted_links (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid        NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  wanted_card_id  uuid        NOT NULL REFERENCES public.wanted_cards(id) ON DELETE CASCADE,
  owner_user_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_wanted_links_unique UNIQUE (card_id, wanted_card_id)
);

-- 2) インデックス (3 件)
--    a. 出品詳細で「この出品の紐付き wanted_cards」取得 (最頻クエリ)
CREATE INDEX card_wanted_links_card_id_idx
  ON public.card_wanted_links (card_id);

--    b. 求リスト画面で「この求商品が紐付いてる出品数」表示 (Phase 2 想定)
CREATE INDEX card_wanted_links_wanted_card_id_idx
  ON public.card_wanted_links (wanted_card_id);

--    c. RLS で auth.uid() = owner_user_id 比較を高速化
CREATE INDEX card_wanted_links_owner_user_id_idx
  ON public.card_wanted_links (owner_user_id);

-- 3) RLS 有効化 + ポリシー
ALTER TABLE public.card_wanted_links ENABLE ROW LEVEL SECURITY;

--    a. 本人管理 (INSERT / UPDATE / DELETE / SELECT 全部)
CREATE POLICY "Users can manage their own card_wanted_links"
  ON public.card_wanted_links
  FOR ALL
  USING  (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

--    b. 誰でも SELECT 可 (出品詳細で他ユーザーが紐付き wanted_cards を読むため)
CREATE POLICY "Anyone can read card_wanted_links"
  ON public.card_wanted_links
  FOR SELECT
  USING (true);

-- 4) wanted_cards に SELECT policy を 1 件追加 (部分公開)
--    紐付け済の wanted_cards だけ他人も読める。求リスト全体は引き続き private。
--    既存「Users can manage their own wanted_cards」policy はそのまま維持 = OR 評価で
--    本人は全件読める / 他人は紐付き row だけ読める、というセマンティクス。
CREATE POLICY "Anyone can read linked wanted_cards"
  ON public.wanted_cards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.card_wanted_links cwl
      WHERE cwl.wanted_card_id = wanted_cards.id
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 実行前確認 SQL (オプション、現状把握用)
-- ═══════════════════════════════════════════════════════════════════════
--
-- (前 1) card_wanted_links テーブルが存在しないことを確認 (期待: 0 行)
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'card_wanted_links';
--
-- (前 2) wanted_cards の既存 policy 確認 (期待: 1 件「Users can manage their own wanted_cards」)
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'wanted_cards'
-- ORDER BY policyname;
--
-- (前 3) wanted_cards の現状 row 件数 (Phase A 後 snapshot 確認用)
-- SELECT status, COUNT(*) FROM public.wanted_cards GROUP BY status ORDER BY status;

-- ═══════════════════════════════════════════════════════════════════════
-- 実行後確認 SQL
-- ═══════════════════════════════════════════════════════════════════════
--
-- (a) テーブル作成確認 (期待: 1 行)
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'card_wanted_links';
--
-- (b) 列構成確認 (期待: id / card_id / wanted_card_id / owner_user_id / created_at の 5 列、
--                       いずれも NOT NULL)
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'card_wanted_links'
-- ORDER BY ordinal_position;
--
-- (c) FK 参照先確認 (期待: card_id → cards.id、wanted_card_id → wanted_cards.id、
--                          owner_user_id → profiles.id、すべて ON DELETE CASCADE)
-- SELECT
--   kcu.column_name,
--   ccu.table_schema || '.' || ccu.table_name || '.' || ccu.column_name AS references,
--   rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage ccu
--   ON ccu.constraint_name = tc.constraint_name
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- WHERE tc.table_schema = 'public'
--   AND tc.table_name = 'card_wanted_links'
--   AND tc.constraint_type = 'FOREIGN KEY';
--
-- (d) インデックス確認 (期待: 5 件 = PK + UNIQUE + 自前 3 件)
--     card_wanted_links_pkey
--     card_wanted_links_unique
--     card_wanted_links_card_id_idx
--     card_wanted_links_wanted_card_id_idx
--     card_wanted_links_owner_user_id_idx
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'card_wanted_links'
-- ORDER BY indexname;
--
-- (e) RLS 確認 (期待: relrowsecurity = true)
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'card_wanted_links';
--
-- (f) card_wanted_links policy 確認 (期待: 2 件)
--     "Users can manage their own card_wanted_links" / cmd=ALL
--     "Anyone can read card_wanted_links"             / cmd=SELECT
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'card_wanted_links'
-- ORDER BY policyname;
--
-- (g) wanted_cards policy 確認 (期待: 2 件、新規追加 + 既存維持)
--     "Anyone can read linked wanted_cards"           / cmd=SELECT  ← 新規追加
--     "Users can manage their own wanted_cards"       / cmd=ALL    ← 既存維持
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'wanted_cards'
-- ORDER BY policyname;
--
-- (h) 行数確認 (期待: 0)
-- SELECT COUNT(*) FROM public.card_wanted_links;
--
-- (i) wanted_cards 件数は無変化 (期待: Phase A 後 snapshot 維持)
-- SELECT status, COUNT(*) FROM public.wanted_cards GROUP BY status ORDER BY status;

-- ═══════════════════════════════════════════════════════════════════════
-- ロールバック (緊急時のみ)
-- ═══════════════════════════════════════════════════════════════════════
--
-- DROP POLICY "Anyone can read linked wanted_cards" ON public.wanted_cards;
-- DROP TABLE public.card_wanted_links;  -- CASCADE で policy/index も削除される
