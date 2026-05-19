-- ─────────────────────────────────────────
-- 動画 #9 用 デモシードデータ (5/23 SEVENTEEN ライブ前日関連、Pioneer 募集動線)
-- ─────────────────────────────────────────
-- Supabase SQL Editor で手動実行してください
--
-- 著作権セーフ:
--   - 実在キャラ / グループ / IP 名は使用しない (汎用名のみ)
--   - 画像は placehold.co (商用利用可、汎用プレースホルダー)
--   - 詳細: docs/policies/pioneer_policy_v1.md および
--     memory/project_copyright_research_2026-05-09.md 参照
--
-- 識別マーカー (rollback で使用):
--   - cards.description が '[SEED_V9]' プレフィックス
--   - profiles.handle が 'seed_demo_' プレフィックス
--   - wanted_cards は seed card 名と一致 + seed_idx=1 ユーザー所有
--
-- 投入対象:
--   - profiles UPSERT 10 名 (seed_demo_001 〜 010)
--   - cards INSERT 30 件 (K-POP/サンリオ/あんスタ/鬼滅/コナン/TREASURE 風汎用 6 ジャンル混在)
--   - wanted_cards INSERT 7 件 (seed_idx=1 = 録画用想定ユーザー)
--
-- 前提:
--   1. dev 環境の auth.users に最低 5 名のアカウントが存在
--      確認: SELECT count(*) FROM auth.users;
--   2. 不足してる場合は Supabase Auth Dashboard or signup フローで追加作成

-- ─────────────────────────────────────────
-- Step 1: 既存 auth.users から最新 10 名を seed 対象として確保
-- ─────────────────────────────────────────

DROP TABLE IF EXISTS _seed_v9_users;
CREATE TEMP TABLE _seed_v9_users AS
SELECT
  id,
  ROW_NUMBER() OVER (ORDER BY created_at DESC) AS seed_idx
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- ユーザー数が 5 未満の場合はエラー停止
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM _seed_v9_users) < 5 THEN
    RAISE EXCEPTION 'auth.users が 5 名未満です (現在: %)。最低 5 名作成してから再実行してください。',
      (SELECT COUNT(*) FROM auth.users);
  END IF;
END $$;

-- ─────────────────────────────────────────
-- Step 2: profiles を seed_demo_NNN 風データで UPSERT
--   ※ 既存テスト profile を上書きします。元データは rollback で復元できないため
--     必要なら事前に SELECT * FROM profiles で控えておいてください
-- ─────────────────────────────────────────

UPDATE public.profiles p
SET
  handle = 'seed_demo_' || lpad(d.seed_idx::text, 3, '0'),
  display_name = '推し活デモ ' || lpad(d.seed_idx::text, 3, '0'),
  trade_count = CASE d.seed_idx
    WHEN 1 THEN 5
    WHEN 2 THEN 7
    WHEN 3 THEN 12
    WHEN 4 THEN 15
    WHEN 5 THEN 20
    WHEN 6 THEN 25
    WHEN 7 THEN 30
    WHEN 8 THEN 35
    WHEN 9 THEN 40
    WHEN 10 THEN 50
    ELSE 5
  END,
  ship_rate = CASE WHEN d.seed_idx <= 3 THEN 95 ELSE 98 END,
  reply_median_hours = CASE WHEN d.seed_idx <= 5 THEN 12 ELSE 6 END,
  trouble_count = 0,
  adjustment_avg = 200 + (d.seed_idx * 50),
  last_active_at = NOW() - (((d.seed_idx % 3) || ' hours')::interval),
  updated_at = NOW()
FROM _seed_v9_users d
WHERE p.id = d.id;

-- profile レコードが存在しないユーザー用の INSERT (auto-create trigger 不在の場合の補完)
INSERT INTO public.profiles (
  id, handle, display_name, mode, trade_count, ship_rate, reply_median_hours,
  trouble_count, adjustment_avg, last_active_at, created_at, updated_at
)
SELECT
  d.id,
  'seed_demo_' || lpad(d.seed_idx::text, 3, '0'),
  '推し活デモ ' || lpad(d.seed_idx::text, 3, '0'),
  'trading_card',
  CASE d.seed_idx WHEN 1 THEN 5 WHEN 2 THEN 7 WHEN 3 THEN 12 WHEN 4 THEN 15
       WHEN 5 THEN 20 WHEN 6 THEN 25 WHEN 7 THEN 30 WHEN 8 THEN 35
       WHEN 9 THEN 40 WHEN 10 THEN 50 ELSE 5 END,
  CASE WHEN d.seed_idx <= 3 THEN 95 ELSE 98 END,
  CASE WHEN d.seed_idx <= 5 THEN 12 ELSE 6 END,
  0,
  200 + (d.seed_idx * 50),
  NOW() - (((d.seed_idx % 3) || ' hours')::interval),
  NOW(),
  NOW()
FROM _seed_v9_users d
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = d.id);

-- ─────────────────────────────────────────
-- Step 3: cards 30 件 INSERT (6 ジャンル × 5 件、汎用名のみ)
-- ─────────────────────────────────────────

-- ★ owner 割当の動的 modulo: _seed_v9_users の実件数で循環させる
--   (auth.users が 5 名なら seed_idx 1-5 で循環、10 名なら 1-10 で循環)
INSERT INTO public.cards (
  owner_user_id, name, group_name, member_name, series, image_url,
  description, want_description, status, condition,
  allows_mail, allows_handoff, allows_adjustment, adjustment_max,
  category, characters, item_types,
  created_at, updated_at
)
SELECT
  (SELECT id FROM _seed_v9_users WHERE seed_idx = ((v.row_id - 1) % (SELECT COUNT(*)::int FROM _seed_v9_users)) + 1),
  v.name, v.group_name, v.member_name, v.series,
  v.image_url,
  '[SEED_V9] ' || v.descr, v.want, 'active', v.cond,
  v.mail, v.handoff, v.adj,
  CASE WHEN v.adj THEN 500 ELSE NULL END,
  v.cat,
  ARRAY[]::text[], ARRAY[]::text[],
  NOW() - (v.hours_ago || ' hours')::interval,
  NOW() - (v.hours_ago || ' hours')::interval
FROM (VALUES
  -- K-POP 風 (5 件)
  (1,  'アイドルカード セット A 第 5 弾',     'グループ A', 'メンバー X', 'Tour 2026',
       'https://placehold.co/400x560/EC4899/FFFFFF?text=Card+001',
       'メンバー X、状態良好。即発送可。',     'メンバー Y のカードと交換希望',
       'mint',     true,  false, true,  2,  'idol'),
  (2,  'アクリルスタンド L サイズ (メンバー X)','グループ A', 'メンバー X', '誕生日記念',
       'https://placehold.co/400x560/3B82F6/FFFFFF?text=Card+002',
       '新品未開封、外箱に軽微な傷あり',      'メンバー Z 関連グッズ希望',
       'near_mint',true,  true,  false, 5,  'idol'),
  (3,  '公式トレカ 限定版',                  'グループ B', NULL,         '2026 Spring',
       'https://placehold.co/400x560/8B5CF6/FFFFFF?text=Card+003',
       'ホロ加工版、状態 A',                  '同シリーズの別キャラ希望',
       'mint',     true,  false, true,  10, 'idol'),
  (4,  'ペンライト交換用 グリップ',           'グループ B', 'メンバー W', NULL,
       'https://placehold.co/400x560/10B981/FFFFFF?text=Card+004',
       '未使用、開封のみ',                    'グリップカラー違いと交換希望',
       'mint',     true,  true,  false, 24, 'idol'),
  (5,  'コンサート限定 缶バッジ',             'グループ A', NULL,         '会場限定',
       'https://placehold.co/400x560/F59E0B/FFFFFF?text=Card+005',
       '会場で購入、未開封',                  'メンバー X 推し活グッズ全般',
       'mint',     false, true,  true,  48, 'idol'),

  -- サンリオ風 (5 件)
  (6,  'キャラクター B マスコットぬいぐるみ',  NULL, NULL, 'コラボカフェ限定',
       'https://placehold.co/400x560/F472B6/FFFFFF?text=Card+006',
       'タグ付き、シミなし',                  'キャラ C のぬいぐるみ希望',
       'mint',     true,  true,  true,  6,  'character'),
  (7,  'カフェ限定アクスタ S サイズ',         NULL, NULL, '2026 春',
       'https://placehold.co/400x560/EC4899/FFFFFF?text=Card+007',
       'カフェ来店特典、未開封',              '同シリーズの別キャラ',
       'mint',     true,  false, false, 12, 'character'),
  (8,  'コラボ缶バッジ コンプリート 5 種',     NULL, NULL, 'コラボ第 2 弾',
       'https://placehold.co/400x560/0EA5E9/FFFFFF?text=Card+008',
       '全 5 種コンプリート、ランダム購入分',  'キャラ D の単体グッズ',
       'mint',     true,  true,  true,  18, 'character'),
  (9,  '年パス特典 ステッカーセット',          NULL, NULL, NULL,
       'https://placehold.co/400x560/A78BFA/FFFFFF?text=Card+009',
       '年パス会員限定、状態良好',            '同年パス特典シリーズ',
       'near_mint',true,  false, false, 36, 'character'),
  (10, 'キャラ E ハンドタオル ミニサイズ',     NULL, NULL, 'ポップアップ限定',
       'https://placehold.co/400x560/EF4444/FFFFFF?text=Card+010',
       '未使用、タグ付き',                    'タオルセット組み合わせ希望',
       'mint',     true,  true,  true,  60, 'character'),

  -- あんスタ風 (5 件)
  (11, 'ぱしゃっつ 第 〇 弾 ランダム',         NULL, 'メンバー V', '第 12 弾',
       'https://placehold.co/400x560/6366F1/FFFFFF?text=Card+011',
       'メンバー V、ランダム購入で当選',      'メンバー U のぱしゃっつ',
       'mint',     true,  true,  true,  4,  'anime'),
  (12, 'キャラ C 缶バッジ 50mm',              NULL, NULL,         NULL,
       'https://placehold.co/400x560/F59E0B/FFFFFF?text=Card+012',
       '50mm サイズ、状態良好',                'キャラ C 別シリーズと交換',
       'near_mint',true,  false, true,  8,  'anime'),
  (13, '10 周年限定ノベルティ',                NULL, NULL,         '10 周年記念',
       'https://placehold.co/400x560/8B5CF6/FFFFFF?text=Card+013',
       'イベント特典、未開封',                'メンバー W 関連ノベルティ',
       'mint',     true,  false, false, 14, 'anime'),
  (14, 'BOX 特典 ブロマイド',                  NULL, 'メンバー V', '第 5 弾',
       'https://placehold.co/400x560/10B981/FFFFFF?text=Card+014',
       'BOX 購入特典、防湿剤付き',            '別 BOX 特典と交換希望',
       'mint',     true,  true,  true,  22, 'anime'),
  (15, 'コラボ アクリルキーホルダー',          NULL, NULL,         'コラボ第 3 弾',
       'https://placehold.co/400x560/EC4899/FFFFFF?text=Card+015',
       'ランダム購入で当選、未開封',          'コンプリート目指してます',
       'mint',     true,  true,  true,  30, 'anime'),

  -- 鬼滅・コナン 風 (5 件)
  (16, 'キャラ D アクリルスタンド',           NULL, NULL,         NULL,
       'https://placehold.co/400x560/0EA5E9/FFFFFF?text=Card+016',
       'L サイズ、未開封',                    '同キャラの缶バッジ',
       'mint',     true,  true,  false, 3,  'anime'),
  (17, '誕生祭限定グッズ 缶バッジ',            NULL, NULL,         '誕生祭 2026',
       'https://placehold.co/400x560/F472B6/FFFFFF?text=Card+017',
       '誕生祭限定、未開封',                  '同誕生祭グッズ全般',
       'mint',     true,  false, true,  9,  'anime'),
  (18, 'くじ景品 ぬいぐるみ',                 NULL, NULL,         'コラボくじ',
       'https://placehold.co/400x560/A78BFA/FFFFFF?text=Card+018',
       'B 賞、タグ付き未開封',                'A 賞ぬいぐるみと交換希望',
       'mint',     true,  true,  true,  16, 'anime'),
  (19, 'TCG カード レア度 SR',                NULL, NULL,         '第 8 弾',
       'https://placehold.co/400x560/EF4444/FFFFFF?text=Card+019',
       'SR 確定、スリーブ保管',               'SSR と交換相談',
       'mint',     true,  false, true,  28, 'anime'),
  (20, 'コラボ クッション ミニサイズ',         NULL, NULL,         'カフェ限定',
       'https://placehold.co/400x560/F59E0B/FFFFFF?text=Card+020',
       'カフェ予約特典、新品',                '別キャラのクッション',
       'near_mint',true,  true,  false, 42, 'anime'),

  -- TREASURE 風 (5 件)
  (21, 'グループ E メンバー Y トレカ',         'グループ E', 'メンバー Y', 'JAPAN TOUR',
       'https://placehold.co/400x560/3B82F6/FFFFFF?text=Card+021',
       'メンバー Y 直筆風加工、状態 A',       'メンバー Y or Z のグッズ全般',
       'mint',     true,  true,  true,  1,  'idol'),
  (22, '会場限定 フォトカード',                'グループ E', NULL,         '東京公演',
       'https://placehold.co/400x560/8B5CF6/FFFFFF?text=Card+022',
       '会場購入分、未開封',                  '別会場フォトカードと交換',
       'mint',     false, true,  true,  7,  'idol'),
  (23, 'グループ E ペンライト用 リフィル',     'グループ E', NULL,         NULL,
       'https://placehold.co/400x560/EC4899/FFFFFF?text=Card+023',
       '未開封、複数所有',                    'リフィル別色',
       'mint',     true,  true,  false, 13, 'idol'),
  (24, 'グループ E メンバー Z トレカ',         'グループ E', 'メンバー Z', '2026 春',
       'https://placehold.co/400x560/10B981/FFFFFF?text=Card+024',
       'メンバー Z、状態良好',                'メンバー Y のトレカと交換希望',
       'near_mint',true,  false, true,  19, 'idol'),
  (25, '会場限定 アクスタ S',                 'グループ E', 'メンバー Y', '会場限定',
       'https://placehold.co/400x560/F59E0B/FFFFFF?text=Card+025',
       '会場で購入、新品未開封',              'メンバー Z のアクスタ',
       'mint',     true,  true,  true,  31, 'idol'),

  -- その他 (うたプリ・A3! 風、5 件)
  (26, 'キャラ F マグネット シート',           NULL, 'メンバー V', NULL,
       'https://placehold.co/400x560/A78BFA/FFFFFF?text=Card+026',
       '冷蔵庫貼り用、未開封',                'キャラ F のステッカー希望',
       'mint',     true,  true,  false, 11, 'anime'),
  (27, 'グループ F 推し活セット',              'グループ F', NULL,         'コンプ第 1 弾',
       'https://placehold.co/400x560/0EA5E9/FFFFFF?text=Card+027',
       '5 種コンプ、未開封',                  'グループ F メンバー単体グッズ',
       'mint',     true,  true,  true,  20, 'anime'),
  (28, 'メンバー Z ステッカー 5 枚組',         'グループ E', 'メンバー Z', 'コンプ',
       'https://placehold.co/400x560/EF4444/FFFFFF?text=Card+028',
       '全 5 種コンプリート、未開封',         'メンバー Z 関連グッズ',
       'mint',     true,  false, true,  26, 'idol'),
  (29, 'キャラ G タオル ハンディ',             NULL, NULL,         'コラボ',
       'https://placehold.co/400x560/F472B6/FFFFFF?text=Card+029',
       '未使用、タグ付き',                    'キャラ G の缶バッジ',
       'mint',     true,  true,  true,  38, 'anime'),
  (30, 'コラボ アクキー L',                    NULL, NULL,         'コラボ第 4 弾',
       'https://placehold.co/400x560/6366F1/FFFFFF?text=Card+030',
       'L サイズ、未開封、保護フィルム付',     '同コラボの缶バッジ',
       'near_mint',true,  true,  false, 50, 'anime')
) AS v(
  row_id, name, group_name, member_name, series, image_url,
  descr, want, cond, mail, handoff, adj, hours_ago, cat
);

-- ─────────────────────────────────────────
-- Step 4: wanted_cards 投入
--   - Part A (7 件): 録画ユーザー (seed_idx=1) 用、Lane 1「いいねした交換」表示
--   - Part B (6 件): seed_idx=2-5 に分散、直接交換マッチング demo 用
--   - 全 13 件、isWantMatchV2 fuzzy match で hit する card_name を使用
-- ─────────────────────────────────────────

-- Part A: seed_idx=1 所有の 7 件 (Lane 1 表示用、card 30 件の中から fuzzy match)
INSERT INTO public.wanted_cards (
  user_id, card_name, group_name, member_name, series, status, created_at, updated_at
)
SELECT
  (SELECT id FROM _seed_v9_users WHERE seed_idx = 1),
  v.card_name, v.group_name, v.member_name, v.series,
  'active', NOW(), NOW()
FROM (VALUES
  ('アクリルスタンド L サイズ (メンバー X)',   'グループ A', 'メンバー X', '誕生日記念'),
  ('公式トレカ 限定版',                       'グループ B', NULL,         '2026 Spring'),
  ('カフェ限定アクスタ S サイズ',              NULL,         NULL,         '2026 春'),
  ('キャラ D アクリルスタンド',                NULL,         NULL,         NULL),
  ('TCG カード レア度 SR',                    NULL,         NULL,         '第 8 弾'),
  ('ぱしゃっつ 第 〇 弾 ランダム',             NULL,         'メンバー V', '第 12 弾'),
  ('グループ E メンバー Y トレカ',             'グループ E', 'メンバー Y', 'JAPAN TOUR')
) AS v(card_name, group_name, member_name, series)
ON CONFLICT (user_id, card_name, group_name, member_name, series) DO NOTHING;

-- Part B: seed_idx=2-5 に分散 (直接交換マッチング demo 用)
--   - seed_idx=1 が所有する card と一致する card_name を seed_idx=2-5 が「欲しい」と登録
--   - これで「seed_idx=1 が seed_idx=2 と直接交換できる相手」として表示される
--   - 録画ユーザー (seed_idx=1) の譲 = seed_idx=1 所有 card、求 = seed_idx=2-5 所有 card
INSERT INTO public.wanted_cards (
  user_id, card_name, group_name, member_name, series, status, created_at, updated_at
)
SELECT
  (SELECT id FROM _seed_v9_users WHERE seed_idx = v.owner_idx),
  v.card_name, v.group_name, v.member_name, v.series,
  'active', NOW(), NOW()
FROM (VALUES
  -- seed_idx=2 が「アイドルカード」「ぱしゃっつ」を欲しい
  (2, 'アイドルカード セット A 第 5 弾',     'グループ A', 'メンバー X', 'Tour 2026'),
  (2, 'ぱしゃっつ 第 〇 弾 ランダム',         NULL,         'メンバー V', '第 12 弾'),
  -- seed_idx=3 が「キャラ D アクリルスタンド」を欲しい
  (3, 'キャラ D アクリルスタンド',           NULL,         NULL,         NULL),
  -- seed_idx=4 が「グループ E メンバー Y トレカ」を欲しい
  (4, 'グループ E メンバー Y トレカ',         'グループ E', 'メンバー Y', 'JAPAN TOUR'),
  -- seed_idx=5 が「キャラ F マグネット」「アイドルカード」を欲しい
  (5, 'キャラ F マグネット シート',           NULL,         'メンバー V', NULL),
  (5, 'アイドルカード セット A 第 5 弾',     'グループ A', 'メンバー X', 'Tour 2026')
) AS v(owner_idx, card_name, group_name, member_name, series)
WHERE EXISTS (SELECT 1 FROM _seed_v9_users WHERE seed_idx = v.owner_idx)  -- 5 名未満でも安全
ON CONFLICT (user_id, card_name, group_name, member_name, series) DO NOTHING;

-- ─────────────────────────────────────────
-- Step 5: 完了確認
-- ─────────────────────────────────────────

SELECT
  'seed_video9_demo completed' AS status,
  (SELECT COUNT(*) FROM _seed_v9_users) AS seed_users_count,
  (SELECT COUNT(*) FROM public.cards WHERE description LIKE '[SEED_V9]%') AS seed_cards_count,
  (SELECT COUNT(*) FROM public.profiles WHERE handle LIKE 'seed_demo_%') AS seed_profiles_count,
  (SELECT COUNT(*) FROM public.wanted_cards
   WHERE user_id IN (SELECT id FROM _seed_v9_users)
   AND card_name IN (
     'アクリルスタンド L サイズ (メンバー X)', '公式トレカ 限定版',
     'カフェ限定アクスタ S サイズ', 'キャラ D アクリルスタンド',
     'TCG カード レア度 SR', 'ぱしゃっつ 第 〇 弾 ランダム',
     'グループ E メンバー Y トレカ',
     'アイドルカード セット A 第 5 弾', 'キャラ F マグネット シート'
   )) AS seed_wants_count;

DROP TABLE _seed_v9_users;
