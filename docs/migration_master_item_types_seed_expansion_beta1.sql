-- master_item_types seed 拡張案 (β1 向け、11 件追加)
-- ⚠️ 本ファイルはローカル seed 案。**Dashboard / Supabase 実体に適用しないでください。**
-- 適用は別途運営判断 + 既存 24 件との重複再チェック後。
--
-- 背景:
--   - 既存 master_item_types seed (migration_master_item_types_seed.sql) は 24 件
--     (anime 13 + idol 5 + character 5 + other 1)
--   - β1 検証で「ラントレ / 生写真 / 特典 / 会場グッズ / ランダム封入グッズ / カード /
--     ブロマイド / チェキ / アクリルカード / クリアカード / コースター」が候補に出ない
--   - 出品作成画面の items.tsx は本 PR (feat/listing-creation-broaden) で
--     category_hint フィルタを撤廃済 → 全 master_item_types から候補表示
--   - サジェスト網羅性向上のため本 seed 案を残す
--
-- 既存 seed との重複確認 (本 seed で追加しないもの):
--   - ステッカー: 既存 `sticker` (sort 80、anime) で対応済
--   - ポストカード: 既存 `poster` (sort 130、display_name「ポスター・ポストカード」、
--     aliases に 'ポスカ' / 'postcard') で対応済
--
-- 既存と意味が近いが分離追加するもの:
--   - `card` (カード、汎用): 既存 `trading_card` (idol 系トレカ) と並列、
--     anime/character 系の「カード」総称として独立 ID
--   - `acrylic_card` (アクリルカード): 既存 `acrylic_stand` (アクスタ) とは別物
--     (アクリル素材のカード型グッズ、近年増加)
--
-- 前提:
--   - master_item_types テーブルが存在 (migration_master_item_types.sql)
--   - schema: id TEXT PK / display_name_ja / display_name_en / aliases TEXT[]
--           / category_hint TEXT (CHECK 5 値 + NULL) / sort_order / is_active
--           / created_at / updated_at
--   - CHECK 制約: category_hint IS NULL OR IN ('anime','idol','character','manga','other')
--
-- 設計方針:
--   - sort_order: 既存と衝突しないよう既存 anime/idol/character 末尾以降に追加
--     idol 系追加: 245-260 (既存 200-240 のすぐ後)
--     NULL 汎用追加: 800-920 (既存 999 'other' との中間)
--   - 全件 ON CONFLICT (id) DO NOTHING で冪等性確保 (既存 24 件は変更しない)
--   - aliases は表記揺れ吸収 (略称・カナ・英語・誤記、ひらがな/カタカナ両方)
--   - is_active は default TRUE で挿入

-- ─────────────────────────────────────────
-- idol 系追加 (sort 245-260)
-- 既存 sort 200-240: trading_card / photo_card / penlight / photobook / uchiwa
-- ─────────────────────────────────────────
insert into public.master_item_types (id, display_name_ja, display_name_en, aliases, category_hint, sort_order) values
  ('raw_photo',           '生写真',         'Raw Photo',
    array['生写真', 'なまじゃしん', 'なましゃしん', 'raw photo', 'photo', '生写', 'なましゃ'],
    'idol', 245),
  ('random_trading_card', 'ラントレ',       'Random Trading Card',
    array['ラントレ', 'らんとれ', 'random trading card', 'ランダムトレカ', 'ランダムトレーディングカード'],
    'idol', 250),
  ('bromide',             'ブロマイド',     'Bromide',
    array['ブロマイド', 'ぶろまいど', 'bromide', 'ブロマ'],
    'idol', 255),
  ('cheki',               'チェキ',         'Cheki / Instax',
    array['チェキ', 'ちぇき', 'cheki', 'instax', 'インスタックス', 'ポラロイド'],
    'idol', 260)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- 汎用カード系追加 (sort 800-820、category_hint=NULL でジャンル横断)
-- ─────────────────────────────────────────
insert into public.master_item_types (id, display_name_ja, display_name_en, aliases, category_hint, sort_order) values
  ('card',          'カード',         'Card',
    array['カード', 'card', 'カード一般', 'cards'],
    null, 800),
  ('acrylic_card',  'アクリルカード', 'Acrylic Card',
    array['アクリルカード', 'acrylic card', 'アクカ', 'あくか', 'acrycard'],
    null, 810),
  ('clear_card',    'クリアカード',   'Clear Card',
    array['クリアカード', 'clear card', 'クリカ', 'くりか'],
    null, 820),
  ('coaster',       'コースター',     'Coaster',
    array['コースター', 'coaster', 'こーすたー'],
    null, 830)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- 汎用イベント / 特典系追加 (sort 900-920、category_hint=NULL でジャンル横断)
-- ─────────────────────────────────────────
insert into public.master_item_types (id, display_name_ja, display_name_en, aliases, category_hint, sort_order) values
  ('bonus_item',       '特典',                 'Bonus Item',
    array['特典', 'とくてん', 'bonus', 'tokuten', 'bonus item', '購入特典', '応募特典'],
    null, 900),
  ('venue_goods',      '会場グッズ',           'Venue Goods',
    array['会場グッズ', '会場限定', 'venue goods', 'event exclusive', 'event goods', 'kaijou', '会場'],
    null, 910),
  ('random_pack_item', 'ランダム封入グッズ',   'Random Pack Item',
    array['ランダム封入', 'ランダム', 'random pack', 'blind', 'ブラインド', '封入', 'ランダム封入グッズ'],
    null, 920)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- 確認クエリ (適用後の seed 件数を出す)
-- ─────────────────────────────────────────
-- select category_hint, count(*) as cnt
-- from public.master_item_types
-- group by category_hint order by category_hint nulls last;
-- 期待値 (既存 24 件 + 本 seed 11 件):
--   anime:     13 件 (既存、変更なし)
--   idol:       5 (既存: trading_card/photo_card/penlight/photobook/uchiwa)
--             + 4 (追加: raw_photo/random_trading_card/bromide/cheki)
--             = 9 件
--   character:  5 件 (既存、変更なし)
--   other:      0 件 (既存、character 系の other は category_hint=NULL 扱い)
--   NULL:       1 (既存: other)
--             + 7 (追加: card/acrylic_card/clear_card/coaster/bonus_item/
--                  venue_goods/random_pack_item)
--             = 8 件
--   合計:      35 件 (既存 24 + 追加 11)

-- ─────────────────────────────────────────
-- 適用ガイド (Dashboard 適用時)
-- ─────────────────────────────────────────
-- 1. 運営判断 + master_works seed expansion (migration_master_works_seed_expansion_beta1.sql) と
--    並行 or 個別に適用判断
-- 2. Supabase SQL Editor で全文実行
-- 3. ON CONFLICT (id) DO NOTHING のため、既存 24 件は無変更
-- 4. 適用後、aliases に追加すべき単語 (新略称・誤記) は別 migration で更新
-- 5. items.tsx (本 PR で category_hint フィルタ撤廃済) と組み合わせると、
--    autocomplete で 35 件全件から検索入力で絞り込める
