-- ─────────────────────────────────────────
-- 6/6 リア友レビュー + SNS 動画用 デモシードデータ
-- ─────────────────────────────────────────
-- Supabase SQL Editor で kaito が手動実行してください。
-- ⚠️ Dashboard には未適用、本ファイルは seed 案。
--
-- 著作権:
--   - グループ名 = 実在 (TREASURE / King & Prince / ACEs) を直接記載 (kaito 判断)
--   - 個人名 = 架空 (Aver./Bver. 等のセリー表記、メンバー個人名は使用しない)
--   - 画像 = picsum.photos プレースホルダー (実際の公式画像なし)
--   - 関連: refactor_plan §3.13 著作権コンプライアンス Day 1 必須項目 #11
--     「アプリ名・サービス名チェック」は β1 申請直前で別途実施予定
--
-- 識別マーカー (rollback で使用):
--   - profiles.handle が 'demo_0606_' プレフィックス
--   - cards.description が '[SEED_0606] ' プレフィックス
--   - venues.title が固定 4 件 (DELETE で対応)
--   - offers / trades / shipments / venue_checkins / venue_supply_posts は
--     上記 profiles / cards / venues の ON DELETE CASCADE で連動削除される想定
--
-- 投入内容:
--   - profiles UPSERT 6 名 (seed_idx 0〜5、既存 auth.users から取得、Pioneer 列無しのため通常 Trust のみ)
--   - venues INSERT 4 件 (TREASURE 6/6当日 open / KP / ACEs / J&K)
--   - venue_checkins INSERT 24 件 (6 users × 4 venues cross join)
--   - cards INSERT 25 件 (active 17 / reserved 6 / traded 2)
--   - venue_supply_posts INSERT 8 件 (各 venue 2 件)
--   - offers INSERT 8 件 (pending 4 + accepted 3 + completed 1)
--   - offer_items INSERT 16 件 (offer × 2)
--   - trades INSERT 4 件 (pending 1 + in_transit 2 + completed 1)
--   - trade_items INSERT 8 件 (trade × 2)
--   - shipments INSERT 8 件 (trade × 2、PR #9 shipping_method 適用済前提)
--
-- 前提:
--   1. auth.users に最低 6 名のアカウントが存在
--   2. PR #9 (shipping_method 列) が Dashboard に適用済
--   3. PR #8 の master_works seed expansion は適用済でも未適用でも OK
--      (work_id は raw text として 'treasure' / 'king_and_prince' / 'aces' を投入、
--       master 未登録なら ハイブリッドマスタとして raw text 表示にフォールバック)
--
-- 実行方法:
--   1. Supabase Dashboard → SQL Editor → 本ファイル全文を貼り付け
--   2. Run 実行
--   3. 末尾の確認 SELECT が想定件数を返せば成功

-- ─────────────────────────────────────────
-- Step 1: auth.users から 6 名を seed 対象として確保
-- ─────────────────────────────────────────

DROP TABLE IF EXISTS _seed_demo_0606_users;
CREATE TEMP TABLE _seed_demo_0606_users AS
SELECT
  id,
  ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS seed_idx
FROM auth.users
ORDER BY created_at ASC
LIMIT 6;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM _seed_demo_0606_users) < 6 THEN
    RAISE EXCEPTION 'auth.users が 6 名未満です (現在: %)。最低 6 名作成してから再実行してください。',
      (SELECT COUNT(*) FROM auth.users);
  END IF;
END $$;

-- ─────────────────────────────────────────
-- Step 1.5: 既存 demo データの一括クリーンアップ (冪等性)
--   FK 依存順 (子 → 親) で DELETE する。CASCADE 設定に頼らず明示的に消す。
--   順序:
--     1. shipments       (trade_id 子)
--     2. trade_items     (trade_id 子)
--     3. trade_events    (trade_id 子)
--     4. trades          (offer_id 子)
--     5. offer_items     (offer_id 子)
--     6. offers
--     7. venue_supply_posts (venue_id / user_id 子)
--     8. venue_holds        (venue_id / proposer_id / receiver_id 子)
--     9. venue_checkins     (venue_id / user_id 子)
--    10. cards           (owner_user_id 子)
--    11. venues
--    12. profiles はここでは DELETE せず Step 2 で UPDATE / INSERT する
--        (auth.users と 1:1 で残し、handle/display_name 等の値のみ書き換える)
-- ─────────────────────────────────────────

-- 1. shipments
DELETE FROM public.shipments
WHERE user_id IN (SELECT id FROM _seed_demo_0606_users);

-- 2. trade_items
DELETE FROM public.trade_items
WHERE owner_user_id IN (SELECT id FROM _seed_demo_0606_users);

-- 3. trade_events
DELETE FROM public.trade_events
WHERE actor_user_id IN (SELECT id FROM _seed_demo_0606_users);

-- 4. trades (proposer / receiver どちらか一方でも demo user なら対象)
DELETE FROM public.trades
WHERE proposer_user_id IN (SELECT id FROM _seed_demo_0606_users)
   OR receiver_user_id IN (SELECT id FROM _seed_demo_0606_users);

-- 5. offer_items (demo user の offer 経由で抽出)
DELETE FROM public.offer_items
WHERE offer_id IN (
  SELECT id FROM public.offers
  WHERE proposer_user_id IN (SELECT id FROM _seed_demo_0606_users)
);

-- 6. offers
DELETE FROM public.offers
WHERE proposer_user_id IN (SELECT id FROM _seed_demo_0606_users);

-- 7. venue_supply_posts
DELETE FROM public.venue_supply_posts
WHERE user_id IN (SELECT id FROM _seed_demo_0606_users);

-- 8. venue_holds (列は user_id ではなく proposer_id / receiver_id)
DELETE FROM public.venue_holds
WHERE proposer_id IN (SELECT id FROM _seed_demo_0606_users)
   OR receiver_id IN (SELECT id FROM _seed_demo_0606_users);

-- 9. venue_checkins
DELETE FROM public.venue_checkins
WHERE user_id IN (SELECT id FROM _seed_demo_0606_users);

-- 10. cards (description マーカーで識別)
DELETE FROM public.cards
WHERE description LIKE '[SEED_0606]%';

-- 11. venues (4 タイトル固定マッチ)
DELETE FROM public.venues WHERE title IN (
  'TREASURE LIVE TOUR 2026 in TOKYO',
  'King & Prince Concert Tour 2026',
  'ACEs Summer Special 2026',
  'J&K Live Goods Festival 2026'
);

-- ─────────────────────────────────────────
-- Step 2: profiles UPSERT (Trust 分布)
--   Trust 計算式 (lib/types.ts computeTrustBadge):
--     gold_blue : trade_count >= 50 AND ship_rate >= 97 AND last_active_at 60日以内
--     blue      : trade_count >= 10 AND ship_rate >= 95 AND trouble_count = 0
--     trial_blue: trade_count >= 1
--     green     : trade_count = 0
--   注: profiles に is_pioneer 等の列が無いため、Pioneer バッジは今回のデモでは見送り
-- ─────────────────────────────────────────

-- 既存 profiles を上書き (auth.users と 1:1 のため UPDATE FROM が基本)
UPDATE public.profiles p
SET
  handle = 'demo_0606_' || lpad((d.seed_idx + 1)::text, 3, '0'),
  display_name = CASE d.seed_idx
    WHEN 0 THEN '夜空🌙'         -- gold_blue
    WHEN 1 THEN 'ハル💎'         -- blue
    WHEN 2 THEN 'みお☁️'         -- blue
    WHEN 3 THEN 'りこ🤍'         -- trial_blue
    WHEN 4 THEN 'そら🌸'         -- trial_blue
    WHEN 5 THEN 'なお🌿'         -- green
  END,
  mode = 'oshi',
  trade_count = CASE d.seed_idx
    WHEN 0 THEN 82
    WHEN 1 THEN 22
    WHEN 2 THEN 14
    WHEN 3 THEN 6
    WHEN 4 THEN 3
    WHEN 5 THEN 0
  END,
  ship_rate = CASE d.seed_idx
    WHEN 0 THEN 98
    WHEN 1 THEN 96
    WHEN 2 THEN 95
    WHEN 3 THEN 90
    WHEN 4 THEN 88
    WHEN 5 THEN 100
  END,
  reply_median_hours = CASE d.seed_idx
    WHEN 0 THEN 3
    WHEN 1 THEN 6
    WHEN 2 THEN 9
    WHEN 3 THEN 18
    WHEN 4 THEN 24
    WHEN 5 THEN 999
  END,
  trouble_count = 0,
  adjustment_avg = CASE d.seed_idx
    WHEN 0 THEN 250
    WHEN 1 THEN 300
    WHEN 2 THEN 200
    WHEN 3 THEN 150
    WHEN 4 THEN 100
    ELSE NULL
  END,
  last_active_at = NOW() - make_interval(hours => d.seed_idx::int),
  updated_at = NOW()
FROM _seed_demo_0606_users d
WHERE p.id = d.id;

-- profile レコードが auto-create されていない user 用の補完 INSERT
INSERT INTO public.profiles (
  id, handle, display_name, mode, trade_count, ship_rate, reply_median_hours,
  trouble_count, adjustment_avg, last_active_at,
  created_at, updated_at
)
SELECT
  d.id,
  'demo_0606_' || lpad((d.seed_idx + 1)::text, 3, '0'),
  CASE d.seed_idx
    WHEN 0 THEN '夜空🌙' WHEN 1 THEN 'ハル💎' WHEN 2 THEN 'みお☁️'
    WHEN 3 THEN 'りこ🤍' WHEN 4 THEN 'そら🌸' WHEN 5 THEN 'なお🌿'
  END,
  'oshi',
  CASE d.seed_idx WHEN 0 THEN 82 WHEN 1 THEN 22 WHEN 2 THEN 14
       WHEN 3 THEN 6 WHEN 4 THEN 3 WHEN 5 THEN 0 END,
  CASE d.seed_idx WHEN 0 THEN 98 WHEN 1 THEN 96 WHEN 2 THEN 95
       WHEN 3 THEN 90 WHEN 4 THEN 88 WHEN 5 THEN 100 END,
  CASE d.seed_idx WHEN 0 THEN 3 WHEN 1 THEN 6 WHEN 2 THEN 9
       WHEN 3 THEN 18 WHEN 4 THEN 24 WHEN 5 THEN 999 END,
  0,
  CASE d.seed_idx WHEN 0 THEN 250 WHEN 1 THEN 300 WHEN 2 THEN 200
       WHEN 3 THEN 150 WHEN 4 THEN 100 ELSE NULL END,
  NOW() - make_interval(hours => d.seed_idx::int),
  NOW(),
  NOW()
FROM _seed_demo_0606_users d
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = d.id);

-- ─────────────────────────────────────────
-- Step 3: venues 4 件 INSERT (event_date は相対日付)
--   - Venue 1 (TREASURE)     : CURRENT_DATE     / status='open' (6/6 当日)
--   - Venue 2 (King & Prince): CURRENT_DATE + 2 / status='upcoming'
--   - Venue 3 (ACEs)         : CURRENT_DATE + 4 / status='upcoming'
--   - Venue 4 (J&K Festival) : CURRENT_DATE + 6 / status='upcoming'
-- ─────────────────────────────────────────

-- 冪等性に伴う既存 demo venues の DELETE は Step 1.5 で実施済

INSERT INTO public.venues (title, venue_name, event_date, starts_at, ends_at, status) VALUES
  ('TREASURE LIVE TOUR 2026 in TOKYO',
    '東京ドーム (東京都文京区)',
    CURRENT_DATE,
    (CURRENT_DATE + TIME '18:00') AT TIME ZONE 'Asia/Tokyo',
    (CURRENT_DATE + TIME '21:30') AT TIME ZONE 'Asia/Tokyo',
    'open'),
  ('King & Prince Concert Tour 2026',
    '横浜アリーナ (神奈川県横浜市)',
    CURRENT_DATE + INTERVAL '2 days',
    NULL, NULL, 'upcoming'),
  ('ACEs Summer Special 2026',
    '国立代々木競技場 (東京都渋谷区)',
    CURRENT_DATE + INTERVAL '4 days',
    NULL, NULL, 'upcoming'),
  ('J&K Live Goods Festival 2026',
    '幕張メッセ (千葉県千葉市)',
    CURRENT_DATE + INTERVAL '6 days',
    NULL, NULL, 'upcoming');

-- venue ID 取得 TEMP TABLE (後段 cross join 用)
DROP TABLE IF EXISTS _seed_demo_0606_venues;
CREATE TEMP TABLE _seed_demo_0606_venues AS
SELECT
  id,
  CASE title
    WHEN 'TREASURE LIVE TOUR 2026 in TOKYO' THEN 1
    WHEN 'King & Prince Concert Tour 2026' THEN 2
    WHEN 'ACEs Summer Special 2026' THEN 3
    WHEN 'J&K Live Goods Festival 2026' THEN 4
  END AS venue_idx,
  event_date
FROM public.venues
WHERE title IN (
  'TREASURE LIVE TOUR 2026 in TOKYO',
  'King & Prince Concert Tour 2026',
  'ACEs Summer Special 2026',
  'J&K Live Goods Festival 2026'
);

-- ─────────────────────────────────────────
-- Step 4: venue_checkins 24 件 INSERT (6 users × 4 venues cross join)
--   UNIQUE(venue_id, user_id) 制約があるため、cross join で重複なし
-- ─────────────────────────────────────────

-- 冪等性に伴う既存 demo checkins の DELETE は Step 1.5 で実施済

INSERT INTO public.venue_checkins (venue_id, user_id, created_at)
SELECT
  v.id,
  u.id,
  NOW() - make_interval(hours => (u.seed_idx + v.venue_idx)::int)
FROM _seed_demo_0606_users u
CROSS JOIN _seed_demo_0606_venues v;

-- ─────────────────────────────────────────
-- Step 5: cards 25 件 INSERT (active 17 / reserved 6 / traded 2)
--   - 各 user 3〜5 枚配布
--   - card_idx 1-25 → owner 配分:
--       user 0 (gold_blue): 1-5   (5 枚)
--       user 1 (blue)   : 6-9     (4 枚)
--       user 2 (blue)   : 10-13   (4 枚)
--       user 3 (trial)  : 14-17   (4 枚)
--       user 4 (trial)  : 18-21   (4 枚)
--       user 5 (green)  : 22-25   (4 枚)
--   - work_id (raw text、master_works に未登録でも OK):
--       treasure / king_and_prince / aces
--   - 画像: https://picsum.photos/seed/{slug}/400/560
-- ─────────────────────────────────────────

-- 冪等性に伴う既存 demo cards の DELETE は Step 1.5 で実施済

INSERT INTO public.cards (
  owner_user_id, name, image_url, description, want_description,
  status, condition, allows_mail, allows_handoff, allows_adjustment, adjustment_max,
  category, work_id, characters, item_types,
  group_name, member_name, series,
  created_at, updated_at
)
SELECT
  (SELECT id FROM _seed_demo_0606_users WHERE seed_idx = v.owner_idx),
  v.name, v.image_url, '[SEED_0606] ' || v.descr, v.want,
  v.status, v.cond, true, v.handoff, v.adj, v.adj_max,
  'idol', v.work_id, ARRAY[]::text[], v.item_types,
  NULL, NULL, NULL,
  NOW() - make_interval(hours => v.hours_ago),
  NOW() - make_interval(hours => v.hours_ago)
FROM (VALUES
  -- ─ user 0 (gold_blue): cards 1-5 ─
  -- card 1: TREASURE トレカ (reserved、pending trade target)
  (0, 'TREASURE 2026 TOUR Aver. トレカ',
      'https://picsum.photos/seed/treasure_card_a1/400/560',
      '美品・即発送可。スリーブ保管', '同 Tour Bver./Cver. のトレカと交換希望',
      'reserved', 'mint', false, true, 500, 'treasure', ARRAY['trading_card']::text[], 5),
  -- card 2: TREASURE フォトカード (active、pending offer A target)
  (0, 'TREASURE Photo Card Bver. ライブ会場限定',
      'https://picsum.photos/seed/treasure_card_a2/400/560',
      '未開封・暗所保管', '同会場限定フォトカードと交換相談',
      'active', 'mint', true, true, 800, 'treasure', ARRAY['photo_card']::text[], 12),
  -- card 3: TREASURE アクスタ (active)
  (0, 'TREASURE アクリルスタンド Cver. 周年記念',
      'https://picsum.photos/seed/treasure_card_a3/400/560',
      '目立った傷なし', '同シリーズのブロマイドと交換',
      'active', 'near_mint', false, true, 1000, 'treasure', ARRAY['acrylic_stand']::text[], 18),
  -- card 4: King & Prince トレカ (active)
  (0, 'King & Prince Tour 2026 Aver. トレカ',
      'https://picsum.photos/seed/kp_card_a1/400/560',
      '新品同様', '同 Tour Bver./Cver. と交換',
      'active', 'mint', true, false, 0, 'king_and_prince', ARRAY['trading_card']::text[], 24),
  -- card 5: ACEs ブロマイド (active)
  (0, 'ACEs 春コン Aver. ブロマイド',
      'https://picsum.photos/seed/aces_card_a1/400/560',
      '美品・防湿剤付き', '同春コン別バージョンのブロマイドと交換',
      'active', 'mint', true, true, 500, 'aces', ARRAY['bromide']::text[], 36),

  -- ─ user 1 (blue): cards 6-9 ─
  -- card 6: TREASURE フォトカード (reserved、pending trade proposer)
  (1, 'TREASURE Photo Card Dver. ライブ会場限定',
      'https://picsum.photos/seed/treasure_card_b1/400/560',
      '美品・スリーブ保管', '同 Tour のトレカと交換希望',
      'reserved', 'mint', true, true, 500, 'treasure', ARRAY['photo_card']::text[], 30),
  -- card 7: King & Prince フォトカード (reserved、in_transit trade #1 target)
  (1, 'King & Prince Photo Card Aver. Concert Tour',
      'https://picsum.photos/seed/kp_card_b1/400/560',
      '新品同様・タグ付き', '同 Concert Tour トレカと交換',
      'reserved', 'mint', true, false, 0, 'king_and_prince', ARRAY['photo_card']::text[], 48),
  -- card 8: King & Prince フォトカード (active、pending offer B target)
  (1, 'King & Prince Photo Card Bver. ライブ会場限定',
      'https://picsum.photos/seed/kp_card_b2/400/560',
      '美品・防湿剤付き', '同会場限定の Aver./Cver. と交換',
      'active', 'mint', true, true, 800, 'king_and_prince', ARRAY['photo_card']::text[], 60),
  -- card 9: ACEs 缶バッジ (active)
  (1, 'ACEs Summer Special 缶バッジ ランダム封入',
      'https://picsum.photos/seed/aces_card_b1/400/560',
      '未開封 (シークレット可能性あり)', '別メンバーの缶バッジと交換',
      'active', 'mint', true, true, 1000, 'aces', ARRAY['can_badge', 'random_pack_item']::text[], 72),

  -- ─ user 2 (blue): cards 10-13 ─
  -- card 10: TREASURE トレカ (reserved、in_transit trade #1 proposer)
  (2, 'TREASURE 2026 TOUR Ever. トレカ',
      'https://picsum.photos/seed/treasure_card_c1/400/560',
      '美品・即発送可', 'King & Prince の Photo Card と交換',
      'reserved', 'mint', true, false, 300, 'treasure', ARRAY['trading_card']::text[], 14),
  -- card 11: King & Prince アクスタ (reserved、in_transit trade #2 target)
  (2, 'King & Prince Concert アクリルスタンド Aver.',
      'https://picsum.photos/seed/kp_card_c1/400/560',
      '新品同様・暗所保管', '同 Concert の Bver. アクスタと交換',
      'reserved', 'mint', true, true, 600, 'king_and_prince', ARRAY['acrylic_stand']::text[], 26),
  -- card 12: ACEs フォトカード (active、pending offer D target)
  (2, 'ACEs 春コン Bver. フォトカード',
      'https://picsum.photos/seed/aces_card_c1/400/560',
      '美品・スリーブ保管', '同春コン Aver./Cver. のフォトカードと交換',
      'active', 'mint', false, true, 500, 'aces', ARRAY['photo_card']::text[], 42),
  -- card 13: ACEs ブロマイド (active)
  (2, 'ACEs Live Tour ブロマイド ホロ加工',
      'https://picsum.photos/seed/aces_card_c2/400/560',
      '美品・防湿剤付き', 'ホロ加工版同士で交換希望',
      'active', 'mint', true, false, 0, 'aces', ARRAY['bromide']::text[], 50),

  -- ─ user 3 (trial_blue): cards 14-17 ─
  -- card 14: TREASURE フォトカード (reserved、in_transit trade #2 proposer)
  (3, 'TREASURE Photo Card Fver. オフショット',
      'https://picsum.photos/seed/treasure_card_d1/400/560',
      '美品・スリーブ保管', 'King & Prince のアクスタと交換',
      'reserved', 'mint', true, true, 500, 'treasure', ARRAY['photo_card']::text[], 20),
  -- card 15: King & Prince アクスタ (traded、completed trade target)
  (3, 'King & Prince Concert アクリルスタンド Bver.',
      'https://picsum.photos/seed/kp_card_d1/400/560',
      '美品 (交換済み)', '(取引済み)',
      'traded', 'mint', true, true, 800, 'king_and_prince', ARRAY['acrylic_stand']::text[], 168),
  -- card 16: ACEs フォトカード (active、pending offer C proposer)
  (3, 'ACEs Summer Photo Card Aver.',
      'https://picsum.photos/seed/aces_card_d1/400/560',
      '新品同様', 'TREASURE のライブ会場限定アクスタと交換',
      'active', 'mint', true, false, 200, 'aces', ARRAY['photo_card']::text[], 8),
  -- card 17: TREASURE トレカ (active)
  (3, 'TREASURE トレカ Gver. ホロ加工',
      'https://picsum.photos/seed/treasure_card_d2/400/560',
      '美品・スリーブ保管', '同 Tour 別バージョンのトレカと交換',
      'active', 'mint', true, true, 600, 'treasure', ARRAY['trading_card']::text[], 16),

  -- ─ user 4 (trial_blue): cards 18-21 ─
  -- card 18: King & Prince ブロマイド (traded、completed trade proposer)
  (4, 'King & Prince Tour Cver. ブロマイド',
      'https://picsum.photos/seed/kp_card_e1/400/560',
      '美品 (交換済み)', '(取引済み)',
      'traded', 'mint', true, false, 0, 'king_and_prince', ARRAY['bromide']::text[], 168),
  -- card 19: TREASURE アクスタ (active、pending offer C target)
  (4, 'TREASURE 2026 ライブ会場限定アクリルスタンド',
      'https://picsum.photos/seed/treasure_card_e1/400/560',
      '未開封・暗所保管', '同会場限定のフォトカードまたはトレカと交換',
      'active', 'mint', false, true, 1000, 'treasure', ARRAY['acrylic_stand']::text[], 22),
  -- card 20: ACEs アクスタ (active、pending offer D proposer)
  (4, 'ACEs Summer Bver. アクリルスタンド',
      'https://picsum.photos/seed/aces_card_e1/400/560',
      '美品・防湿剤付き', '同 Summer のフォトカードと交換',
      'active', 'mint', true, true, 700, 'aces', ARRAY['acrylic_stand']::text[], 28),
  -- card 21: King & Prince セット (active)
  (4, 'King & Prince セット (フォトカード3枚)',
      'https://picsum.photos/seed/kp_card_e2/400/560',
      '美品・スリーブ保管', '同 Concert Tour の別バージョン3枚セットと交換',
      'active', 'near_mint', true, true, 1000, 'king_and_prince', ARRAY['photo_card']::text[], 40),

  -- ─ user 5 (green、新規): cards 22-25 ─
  -- card 22: TREASURE トレカ (active、pending offer A proposer)
  (5, 'TREASURE 2026 TOUR Hver. トレカ',
      'https://picsum.photos/seed/treasure_card_f1/400/560',
      '新品同様・タグ付き', 'TREASURE Photo Card と交換希望',
      'active', 'mint', true, true, 500, 'treasure', ARRAY['trading_card']::text[], 4),
  -- card 23: King & Prince アクスタ (active、pending offer B proposer)
  (5, 'King & Prince Tour Dver. アクリルスタンド',
      'https://picsum.photos/seed/kp_card_f1/400/560',
      '美品・即発送可', 'King & Prince Photo Card Bver. と交換',
      'active', 'mint', true, false, 300, 'king_and_prince', ARRAY['acrylic_stand']::text[], 6),
  -- card 24: ACEs ブロマイド (active)
  (5, 'ACEs サマソニ Aver. ブロマイド',
      'https://picsum.photos/seed/aces_card_f1/400/560',
      '未開封', 'ACEs 別ライブのブロマイドと交換',
      'active', 'mint', true, true, 500, 'aces', ARRAY['bromide']::text[], 10),
  -- card 25: TREASURE トレカ (active)
  (5, 'TREASURE ホロ加工トレカ Tour Iver.',
      'https://picsum.photos/seed/treasure_card_f2/400/560',
      '美品・スリーブ保管', 'ホロ加工版同士で交換希望',
      'active', 'mint', true, true, 600, 'treasure', ARRAY['trading_card']::text[], 12)
) AS v(owner_idx, name, image_url, descr, want, status, cond, handoff, adj, adj_max, work_id, item_types, hours_ago);

-- card ID 取得 TEMP TABLE (後段 offers/trades 用、name で参照)
DROP TABLE IF EXISTS _seed_demo_0606_cards;
CREATE TEMP TABLE _seed_demo_0606_cards AS
SELECT
  id, name, owner_user_id, status,
  -- card_idx 1-25 を name で逆引き (offer/trade 設計用)
  CASE name
    WHEN 'TREASURE 2026 TOUR Aver. トレカ' THEN 1
    WHEN 'TREASURE Photo Card Bver. ライブ会場限定' THEN 2
    WHEN 'TREASURE アクリルスタンド Cver. 周年記念' THEN 3
    WHEN 'King & Prince Tour 2026 Aver. トレカ' THEN 4
    WHEN 'ACEs 春コン Aver. ブロマイド' THEN 5
    WHEN 'TREASURE Photo Card Dver. ライブ会場限定' THEN 6
    WHEN 'King & Prince Photo Card Aver. Concert Tour' THEN 7
    WHEN 'King & Prince Photo Card Bver. ライブ会場限定' THEN 8
    WHEN 'ACEs Summer Special 缶バッジ ランダム封入' THEN 9
    WHEN 'TREASURE 2026 TOUR Ever. トレカ' THEN 10
    WHEN 'King & Prince Concert アクリルスタンド Aver.' THEN 11
    WHEN 'ACEs 春コン Bver. フォトカード' THEN 12
    WHEN 'ACEs Live Tour ブロマイド ホロ加工' THEN 13
    WHEN 'TREASURE Photo Card Fver. オフショット' THEN 14
    WHEN 'King & Prince Concert アクリルスタンド Bver.' THEN 15
    WHEN 'ACEs Summer Photo Card Aver.' THEN 16
    WHEN 'TREASURE トレカ Gver. ホロ加工' THEN 17
    WHEN 'King & Prince Tour Cver. ブロマイド' THEN 18
    WHEN 'TREASURE 2026 ライブ会場限定アクリルスタンド' THEN 19
    WHEN 'ACEs Summer Bver. アクリルスタンド' THEN 20
    WHEN 'King & Prince セット (フォトカード3枚)' THEN 21
    WHEN 'TREASURE 2026 TOUR Hver. トレカ' THEN 22
    WHEN 'King & Prince Tour Dver. アクリルスタンド' THEN 23
    WHEN 'ACEs サマソニ Aver. ブロマイド' THEN 24
    WHEN 'TREASURE ホロ加工トレカ Tour Iver.' THEN 25
  END AS card_idx
FROM public.cards
WHERE description LIKE '[SEED_0606]%';

-- ─────────────────────────────────────────
-- Step 6: venue_supply_posts 8 件 INSERT (各 venue 2 件、status='active')
-- ─────────────────────────────────────────

INSERT INTO public.venue_supply_posts (venue_id, user_id, card_name, group_name, want_card, status, expires_at, created_at)
SELECT
  v.id,
  (SELECT id FROM _seed_demo_0606_users WHERE seed_idx = post.user_idx),
  post.card_name, post.group_name, post.want_card, 'active',
  v.event_date + INTERVAL '23 hours 59 minutes',
  NOW() - make_interval(hours => post.hours_ago)
FROM (VALUES
  -- Venue 1 (TREASURE) のサプライ
  (1, 0, 'TREASURE Photo Card Bver. (会場限定)', 'TREASURE', '同会場限定の別バージョンのフォトカード', 2),
  (1, 1, 'TREASURE トレカ Cver.',               'TREASURE', '同 Tour の Aver. または Bver. トレカ', 3),
  -- Venue 2 (King & Prince)
  (2, 1, 'King & Prince Photo Card Cver.',     'King & Prince', '同 Concert の Aver./Bver. のフォトカード', 5),
  (2, 2, 'King & Prince Concert アクスタ Cver.','King & Prince', 'Aver./Bver. のアクスタと交換相談', 7),
  -- Venue 3 (ACEs)
  (3, 3, 'ACEs Summer Photo Aver.',            'ACEs', '同 Summer の Bver./Cver. のフォトカード', 9),
  (3, 4, 'ACEs サマソニ缶バッジ',                'ACEs', '別メンバーの缶バッジと交換', 11),
  -- Venue 4 (J&K Festival、混合)
  (4, 5, 'TREASURE トレカ Jver.',               'TREASURE', '同 Tour 別バージョンのトレカ', 13),
  (4, 0, 'King & Prince ブロマイド Aver.',     'King & Prince', '同 Tour の Bver./Cver. ブロマイド', 15)
) AS post(venue_idx, user_idx, card_name, group_name, want_card, hours_ago)
JOIN _seed_demo_0606_venues v ON v.venue_idx = post.venue_idx;

-- ─────────────────────────────────────────
-- Step 7: offers 8 件 INSERT (pending 4 + accepted 3 + completed 1)
--   注: 通常は accept_offer_atomic_v3 RPC 経由で trade まで連動するが、
--   seed では直接 INSERT する (デモ用のため atomic 性は不要)
-- ─────────────────────────────────────────

-- 冪等性に伴う既存 demo offers の DELETE は Step 1.5 で実施済

-- offers INSERT (CTE で id を返して後段の offer_items 用)
DROP TABLE IF EXISTS _seed_demo_0606_offers;
CREATE TEMP TABLE _seed_demo_0606_offers (
  id uuid,
  offer_idx int  -- 1..8、後段 trade/offer_items 用
);

WITH inserted_offers AS (
  INSERT INTO public.offers (
    proposer_user_id, target_card_id, status, message, adjustment_amount, created_at, updated_at
  )
  SELECT
    (SELECT id FROM _seed_demo_0606_users WHERE seed_idx = o.proposer_idx),
    (SELECT id FROM _seed_demo_0606_cards WHERE card_idx = o.target_card_idx),
    o.status::offer_status, o.message, o.adj,
    NOW() - make_interval(hours => o.hours_ago),
    NOW() - make_interval(hours => o.hours_ago)
  FROM (VALUES
    -- Offer 1: user 5 → user 0 (card 2)、pending、card 22 を提案
    (1, 5, 2,  'pending',   '同 Tour の Hver. トレカと交換していただけませんか？', 0, 3),
    -- Offer 2: user 5 → user 1 (card 8)、pending、card 23 を提案
    (2, 5, 8,  'pending',   'King & Prince の Dver. アクスタと交換希望です', 200, 6),
    -- Offer 3: user 3 → user 4 (card 19)、pending、card 16 を提案
    (3, 3, 19, 'pending',   'TREASURE 会場限定アクスタを ACEs Summer Photo と交換でいかがでしょうか', 0, 9),
    -- Offer 4: user 4 → user 2 (card 12)、pending、card 20 を提案
    (4, 4, 12, 'pending',   'ACEs Summer アクスタ Bver. と春コン Bver. フォトの交換希望', 300, 12),
    -- Offer 5: user 1 → user 0 (card 1)、accepted (→ pending trade)、card 6 を提案
    (5, 1, 1,  'accepted',  'TREASURE Photo Card Dver. と Aver. トレカの交換でお願いします', 500, 18),
    -- Offer 6: user 2 → user 1 (card 7)、accepted (→ in_transit trade #1)、card 10 を提案
    (6, 2, 7,  'accepted',  'TREASURE TOUR Ever. と King & Prince Photo Card Aver. の交換成立しました', 200, 36),
    -- Offer 7: user 3 → user 2 (card 11)、accepted (→ in_transit trade #2)、card 14 を提案
    (7, 3, 11, 'accepted',  'TREASURE Photo Card Fver. と King & Prince アクスタ Aver. の交換確定です', 0, 48),
    -- Offer 8: user 4 → user 3 (card 15)、completed (→ completed trade)、card 18 を提案
    (8, 4, 15, 'completed', '取引完了済 (King & Prince ブロマイド Cver. ⇄ アクスタ Bver.)', 0, 96)
  ) AS o(offer_idx, proposer_idx, target_card_idx, status, message, adj, hours_ago)
  RETURNING id, proposer_user_id, target_card_id, created_at
)
INSERT INTO _seed_demo_0606_offers (id, offer_idx)
SELECT
  io.id,
  -- created_at 古い順で 8 → 1 と並ぶため、created_at 降順で 1..8 を割り当て
  ROW_NUMBER() OVER (ORDER BY io.created_at DESC) AS offer_idx
FROM inserted_offers io;

-- ─────────────────────────────────────────
-- Step 8: offer_items 16 件 INSERT (各 offer 2 件: receiver target + proposer card)
--   accept_offer_atomic_v3 規約: offer_items に receiver と proposer 両方の card を含める
-- ─────────────────────────────────────────

INSERT INTO public.offer_items (offer_id, card_id, created_at)
SELECT
  o.id,
  (SELECT id FROM _seed_demo_0606_cards WHERE card_idx = oi.card_idx),
  NOW() - make_interval(hours => oi.hours_ago)
FROM (VALUES
  -- Offer 1: target=card 2 (user 0) + proposer=card 22 (user 5)
  (1, 2,  3), (1, 22, 3),
  -- Offer 2: target=card 8 + proposer=card 23
  (2, 8,  6), (2, 23, 6),
  -- Offer 3: target=card 19 + proposer=card 16
  (3, 19, 9), (3, 16, 9),
  -- Offer 4: target=card 12 + proposer=card 20
  (4, 12, 12), (4, 20, 12),
  -- Offer 5 (pending trade): target=card 1 + proposer=card 6
  (5, 1,  18), (5, 6,  18),
  -- Offer 6 (in_transit #1): target=card 7 + proposer=card 10
  (6, 7,  36), (6, 10, 36),
  -- Offer 7 (in_transit #2): target=card 11 + proposer=card 14
  (7, 11, 48), (7, 14, 48),
  -- Offer 8 (completed): target=card 15 + proposer=card 18
  (8, 15, 96), (8, 18, 96)
) AS oi(offer_idx, card_idx, hours_ago)
JOIN _seed_demo_0606_offers o ON o.offer_idx = oi.offer_idx;

-- ─────────────────────────────────────────
-- Step 9: trades 4 件 INSERT (pending 1 + in_transit 2 + completed 1)
--   offer.status='accepted' (offer 5,6,7) + completed (offer 8) に対応
-- ─────────────────────────────────────────

DROP TABLE IF EXISTS _seed_demo_0606_trades;
CREATE TEMP TABLE _seed_demo_0606_trades (
  id uuid,
  trade_idx int,
  offer_idx int,
  proposer_user_id uuid,
  receiver_user_id uuid
);

WITH inserted_trades AS (
  INSERT INTO public.trades (
    offer_id, proposer_user_id, receiver_user_id, trade_mode, status,
    ship_deadline_at, adjustment_amount,
    completed_at,
    created_at, updated_at
  )
  SELECT
    o.id,
    (SELECT id FROM _seed_demo_0606_users WHERE seed_idx = t.proposer_idx),
    (SELECT id FROM _seed_demo_0606_users WHERE seed_idx = t.receiver_idx),
    'mail'::trade_mode,
    t.status::trade_status,
    NOW() + INTERVAL '72 hours' - make_interval(hours => t.created_hours_ago),
    t.adj,
    CASE WHEN t.status = 'completed' THEN NOW() - make_interval(hours => t.created_hours_ago - 24) ELSE NULL END,
    NOW() - make_interval(hours => t.created_hours_ago),
    NOW() - make_interval(hours => t.created_hours_ago)
  FROM (VALUES
    -- Trade 1 (pending): offer 5 = user 1 ⇄ user 0
    (1, 5, 1, 0, 'pending',    500, 18),
    -- Trade 2 (in_transit #1): offer 6 = user 2 ⇄ user 1
    (2, 6, 2, 1, 'in_transit', 200, 36),
    -- Trade 3 (in_transit #2): offer 7 = user 3 ⇄ user 2
    (3, 7, 3, 2, 'in_transit', 0,   48),
    -- Trade 4 (completed): offer 8 = user 4 ⇄ user 3
    (4, 8, 4, 3, 'completed',  0,   96)
  ) AS t(trade_idx, offer_idx, proposer_idx, receiver_idx, status, adj, created_hours_ago)
  JOIN _seed_demo_0606_offers o ON o.offer_idx = t.offer_idx
  RETURNING id, offer_id, proposer_user_id, receiver_user_id, created_at
)
INSERT INTO _seed_demo_0606_trades (id, trade_idx, offer_idx, proposer_user_id, receiver_user_id)
SELECT
  it.id,
  ROW_NUMBER() OVER (ORDER BY it.created_at DESC) AS trade_idx,
  o.offer_idx,
  it.proposer_user_id,
  it.receiver_user_id
FROM inserted_trades it
JOIN _seed_demo_0606_offers o ON o.id = it.offer_id;

-- ─────────────────────────────────────────
-- Step 10: trade_items 8 件 INSERT (各 trade 2 件)
--   trade_items は offer_items から派生する schema (accept_offer_atomic_v3 規約)
-- ─────────────────────────────────────────

INSERT INTO public.trade_items (trade_id, card_id, owner_user_id)
SELECT
  t.id,
  c.id,
  c.owner_user_id
FROM _seed_demo_0606_trades t
JOIN _seed_demo_0606_offers o ON o.offer_idx = t.offer_idx
JOIN public.offer_items oi ON oi.offer_id = o.id
JOIN public.cards c ON c.id = oi.card_id;

-- ─────────────────────────────────────────
-- Step 11: shipments 8 件 INSERT (各 trade × 2 件、PR #9 shipping_method 適用済前提)
--   - pending trade: 両者 pending、shipping_method=NULL
--   - in_transit #1: proposer shipped (click_post + tracking) / receiver pending
--   - in_transit #2: receiver shipped (click_post + tracking) / proposer pending
--   - completed: 両者 received (yamato + tracking)
-- ─────────────────────────────────────────

INSERT INTO public.shipments (
  trade_id, user_id, status, shipping_method, tracking_number, carrier,
  shipped_at, received_at, created_at, updated_at
)
SELECT
  t.id,
  CASE s.actor_side
    WHEN 'proposer' THEN t.proposer_user_id
    WHEN 'receiver' THEN t.receiver_user_id
  END,
  s.shipment_status::shipment_status,
  s.shipping_method,
  s.tracking_number,
  s.carrier,
  CASE WHEN s.shipped_hours_ago IS NOT NULL
    THEN NOW() - make_interval(hours => s.shipped_hours_ago) ELSE NULL END,
  CASE WHEN s.received_hours_ago IS NOT NULL
    THEN NOW() - make_interval(hours => s.received_hours_ago) ELSE NULL END,
  NOW() - make_interval(hours => s.created_hours_ago),
  NOW() - make_interval(hours => s.created_hours_ago)
FROM (VALUES
  -- Trade 1 (pending): 両者 pending、shipping_method=NULL
  (1, 'proposer', 'pending'::text, NULL::text, NULL::text, NULL::text, NULL::int, NULL::int, 18),
  (1, 'receiver', 'pending',       NULL,       NULL,       NULL,       NULL,       NULL,       18),
  -- Trade 2 (in_transit #1): proposer shipped、receiver pending
  (2, 'proposer', 'shipped', 'click_post', '8000-1234-5678', '日本郵便', 12, NULL, 36),
  (2, 'receiver', 'pending', NULL,         NULL,             NULL,       NULL, NULL, 36),
  -- Trade 3 (in_transit #2): receiver shipped、proposer pending
  (3, 'proposer', 'pending', NULL,         NULL,             NULL,       NULL, NULL, 48),
  (3, 'receiver', 'shipped', 'click_post', '8000-9876-5432', '日本郵便', 18, NULL, 48),
  -- Trade 4 (completed): 両者 received
  (4, 'proposer', 'received', 'yamato', '0123-4567-8901', 'ヤマト運輸', 90, 60, 96),
  (4, 'receiver', 'received', 'yamato', '0987-6543-2109', 'ヤマト運輸', 88, 58, 96)
) AS s(trade_idx, actor_side, shipment_status, shipping_method, tracking_number, carrier,
       shipped_hours_ago, received_hours_ago, created_hours_ago)
JOIN _seed_demo_0606_trades t ON t.trade_idx = s.trade_idx;

-- ─────────────────────────────────────────
-- 確認クエリ (実行後の件数を出す)
-- ─────────────────────────────────────────

SELECT 'profiles (demo_0606)' AS kind, COUNT(*)::text AS cnt
  FROM public.profiles WHERE handle LIKE 'demo_0606_%'
UNION ALL
SELECT 'venues (demo_0606)', COUNT(*)::text
  FROM public.venues WHERE title IN (
    'TREASURE LIVE TOUR 2026 in TOKYO',
    'King & Prince Concert Tour 2026',
    'ACEs Summer Special 2026',
    'J&K Live Goods Festival 2026'
  )
UNION ALL
SELECT 'venue_checkins (demo_0606)', COUNT(*)::text
  FROM public.venue_checkins WHERE user_id IN
    (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
UNION ALL
SELECT 'cards (demo_0606)', COUNT(*)::text
  FROM public.cards WHERE description LIKE '[SEED_0606]%'
UNION ALL
SELECT 'cards by status (demo_0606)',
  'active=' || COUNT(*) FILTER (WHERE status = 'active')::text ||
  ' / reserved=' || COUNT(*) FILTER (WHERE status = 'reserved')::text ||
  ' / traded=' || COUNT(*) FILTER (WHERE status = 'traded')::text
  FROM public.cards WHERE description LIKE '[SEED_0606]%'
UNION ALL
SELECT 'venue_supply_posts (demo_0606)', COUNT(*)::text
  FROM public.venue_supply_posts WHERE user_id IN
    (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
UNION ALL
SELECT 'offers (demo_0606)', COUNT(*)::text
  FROM public.offers WHERE proposer_user_id IN
    (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
UNION ALL
SELECT 'offers by status (demo_0606)',
  'pending=' || COUNT(*) FILTER (WHERE status = 'pending')::text ||
  ' / accepted=' || COUNT(*) FILTER (WHERE status = 'accepted')::text ||
  ' / completed=' || COUNT(*) FILTER (WHERE status = 'completed')::text
  FROM public.offers WHERE proposer_user_id IN
    (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
UNION ALL
SELECT 'offer_items (demo_0606)', COUNT(*)::text
  FROM public.offer_items oi
  JOIN public.offers o ON o.id = oi.offer_id
  WHERE o.proposer_user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
UNION ALL
SELECT 'trades (demo_0606)', COUNT(*)::text
  FROM public.trades WHERE proposer_user_id IN
    (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
UNION ALL
SELECT 'trades by status (demo_0606)',
  'pending=' || COUNT(*) FILTER (WHERE status = 'pending')::text ||
  ' / in_transit=' || COUNT(*) FILTER (WHERE status = 'in_transit')::text ||
  ' / completed=' || COUNT(*) FILTER (WHERE status = 'completed')::text
  FROM public.trades WHERE proposer_user_id IN
    (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
UNION ALL
SELECT 'shipments (demo_0606)', COUNT(*)::text
  FROM public.shipments WHERE user_id IN
    (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
ORDER BY kind;

-- 期待値:
--   profiles            : 6
--   venues              : 4
--   venue_checkins      : 24
--   cards               : 25
--   cards by status     : active=17 / reserved=6 / traded=2
--   venue_supply_posts  : 8
--   offers              : 8
--   offers by status    : pending=4 / accepted=3 / completed=1
--   offer_items         : 16
--   trades              : 4
--   trades by status    : pending=1 / in_transit=2 / completed=1
--   shipments           : 8


-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (デモ終了後に実行する場合は以下をコメント解除して順次実行)
-- ═══════════════════════════════════════════════════════════════
--
-- FK 依存順 (子 → 親) で DELETE する。Step 1.5 と同じ順序。
-- profiles は 12 番目だが auth.users との整合性のため UPDATE 方式に統一。
--
-- -- 1. shipments
-- DELETE FROM public.shipments
-- WHERE user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%');
--
-- -- 2. trade_items
-- DELETE FROM public.trade_items
-- WHERE owner_user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%');
--
-- -- 3. trade_events
-- DELETE FROM public.trade_events
-- WHERE actor_user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%');
--
-- -- 4. trades
-- DELETE FROM public.trades
-- WHERE proposer_user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
--    OR receiver_user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%');
--
-- -- 5. offer_items
-- DELETE FROM public.offer_items
-- WHERE offer_id IN (
--   SELECT id FROM public.offers
--   WHERE proposer_user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
-- );
--
-- -- 6. offers
-- DELETE FROM public.offers
-- WHERE proposer_user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%');
--
-- -- 7. venue_supply_posts
-- DELETE FROM public.venue_supply_posts
-- WHERE user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%');
--
-- -- 8. venue_holds (列は proposer_id / receiver_id)
-- DELETE FROM public.venue_holds
-- WHERE proposer_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%')
--    OR receiver_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%');
--
-- -- 9. venue_checkins
-- DELETE FROM public.venue_checkins
-- WHERE user_id IN (SELECT id FROM public.profiles WHERE handle LIKE 'demo_0606_%');
--
-- -- 10. cards (demo マーカー)
-- DELETE FROM public.cards WHERE description LIKE '[SEED_0606]%';
--
-- -- 11. venues (demo 4 件)
-- DELETE FROM public.venues WHERE title IN (
--   'TREASURE LIVE TOUR 2026 in TOKYO',
--   'King & Prince Concert Tour 2026',
--   'ACEs Summer Special 2026',
--   'J&K Live Goods Festival 2026'
-- );
--
-- -- 12. profiles の demo 値をリセット (auth.users は触らない、profile レコードは残す)
-- --     注: profiles を完全 DELETE すると auth.users と整合性を失う可能性
-- --     handle / display_name のみ NULL/初期値に戻す方針推奨
-- UPDATE public.profiles SET
--   handle = NULL,
--   display_name = NULL,
--   trade_count = 0,
--   ship_rate = 100,
--   reply_median_hours = 999,
--   trouble_count = 0,
--   adjustment_avg = NULL,
--   adjustment_bias = NULL,
--   last_active_at = NULL,
--   updated_at = NOW()
-- WHERE handle LIKE 'demo_0606_%';
