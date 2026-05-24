-- ─────────────────────────────────────────
-- 動画 #9 用 デモシードデータ (5/23 SEVENTEEN ライブ前日関連、Pioneer 募集動線)
-- ─────────────────────────────────────────
-- Supabase SQL Editor で手動実行してください
--
-- 著作権セーフ:
--   - 実在キャラ / グループ / IP 名は使用しない (汎用名のみ)
--   - 画像は AI 生成 (Supabase Storage seed-card-images バケット public 配信)
--   - 詳細: docs/policies/pioneer_policy_v1.md および
--     memory/project_copyright_research_2026-05-09.md 参照
--
-- 識別マーカー (rollback で使用):
--   - cards.description が '[SEED_V9]' プレフィックス (必須、新汎用文言も先頭タグ保持)
--   - profiles.handle が 'seed_demo_' プレフィックス
--   - wanted_cards は seed card 名と完全一致 (exact string)
--
-- 投入対象:
--   - profiles UPSERT 最大 10 名 (seed_demo_001 〜 010)
--   - cards INSERT 30 件 (6 視覚ジャンル × 縦長人物カード)
--     - 1-6:   ステージアイドル女性 (idol)
--     - 7-12:  ステージアイドル男性 (idol)
--     - 13-17: 私服・オフショット系アイドル (idol)
--     - 18-22: ファンタジー (anime)
--     - 23-26: 和風 (anime)
--     - 27-30: ゴシック/SP (anime)
--   - アイテム種別 4 種に限定: トレカ / フォトカード / ブロマイド / アクスタ
--     (縦長キャラアートと整合するもののみ、ぬいぐるみ/缶バッジ等は除外)
--   - wanted_cards INSERT 13 件 (Part A 7 件 seed_idx=1 用 + Part B 6 件 seed_idx=2-5 用、直接交換 demo)
--   - row_id (1-30) ↔ card-0NN.png ファイル名は完全 1:1 対応
--     (詳細: docs/seed_video9_card_image_mapping.md)
--
-- 画像 URL: https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-0NN.png
--   - {PROJECT_REF} は Supabase プロジェクト ref、適用前に実値で置換必須
--   - 手順: docs/seed_video9_README.md 参照
--
-- 前提:
--   1. dev 環境の auth.users に最低 5 名のアカウントが存在
--      確認: SELECT count(*) FROM auth.users;
--   2. 不足してる場合は Supabase Auth Dashboard or signup フローで追加作成
--   3. Supabase Storage に seed-card-images バケット (public) を作成、card-001〜card-030.png をアップロード済
--   4. {PROJECT_REF} を実 ref に sed 等で置換してから本 SQL を実行

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
-- Step 3: cards 30 件 INSERT (6 視覚ジャンル × 縦長人物カード、4 アイテム種別)
--   - row_id ↔ card-0NN.png ファイル名は完全 1:1 対応
--   - アイテム種別: トレカ / フォトカード / ブロマイド / アクスタ のみ (縦長アート整合)
--   - description は '[SEED_V9] ' プレフィックス必須 (UPDATE/rollback ヒット用)
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
  -- ─────────────────────────────────────
  -- ステージアイドル女性 (card-001〜006、6 件、idol)
  -- ─────────────────────────────────────
  (1,  'アイドル A グループ メンバー X トレカ ステージ衣装 ver.',         'アイドル A グループ', 'メンバー X', 'Tour 2026',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-001.png',
       '美品・即発送可',         '同グループ別メンバーのアクスタ希望',
       'mint',     true,  false, true,  2,  'idol'),
  (2,  'アイドル A グループ メンバー Y フォトカード ライブ限定',           'アイドル A グループ', 'メンバー Y', 'ライブ会場限定',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-002.png',
       '未開封・暗所保管',       '同会場限定フォトカードと交換相談',
       'near_mint',true,  true,  false, 5,  'idol'),
  (3,  'アイドル A グループ メンバー Z アクリルスタンド L',               'アイドル A グループ', 'メンバー Z', '誕生日記念',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-003.png',
       '目立った傷なし・スリーブ保管', '同グループ別メンバーのトレカ希望',
       'mint',     true,  false, true,  10, 'idol'),
  (4,  'アイドル A グループ メンバー X ブロマイド 周年記念',              'アイドル A グループ', 'メンバー X', '周年記念',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-004.png',
       '新品同様・タグ付き',     '同シリーズの別キャラのブロマイド希望',
       'mint',     true,  true,  false, 24, 'idol'),
  (5,  'アイドル A グループ メンバー Y フォトカード Tour 2026',           'アイドル A グループ', 'メンバー Y', 'Tour 2026',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-005.png',
       '状態 A・防湿剤付き',     '同 Tour フォトカードのコンプ目指してます',
       'mint',     false, true,  true,  48, 'idol'),
  (6,  'アイドル A グループ メンバー Z トレカ ホロ加工',                  'アイドル A グループ', 'メンバー Z', '2026 Spring',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-006.png',
       '美品・即発送可',         'SR 以上のトレカと交換相談',
       'mint',     true,  true,  true,  6,  'idol'),

  -- ─────────────────────────────────────
  -- ステージアイドル男性 (card-007〜012、6 件、idol)
  -- ─────────────────────────────────────
  (7,  'アイドル B グループ メンバー P トレカ ステージ衣装 ver.',         'アイドル B グループ', 'メンバー P', 'JAPAN TOUR',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-007.png',
       '未開封・暗所保管',       '同グループ別メンバーのアクスタ希望',
       'mint',     true,  false, false, 12, 'idol'),
  (8,  'アイドル B グループ メンバー Q アクリルスタンド L',               'アイドル B グループ', 'メンバー Q', '誕生日記念',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-008.png',
       '目立った傷なし・スリーブ保管', '同グループ別メンバーのトレカ希望',
       'mint',     true,  true,  true,  18, 'idol'),
  (9,  'アイドル B グループ メンバー R フォトカード 会場限定',            'アイドル B グループ', 'メンバー R', '会場限定',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-009.png',
       '新品同様・タグ付き',     '同会場限定フォトカードと交換相談',
       'near_mint',true,  false, false, 36, 'idol'),
  (10, 'アイドル B グループ メンバー P ブロマイド JAPAN TOUR',            'アイドル B グループ', 'メンバー P', 'JAPAN TOUR',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-010.png',
       '状態 A・防湿剤付き',     '同シリーズの別キャラのブロマイド希望',
       'mint',     true,  true,  true,  60, 'idol'),
  (11, 'アイドル B グループ メンバー Q トレカ 限定版',                    'アイドル B グループ', 'メンバー Q', '2026 Spring',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-011.png',
       '美品・即発送可',         'SR 以上のトレカと交換相談',
       'mint',     true,  true,  true,  4,  'idol'),
  (12, 'アイドル B グループ メンバー R アクリルスタンド S',               'アイドル B グループ', 'メンバー R', '会場限定',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-012.png',
       '未開封・暗所保管',       '同グループ別メンバーのアクスタ希望',
       'near_mint',true,  false, true,  8,  'idol'),

  -- ─────────────────────────────────────
  -- 私服・オフショット系アイドル (card-013〜017、5 件、idol)
  -- ─────────────────────────────────────
  (13, 'アイドル C グループ メンバー S フォトカード オフショット',        'アイドル C グループ', 'メンバー S', 'オフショット',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-013.png',
       '目立った傷なし・スリーブ保管', '同オフショット系の別メンバーと交換',
       'mint',     true,  false, false, 14, 'idol'),
  (14, 'アイドル C グループ メンバー T アクリルスタンド 私服風',          'アイドル C グループ', 'メンバー T', '私服 ver.',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-014.png',
       '新品同様・タグ付き',     '同グループ別メンバーのアクスタ希望',
       'mint',     true,  true,  true,  22, 'idol'),
  (15, 'アイドル C グループ メンバー U ブロマイド オフショット',          'アイドル C グループ', 'メンバー U', 'オフショット',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-015.png',
       '状態 A・防湿剤付き',     '同シリーズの別キャラのブロマイド希望',
       'mint',     true,  true,  true,  30, 'idol'),
  (16, 'アイドル C グループ メンバー S トレカ プライベートカット',        'アイドル C グループ', 'メンバー S', 'プライベートカット',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-016.png',
       '美品・即発送可',         'SR 以上のトレカと交換相談',
       'mint',     true,  true,  false, 3,  'idol'),
  (17, 'アイドル C グループ メンバー T フォトカード 私服 ver.',           'アイドル C グループ', 'メンバー T', '私服 ver.',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-017.png',
       '未開封・暗所保管',       '同会場限定フォトカードと交換相談',
       'mint',     true,  false, true,  9,  'idol'),

  -- ─────────────────────────────────────
  -- ファンタジー (card-018〜022、5 件、anime)
  -- ─────────────────────────────────────
  (18, 'ファンタジー作品 D キャラ α アクリルスタンド L',                  'ファンタジー作品 D', 'キャラ α', NULL,
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-018.png',
       '目立った傷なし・スリーブ保管', '同作品の別キャラのアクスタ希望',
       'mint',     true,  true,  true,  16, 'anime'),
  (19, 'ファンタジー作品 D キャラ β トレカ レア度 SR',                    'ファンタジー作品 D', 'キャラ β', '第 8 弾',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-019.png',
       '新品同様・タグ付き',     'SR 以上のトレカと交換相談',
       'mint',     true,  false, true,  28, 'anime'),
  (20, 'ファンタジー作品 D キャラ γ フォトカード',                        'ファンタジー作品 D', 'キャラ γ', NULL,
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-020.png',
       '状態 A・防湿剤付き',     '同作品の別キャラのフォトカード希望',
       'near_mint',true,  true,  false, 42, 'anime'),
  (21, 'ファンタジー作品 D キャラ α ブロマイド BOX 特典',                 'ファンタジー作品 D', 'キャラ α', 'BOX 特典',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-021.png',
       '美品・即発送可',         '同シリーズの別キャラのブロマイド希望',
       'mint',     true,  true,  true,  1,  'anime'),
  (22, 'ファンタジー作品 D キャラ β アクリルスタンド S',                  'ファンタジー作品 D', 'キャラ β', NULL,
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-022.png',
       '未開封・暗所保管',       '同作品の別キャラのアクスタ希望',
       'mint',     false, true,  true,  7,  'anime'),

  -- ─────────────────────────────────────
  -- 和風 (card-023〜026、4 件、anime)
  -- ─────────────────────────────────────
  (23, '和風作品 E キャラ ζ アクリルスタンド L',                          '和風作品 E',         'キャラ ζ',  NULL,
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-023.png',
       '目立った傷なし・スリーブ保管', '同作品の別キャラのアクスタ希望',
       'mint',     true,  true,  false, 13, 'anime'),
  (24, '和風作品 E キャラ η ブロマイド 公式',                             '和風作品 E',         'キャラ η',  '公式',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-024.png',
       '新品同様・タグ付き',     '同シリーズの別キャラのブロマイド希望',
       'near_mint',true,  false, true,  19, 'anime'),
  (25, '和風作品 E キャラ θ トレカ 誕生祭限定',                           '和風作品 E',         'キャラ θ',  '誕生祭 2026',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-025.png',
       '状態 A・防湿剤付き',     'SR 以上のトレカと交換相談',
       'mint',     true,  true,  true,  31, 'anime'),
  (26, '和風作品 E キャラ ζ フォトカード',                                '和風作品 E',         'キャラ ζ',  NULL,
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-026.png',
       '美品・即発送可',         '同作品の別キャラのフォトカード希望',
       'mint',     true,  true,  false, 11, 'anime'),

  -- ─────────────────────────────────────
  -- ゴシック/SP (card-027〜030、4 件、anime)
  -- ─────────────────────────────────────
  (27, 'ゴシック作品 F キャラ ι アクリルスタンド スペシャル ver.',         'ゴシック作品 F',     'キャラ ι',  'スペシャル ver.',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-027.png',
       '未開封・暗所保管',       '同作品の別キャラのアクスタ希望',
       'mint',     true,  true,  true,  20, 'anime'),
  (28, 'ゴシック作品 F キャラ κ トレカ 限定',                              'ゴシック作品 F',     'キャラ κ',  '限定版',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-028.png',
       '目立った傷なし・スリーブ保管', 'SR 以上のトレカと交換相談',
       'mint',     true,  false, true,  26, 'anime'),
  (29, 'ゴシック作品 F キャラ λ フォトカード',                            'ゴシック作品 F',     'キャラ λ',  NULL,
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-029.png',
       '新品同様・タグ付き',     '同作品の別キャラのフォトカード希望',
       'mint',     true,  true,  true,  38, 'anime'),
  (30, 'ゴシック作品 F キャラ ι ブロマイド 10 周年記念',                  'ゴシック作品 F',     'キャラ ι',  '10 周年記念',
       'https://{PROJECT_REF}.supabase.co/storage/v1/object/public/seed-card-images/card-030.png',
       '状態 A・防湿剤付き',     '同シリーズの別キャラのブロマイド希望',
       'near_mint',true,  true,  false, 50, 'anime')
) AS v(
  row_id, name, group_name, member_name, series, image_url,
  descr, want, cond, mail, handoff, adj, hours_ago, cat
);

-- ─────────────────────────────────────────
-- Step 4: wanted_cards 投入 (直接交換 demo + Lane 1 表示)
--   - Part A (7 件): 録画ユーザー (seed_idx=1) 用、Lane 1「いいねした交換」表示
--     → seed_idx=1 が「自分が持っていない他人の card」を欲しがる
--   - Part B (6 件): seed_idx=2-5 に分散、直接交換マッチング demo 用
--     → seed_idx=2-5 が「録画ユーザー seed_idx=1 が所有する card」を欲しがる
--   - card_name は cards.name と完全一致 (exact string、表記ゆれ不可)
--     直接交換タブで実マッチが出るための必須条件
--   - 全 13 件
--
-- seed_idx=1 所有 card (5 名環境): row 1, 6, 11, 16, 21, 26 (modulo 5、(row-1)%5+1=1)
-- seed_idx=2 所有 card (5 名環境): row 2, 7, 12, 17, 22, 27
-- seed_idx=3 所有 card (5 名環境): row 3, 8, 13, 18, 23, 28
-- ─────────────────────────────────────────

-- Part A: seed_idx=1 が「他人の card」を欲しがる 7 件 (Lane 1 表示用)
--   各 card_name は cards.name と完全一致、所有者が seed_idx=2 or 3 のものを選定
INSERT INTO public.wanted_cards (
  user_id, card_name, group_name, member_name, series, status, created_at, updated_at
)
SELECT
  (SELECT id FROM _seed_v9_users WHERE seed_idx = 1),
  v.card_name, v.group_name, v.member_name, v.series,
  'active', NOW(), NOW()
FROM (VALUES
  -- seed_idx=2 所有 (row 2, 7, 12, 17, 22, 27 の中から)
  ('アイドル A グループ メンバー Y フォトカード ライブ限定', 'アイドル A グループ', 'メンバー Y', 'ライブ会場限定'),  -- row 2
  ('アイドル B グループ メンバー P トレカ ステージ衣装 ver.', 'アイドル B グループ', 'メンバー P', 'JAPAN TOUR'),    -- row 7
  ('ゴシック作品 F キャラ ι アクリルスタンド スペシャル ver.', 'ゴシック作品 F', 'キャラ ι', 'スペシャル ver.'),    -- row 27
  -- seed_idx=3 所有 (row 3, 8, 13, 18, 23, 28 の中から)
  ('アイドル A グループ メンバー Z アクリルスタンド L', 'アイドル A グループ', 'メンバー Z', '誕生日記念'),          -- row 3
  ('アイドル B グループ メンバー Q アクリルスタンド L', 'アイドル B グループ', 'メンバー Q', '誕生日記念'),          -- row 8
  ('アイドル C グループ メンバー S フォトカード オフショット', 'アイドル C グループ', 'メンバー S', 'オフショット'), -- row 13
  ('ファンタジー作品 D キャラ α アクリルスタンド L', 'ファンタジー作品 D', 'キャラ α', NULL)                          -- row 18
) AS v(card_name, group_name, member_name, series)
ON CONFLICT (user_id, card_name, group_name, member_name, series) DO NOTHING;

-- Part B: seed_idx=2-5 が「seed_idx=1 所有 card」を欲しがる 6 件 (直接交換 demo)
--   各 card_name は cards.name と完全一致、所有者が seed_idx=1 のもの (row 1, 6, 11, 16, 21, 26)
--   これで「seed_idx=1 が seed_idx=2 と直接交換できる」状態が成立
INSERT INTO public.wanted_cards (
  user_id, card_name, group_name, member_name, series, status, created_at, updated_at
)
SELECT
  (SELECT id FROM _seed_v9_users WHERE seed_idx = v.owner_idx),
  v.card_name, v.group_name, v.member_name, v.series,
  'active', NOW(), NOW()
FROM (VALUES
  -- seed_idx=2 が row 1 (アイドル女) + row 11 (アイドル男) を欲しい
  (2, 'アイドル A グループ メンバー X トレカ ステージ衣装 ver.', 'アイドル A グループ', 'メンバー X', 'Tour 2026'),
  (2, 'アイドル B グループ メンバー Q トレカ 限定版',             'アイドル B グループ', 'メンバー Q', '2026 Spring'),
  -- seed_idx=3 が row 16 (私服) を欲しい
  (3, 'アイドル C グループ メンバー S トレカ プライベートカット', 'アイドル C グループ', 'メンバー S', 'プライベートカット'),
  -- seed_idx=4 が row 21 (ファンタジー) を欲しい
  (4, 'ファンタジー作品 D キャラ α ブロマイド BOX 特典',         'ファンタジー作品 D', 'キャラ α',  'BOX 特典'),
  -- seed_idx=5 が row 26 (和風) + row 1 (アイドル女) を欲しい
  (5, '和風作品 E キャラ ζ フォトカード',                          '和風作品 E',         'キャラ ζ',  NULL),
  (5, 'アイドル A グループ メンバー X トレカ ステージ衣装 ver.', 'アイドル A グループ', 'メンバー X', 'Tour 2026')
) AS v(owner_idx, card_name, group_name, member_name, series)
WHERE EXISTS (SELECT 1 FROM _seed_v9_users WHERE seed_idx = v.owner_idx)  -- 5 名未満でも安全
ON CONFLICT (user_id, card_name, group_name, member_name, series) DO NOTHING;

-- ─────────────────────────────────────────
-- Step 5: 完了確認
-- ─────────────────────────────────────────

-- 完了確認 (件数集計)
SELECT
  'seed_video9_demo completed' AS status,
  (SELECT COUNT(*) FROM _seed_v9_users) AS seed_users_count,
  (SELECT COUNT(*) FROM public.cards WHERE description LIKE '[SEED_V9]%') AS seed_cards_count,
  (SELECT COUNT(*) FROM public.profiles WHERE handle LIKE 'seed_demo_%') AS seed_profiles_count,
  (SELECT COUNT(*) FROM public.wanted_cards
   WHERE user_id IN (SELECT id FROM _seed_v9_users)
   AND card_name IN (
     -- Part A 7 件
     'アイドル A グループ メンバー Y フォトカード ライブ限定',
     'アイドル B グループ メンバー P トレカ ステージ衣装 ver.',
     'ゴシック作品 F キャラ ι アクリルスタンド スペシャル ver.',
     'アイドル A グループ メンバー Z アクリルスタンド L',
     'アイドル B グループ メンバー Q アクリルスタンド L',
     'アイドル C グループ メンバー S フォトカード オフショット',
     'ファンタジー作品 D キャラ α アクリルスタンド L',
     -- Part B 6 件 (重複考慮)
     'アイドル A グループ メンバー X トレカ ステージ衣装 ver.',
     'アイドル B グループ メンバー Q トレカ 限定版',
     'アイドル C グループ メンバー S トレカ プライベートカット',
     'ファンタジー作品 D キャラ α ブロマイド BOX 特典',
     '和風作品 E キャラ ζ フォトカード'
   )) AS seed_wants_count;

-- 直接交換マッチング検証 (Pioneer #001 提案、動画 #9 録画画面)
-- seed_idx=1 視点で「自分が出す card (owner=seed_idx=1)」かつ「相手が欲しがってる」ペアを列挙
SELECT
  'direct_match verification' AS status,
  COUNT(DISTINCT c.id) AS matchable_offering_cards,
  COUNT(*) AS total_match_pairs
FROM public.cards c
INNER JOIN public.wanted_cards w
  ON w.card_name = c.name  -- exact string match (Pioneer #001 提案、表記ゆれ不可)
WHERE c.description LIKE '[SEED_V9]%'
  AND c.owner_user_id IN (SELECT id FROM _seed_v9_users WHERE seed_idx = 1)
  AND w.user_id IN (SELECT id FROM _seed_v9_users WHERE seed_idx >= 2);

-- 直接交換マッチング ペア詳細 (動画録画前にこの結果を確認すること)
SELECT
  c.name AS offering_card,
  (SELECT handle FROM public.profiles WHERE id = c.owner_user_id) AS card_owner,
  (SELECT handle FROM public.profiles WHERE id = w.user_id) AS want_owner,
  w.card_name AS wanted_card_name
FROM public.cards c
INNER JOIN public.wanted_cards w
  ON w.card_name = c.name
WHERE c.description LIKE '[SEED_V9]%'
  AND c.owner_user_id IN (SELECT id FROM _seed_v9_users WHERE seed_idx = 1)
  AND w.user_id IN (SELECT id FROM _seed_v9_users WHERE seed_idx >= 2)
ORDER BY c.name;

DROP TABLE _seed_v9_users;
