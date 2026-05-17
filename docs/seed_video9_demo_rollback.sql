-- ─────────────────────────────────────────
-- 動画 #9 用 デモシードデータ ロールバック
-- ─────────────────────────────────────────
-- Supabase SQL Editor で手動実行してください
--
-- 削除対象:
--   - cards: description LIKE '[SEED_V9]%' (30 件想定)
--   - wanted_cards: 最新 auth.user 所有 + seed cards 名と一致 (7 件想定)
--
-- ⚠️ 重要な制約:
--   - profiles の seed 化 UPDATE は元データを保存していないため**復元不可**
--   - profiles の handle/display_name/trade_count 等の修正は手動で戻すか、
--     test user を再作成する必要あり
--   - 完全な原状回復が必要なら、seed 適用前に SELECT * FROM profiles を控えること

-- ─────────────────────────────────────────
-- Step 1: wanted_cards 削除
-- ─────────────────────────────────────────

DELETE FROM public.wanted_cards
WHERE user_id IN (
  SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1
)
AND card_name IN (
  'アクリルスタンド L サイズ (メンバー X)',
  '公式トレカ 限定版',
  'カフェ限定アクスタ S サイズ',
  'キャラ D アクリルスタンド',
  'TCG カード レア度 SR',
  'ぱしゃっつ 第 〇 弾 ランダム',
  'グループ E メンバー Y トレカ'
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
