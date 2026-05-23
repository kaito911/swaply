-- ─────────────────────────────────────────
-- 動画 #9 用 デモシードデータ ロールバック
-- ─────────────────────────────────────────
-- Supabase SQL Editor で手動実行してください
--
-- 削除対象:
--   - cards: description LIKE '[SEED_V9]%' (30 件想定)
--   - wanted_cards: seed_demo_ プロフィール所有 + seed cards 名と一致 (13 件想定)
--     - Part A: seed_idx=1 用 7 件 (Lane 1 表示用)
--     - Part B: seed_idx=2-5 用 6 件 (直接交換 demo 用)
--
-- ⚠️ 重要な制約:
--   - profiles の seed 化 UPDATE は元データを保存していないため**復元不可**
--   - profiles の handle/display_name/trade_count 等の修正は手動で戻すか、
--     test user を再作成する必要あり
--   - 完全な原状回復が必要なら、seed 適用前に SELECT * FROM profiles を控えること

-- ─────────────────────────────────────────
-- Step 1: wanted_cards 削除 (profile reset より先に実行)
--   - handle が 'seed_demo_%' のプロフィール所有 wanted_cards のうち
--   - seed card_name 一覧と一致するもの全件
-- ─────────────────────────────────────────

DELETE FROM public.wanted_cards
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE handle LIKE 'seed_demo_%'
)
AND card_name IN (
  -- Part A (録画ユーザー = seed_idx=1 用 7 件、Lane 1 表示用)
  'アイドル A グループ メンバー Y フォトカード ライブ限定',
  'アイドル B グループ メンバー P トレカ ステージ衣装 ver.',
  'ゴシック作品 F キャラ ι アクリルスタンド スペシャル ver.',
  'アイドル A グループ メンバー Z アクリルスタンド L',
  'アイドル B グループ メンバー Q アクリルスタンド L',
  'アイドル C グループ メンバー S フォトカード オフショット',
  'ファンタジー作品 D キャラ α アクリルスタンド L',
  -- Part B (直接交換 demo 用、seed_idx=2-5 用 6 件、card_name 重複考慮)
  'アイドル A グループ メンバー X トレカ ステージ衣装 ver.',
  'アイドル B グループ メンバー Q トレカ 限定版',
  'アイドル C グループ メンバー S トレカ プライベートカット',
  'ファンタジー作品 D キャラ α ブロマイド BOX 特典',
  '和風作品 E キャラ ζ フォトカード'
);

-- ─────────────────────────────────────────
-- Step 2: cards 削除
-- ─────────────────────────────────────────

DELETE FROM public.cards
WHERE description LIKE '[SEED_V9]%';

-- ─────────────────────────────────────────
-- Step 3: profiles の seed 化フラグ部分リセット (オプション)
-- ─────────────────────────────────────────
-- profiles の handle が seed_demo_NNN になっているユーザーを通常 handle に戻す
-- (元データは復元不可なので、サフィックスで識別可能な状態にとどめる)

UPDATE public.profiles
SET
  handle = REPLACE(handle, 'seed_demo_', 'user_'),
  display_name = REPLACE(display_name, '推し活デモ ', 'ユーザー '),
  updated_at = NOW()
WHERE handle LIKE 'seed_demo_%';

-- ─────────────────────────────────────────
-- Step 4: 完了確認
-- ─────────────────────────────────────────

SELECT
  'seed_video9_demo rollback completed' AS status,
  (SELECT COUNT(*) FROM public.cards WHERE description LIKE '[SEED_V9]%') AS remaining_seed_cards,
  (SELECT COUNT(*) FROM public.profiles WHERE handle LIKE 'seed_demo_%') AS remaining_seed_profiles;
