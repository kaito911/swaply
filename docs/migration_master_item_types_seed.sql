-- master_item_types seed (anime 13 + idol 5 + character 5 + その他 = 23 件)
-- Supabase SQL Editor で手動実行してください
--
-- 前提:
--   1. master_item_types テーブルが存在 (migration_master_item_types.sql)
--   2. update_updated_at_column() トリガー関数が存在
--
-- 設計方針:
--   - id は slug 形式 (例: 'acrylic_stand', 'gacha_capsule')
--   - aliases は表記ゆれ吸収用 (日本語・英語・略称・誤記吸収)
--   - sort_order は category 別 (anime: 10-130 / idol: 200-240 / character: 300-340 / other: 999)
--   - category_hint は主な使用カテゴリのヒント (anime/idol/character/manga/other or NULL)
--   - is_active=true で運用、廃止時は false に切替 (削除しない、運用ログ保持)
--   - ON CONFLICT (id) DO NOTHING で冪等性確保
--
-- ★ ガチャガチャ (gacha_capsule) はユーザー指示「今熱い」で重点扱い、anime category 内 sort 50

-- ─────────────────────────────────────────
-- アニメ系 13 値 (sort 10-130、anime category)
-- ─────────────────────────────────────────
insert into public.master_item_types (id, display_name_ja, display_name_en, aliases, category_hint, sort_order) values
  ('acrylic_stand',     'アクリルスタンド', 'Acrylic Stand',
    array['アクスタ', 'アクリル', 'acrylic', 'acrylic stand', 'acstand', 'アクリルスタンド'], 'anime', 10),
  ('can_badge',         '缶バッジ',         'Can Badge',
    array['バッジ', '缶バッジ', 'can badge', 'かんばっじ', 'badge'], 'anime', 20),
  ('acrylic_keychain',  'アクリルキーホルダー', 'Acrylic Keychain',
    array['アクキー', 'アクリルキーホルダー', 'acrylic keychain', 'acrylic key chain'], 'anime', 30),
  ('keychain',          'キーホルダー',     'Keychain',
    array['キーホルダー', 'キーチェーン', 'key chain', 'keychain'], 'anime', 40),
  ('gacha_capsule',     'ガチャガチャ',     'Gacha Capsule Toy',
    array['ガチャ', 'カプセルトイ', 'gacha', 'gachapon', 'capsule toy', 'ガチャポン', 'ガシャ', 'ガシャポン'], 'anime', 50),
  ('ichiban_kuji',      '一番くじ',         'Ichiban Kuji',
    array['くじ', 'kuji', 'ichiban kuji', 'bandai kuji', 'いちばんくじ'], 'anime', 60),
  ('clear_file',        'クリアファイル',   'Clear File',
    array['クリアファイル', 'clear file', 'クリファ'], 'anime', 70),
  ('sticker',           'ステッカー',       'Sticker',
    array['シール', 'sticker', 'すてっかー', 'ステッカー'], 'anime', 80),
  ('plush',             'ぬいぐるみ',       'Plush',
    array['ぬい', 'plush', 'plushie', 'nuigurumi', 'ぬいぐるみ'], 'anime', 90),
  ('plush_outfit',      'ぬい服',           'Plush Outfit',
    array['ぬい服', 'plush outfit', 'plushie outfit', 'ぬいふく'], 'anime', 100),
  ('figure',            'フィギュア',       'Figure',
    array['figure', 'figurine', 'フィギュア'], 'anime', 110),
  ('tapestry',          'タペストリー',     'Tapestry',
    array['タペストリー', 'tapestry', 'タペ'], 'anime', 120),
  ('poster',            'ポスター・ポストカード', 'Poster / Postcard',
    array['ポスター', 'poster', 'ポストカード', 'postcard', 'ポスカ'], 'anime', 130)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- アイドル系 5 値 (sort 200-240、idol category)
-- ─────────────────────────────────────────
insert into public.master_item_types (id, display_name_ja, display_name_en, aliases, category_hint, sort_order) values
  ('trading_card',  'トレカ',         'Trading Card',
    array['トレカ', 'trading card', 'トレーディングカード', 'tcg'], 'idol', 200),
  ('photo_card',    'フォトカード',   'Photo Card',
    array['フォトカ', 'フォトカード', 'photo card', 'pc', 'photocard'], 'idol', 210),
  ('penlight',      'ペンライト',     'Penlight',
    array['ペンラ', 'penlight', 'ペンライト'], 'idol', 220),
  ('photobook',     '写真集',         'Photobook',
    array['フォトブック', 'photobook', '写真集', 'photo book'], 'idol', 230),
  ('uchiwa',        'うちわ',         'Uchiwa',
    array['うちわ', 'uchiwa', 'ウチワ'], 'idol', 240)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- キャラ系 5 値 (sort 300-340、character category)
-- ─────────────────────────────────────────
insert into public.master_item_types (id, display_name_ja, display_name_en, aliases, category_hint, sort_order) values
  ('stationery',  'ステーショナリー',     'Stationery',
    array['文房具', 'stationery', 'ペン', 'ノート', 'ステーショナリー'], 'character', 300),
  ('mug_cup',     'マグカップ',           'Mug',
    array['マグ', 'mug', 'マグカップ', 'cup', 'コップ'], 'character', 310),
  ('towel',       'タオル・ハンカチ',     'Towel / Handkerchief',
    array['タオル', 'ハンカチ', 'towel', 'handkerchief', 'てぬぐい'], 'character', 320),
  ('accessory',   'アクセサリー',         'Accessory',
    array['アクセ', 'accessory', 'ピアス', 'ネックレス', 'リング', 'ブレスレット', 'アクセサリー'], 'character', 330),
  ('pouch_bag',   'ポーチ・バッグ',       'Pouch / Bag',
    array['ポーチ', 'バッグ', 'pouch', 'bag', 'tote', 'トート'], 'character', 340)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- その他 1 値 (sort 999、category_hint=NULL でカテゴリ横断)
-- ─────────────────────────────────────────
insert into public.master_item_types (id, display_name_ja, display_name_en, aliases, category_hint, sort_order) values
  ('other', 'その他', 'Other',
    array['その他', 'other', 'etc', 'misc'], null, 999)
  on conflict (id) do nothing;
