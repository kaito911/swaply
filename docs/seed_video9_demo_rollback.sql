-- ─────────────────────────────────────────
-- 動画 #9 用 デモシードデータ ロールバック (カード名非依存版、2026-05-23 更新)
-- ─────────────────────────────────────────
-- Supabase SQL Editor で手動実行してください
--
-- 削除対象 (カード名に依存しない識別マーカー):
--   - cards:        description LIKE '[SEED_V9]%'  → 旧 seed (placehold.co) + 新 seed (Storage URL) 両方ヒット
--   - wanted_cards: 所有者 (handle LIKE 'seed_demo_%') 基準で全削除 → 旧名 + 新名 両方ヒット
--   - offers:       seed cards を target にする提案 (FK 整合性確保)
--   - offer_items:  seed cards を含むアイテム (FK 整合性確保)
--   - trades:       seed offers に紐づく取引 (FK 整合性確保)
--   - profiles:     handle 'seed_demo_NNN' → 'user_NNN' に reset (元データ復元不可)
--
-- カード名非依存の根拠:
--   旧 seed (commit 3d6ddca/ba4dbb1) と新 seed (commit 2cc4cc9) で card_name が完全別物
--   旧名 (例「アクリルスタンド L サイズ (メンバー X)」) と新名 (例「アイドル A グループ メンバー X トレカ ステージ衣装 ver.」)
--   → card_name IN (...) で削除する旧 rollback では旧 wanted_cards 13 件が残存する問題があった
--   → 所有者 (seed_demo_ プロフィール) 基準に変更で旧・新どちらでも過不足なく削除可能
--
-- ⚠️ 重要な制約 (継続):
--   - profiles の seed 化 UPDATE は元データを保存していないため**復元不可**
--   - profiles の handle/display_name/trade_count 等の修正は手動で戻すか、test user を再作成
--   - 完全な原状回復が必要なら、seed 適用前に SELECT * FROM profiles を控えておくこと

-- ─────────────────────────────────────────
-- Step 1: wanted_cards 削除 (profile reset より先、所有者基準で全件)
-- ─────────────────────────────────────────
-- handle 'seed_demo_' プロフィール所有の wanted_cards を**全件**削除
-- (card_name に依存しない = 旧 seed 13 件 + 新 seed 13 件どちらも確実に削除)

DELETE FROM public.wanted_cards
WHERE user_id IN (
  SELECT id FROM public.profiles WHERE handle LIKE 'seed_demo_%'
);

-- ─────────────────────────────────────────
-- Step 2: trades 削除 (seed cards に紐づく取引、cards 削除前の FK 確保)
-- ─────────────────────────────────────────
-- seed cards (description タグで識別) を target_card_id 経由で参照する offer に紐づく trades
-- trades のスキーマは offer_id 参照を想定 (Supabase Dashboard 作成、ON DELETE 動作不明のため明示削除)
-- 該当 trades がなければ no-op、エラーなし

DELETE FROM public.trades
WHERE offer_id IN (
  SELECT id FROM public.offers
  WHERE target_card_id IN (
    SELECT id FROM public.cards WHERE description LIKE '[SEED_V9]%'
  )
);

-- ─────────────────────────────────────────
-- Step 3: offer_items 削除 (seed cards を含むアイテム、FK 整合性)
-- ─────────────────────────────────────────

DELETE FROM public.offer_items
WHERE card_id IN (
  SELECT id FROM public.cards WHERE description LIKE '[SEED_V9]%'
);

-- ─────────────────────────────────────────
-- Step 4: offers 削除 (seed cards を target にする提案)
-- ─────────────────────────────────────────

DELETE FROM public.offers
WHERE target_card_id IN (
  SELECT id FROM public.cards WHERE description LIKE '[SEED_V9]%'
);

-- ─────────────────────────────────────────
-- Step 5: cards 削除 (description タグで一括、旧 + 新両方ヒット)
-- ─────────────────────────────────────────

DELETE FROM public.cards
WHERE description LIKE '[SEED_V9]%';

-- ─────────────────────────────────────────
-- Step 6: profiles の seed 化フラグ部分リセット (オプション)
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
-- Step 7: 完了確認
-- ─────────────────────────────────────────

SELECT
  'seed_video9_demo rollback completed' AS status,
  (SELECT COUNT(*) FROM public.cards WHERE description LIKE '[SEED_V9]%') AS remaining_seed_cards,
  (SELECT COUNT(*) FROM public.profiles WHERE handle LIKE 'seed_demo_%') AS remaining_seed_profiles,
  (SELECT COUNT(*) FROM public.wanted_cards w
   INNER JOIN public.profiles p ON p.id = w.user_id
   WHERE p.handle LIKE 'user_%' OR p.handle LIKE 'seed_demo_%') AS wants_owned_by_seed_or_reset_profiles;

-- 期待値: remaining_seed_cards=0, remaining_seed_profiles=0
-- wants_owned_by_seed_or_reset_profiles=0 なら wanted_cards も完全クリーンアップ完了
