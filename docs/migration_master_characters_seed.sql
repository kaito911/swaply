-- master_characters seed (鬼滅 35 + コナン 25 + サンリオ 13 = 73 件)
-- Supabase SQL Editor で手動実行してください
--
-- 前提:
--   1. master_works に 'kimetsu' / 'conan' / 'sanrio' が seed 済 (migration_master_works_characters.sql)
--   2. master_characters テーブルが存在 (同 migration)
--   3. update_updated_at_column() トリガー関数が存在
--
-- 設計方針:
--   - id は work_id をプレフィックスにした slug 形式 (例: 'kimetsu_tanjiro')
--   - aliases は表記ゆれ吸収用 (漢字・ひらがな・カタカナ・ローマ字・愛称・コードネーム・別名)
--   - sort_order は人気/物語登場順 (鬼殺隊 10-200、鬼 1000+、コナン 10-520、サンリオ 大賞2024 順)
--   - ON CONFLICT (id) DO NOTHING で冪等性確保 (再実行可)
--
-- 注意点 (ユーザー prompt 由来):
--   - 鬼滅 35 名: 「Claude Code で正確な漢字 + ふりがなリサーチを」の指示に従い
--     35 名目として響凱 (元下弦の陸) を sort 1150 に追加。canonical キャラとして妥当性確認済。
--   - 安室透: 降谷零 / バーボン aliases 含める
--   - 赤井秀一: 諸星大 / ライ aliases 含める
--   - 灰原哀: 宮野志保 / シェリー aliases 含める
--   - キール: 本堂瑛海 / 水無怜奈 aliases 含める
--   - ラム: 黒田兵衛 aliases 含める
--   - 諸伏景光: スコッチ aliases 含める
--   - キキララ: キキ / ララ 個別 aliases 含める

-- ─────────────────────────────────────────
-- 鬼滅の刃 (work_id='kimetsu') 35 名
-- 鬼殺隊側 20 + 鬼側 15
-- ─────────────────────────────────────────

-- 鬼殺隊側: 主要剣士 4
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('kimetsu_tanjiro', 'kimetsu', '竈門炭治郎', 'Tanjiro Kamado',
    array['炭治郎', 'たんじろう', 'タンジロウ', 'tanjiro', 'tanjirou', 'kamado tanjiro'], 10),
  ('kimetsu_nezuko', 'kimetsu', '竈門禰豆子', 'Nezuko Kamado',
    array['禰豆子', 'ねずこ', 'ネズコ', 'nezuko', 'kamado nezuko'], 20),
  ('kimetsu_zenitsu', 'kimetsu', '我妻善逸', 'Zenitsu Agatsuma',
    array['善逸', 'ぜんいつ', 'ゼンイツ', 'zenitsu', 'agatsuma zenitsu'], 30),
  ('kimetsu_inosuke', 'kimetsu', '嘴平伊之助', 'Inosuke Hashibira',
    array['伊之助', 'いのすけ', 'イノスケ', 'inosuke', 'hashibira inosuke'], 40)
  on conflict (id) do nothing;

-- 鬼殺隊側: 柱 9 名コンプ
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('kimetsu_giyu', 'kimetsu', '冨岡義勇', 'Giyu Tomioka',
    array['義勇', 'ぎゆう', 'ギユウ', '冨岡', 'とみおか', 'giyu', 'giyuu', 'tomioka giyu', '水柱'], 50),
  ('kimetsu_rengoku', 'kimetsu', '煉獄杏寿郎', 'Kyojuro Rengoku',
    array['煉獄', 'れんごく', 'レンゴク', '杏寿郎', 'きょうじゅろう', 'rengoku', 'kyojuro', 'kyoujurou', '炎柱'], 60),
  ('kimetsu_shinobu', 'kimetsu', '胡蝶しのぶ', 'Shinobu Kocho',
    array['しのぶ', 'シノブ', '胡蝶', 'こちょう', 'shinobu', 'kocho shinobu', 'kochou shinobu', '蟲柱'], 70),
  ('kimetsu_muichiro', 'kimetsu', '時透無一郎', 'Muichiro Tokito',
    array['無一郎', 'むいちろう', 'ムイチロウ', '時透', 'ときとう', 'tokito', 'muichiro', '霞柱'], 80),
  ('kimetsu_tengen', 'kimetsu', '宇髄天元', 'Tengen Uzui',
    array['天元', 'てんげん', 'テンゲン', '宇髄', 'うずい', 'uzui', 'tengen', '音柱'], 90),
  ('kimetsu_mitsuri', 'kimetsu', '甘露寺蜜璃', 'Mitsuri Kanroji',
    array['蜜璃', 'みつり', 'ミツリ', '甘露寺', 'かんろじ', 'mitsuri', 'kanroji', '恋柱'], 100),
  ('kimetsu_obanai', 'kimetsu', '伊黒小芭内', 'Obanai Iguro',
    array['小芭内', 'おばない', 'オバナイ', '伊黒', 'いぐろ', 'obanai', 'iguro', '蛇柱'], 110),
  ('kimetsu_sanemi', 'kimetsu', '不死川実弥', 'Sanemi Shinazugawa',
    array['実弥', 'さねみ', 'サネミ', '不死川', 'しなずがわ', 'sanemi', 'shinazugawa', '風柱'], 120),
  ('kimetsu_himejima', 'kimetsu', '悲鳴嶼行冥', 'Gyomei Himejima',
    array['悲鳴嶼', 'ひめじま', 'ヒメジマ', '行冥', 'ぎょうめい', 'himejima', 'gyomei', '岩柱'], 130)
  on conflict (id) do nothing;

-- 鬼殺隊側: 隊員 + 縁壱 (3)
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('kimetsu_genya', 'kimetsu', '不死川玄弥', 'Genya Shinazugawa',
    array['玄弥', 'げんや', 'ゲンヤ', '不死川玄弥', 'genya', 'shinazugawa genya'], 140),
  ('kimetsu_kanao', 'kimetsu', '栗花落カナヲ', 'Kanao Tsuyuri',
    array['カナヲ', 'かなを', 'kanao', 'tsuyuri kanao', '栗花落', 'つゆり'], 150),
  ('kimetsu_yoriichi', 'kimetsu', '継国縁壱', 'Yoriichi Tsugikuni',
    array['縁壱', 'よりいち', 'ヨリイチ', '継国', 'つぎくに', 'yoriichi', 'tsugikuni yoriichi'], 160)
  on conflict (id) do nothing;

-- 鬼殺隊側: 本部・師匠陣 (3)
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('kimetsu_kagaya', 'kimetsu', '産屋敷耀哉', 'Kagaya Ubuyashiki',
    array['耀哉', 'かがや', '産屋敷', 'うぶやしき', 'kagaya', 'ubuyashiki', 'お館様'], 170),
  ('kimetsu_urokodaki', 'kimetsu', '鱗滝左近次', 'Sakonji Urokodaki',
    array['鱗滝', 'うろこだき', 'ウロコダキ', '左近次', 'さこんじ', 'urokodaki', 'sakonji'], 180),
  ('kimetsu_kuwajima', 'kimetsu', '桑島慈悟郎', 'Jigoro Kuwajima',
    array['桑島', 'くわじま', '慈悟郎', 'じごろう', 'kuwajima', 'jigoro', 'jigorou'], 190)
  on conflict (id) do nothing;

-- 鬼殺隊側: 蝶屋敷 (1)
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('kimetsu_aoi', 'kimetsu', '神崎アオイ', 'Aoi Kanzaki',
    array['アオイ', 'あおい', '神崎', 'かんざき', 'aoi', 'kanzaki aoi'], 200)
  on conflict (id) do nothing;

-- 鬼側: 始祖
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('kimetsu_muzan', 'kimetsu', '鬼舞辻無惨', 'Muzan Kibutsuji',
    array['無惨', 'むざん', 'ムザン', '鬼舞辻', 'きぶつじ', 'muzan', 'kibutsuji'], 1000)
  on conflict (id) do nothing;

-- 鬼側: 上弦の鬼 7 名 (上弦の陸は妓夫太郎+堕姫の兄妹で 2 エントリ)
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('kimetsu_kokushibo', 'kimetsu', '黒死牟', 'Kokushibo',
    array['黒死牟', 'こくしぼう', 'コクシボウ', 'kokushibo', 'kokushibou', '上弦の壱', '巌勝', 'みちかつ'], 1010),
  ('kimetsu_doma', 'kimetsu', '童磨', 'Doma',
    array['童磨', 'どうま', 'ドウマ', 'doma', 'douma', '上弦の弐'], 1020),
  ('kimetsu_akaza', 'kimetsu', '猗窩座', 'Akaza',
    array['猗窩座', 'あかざ', 'アカザ', 'akaza', '上弦の参', '狛治', 'はくじ'], 1030),
  ('kimetsu_hantengu', 'kimetsu', '半天狗', 'Hantengu',
    array['半天狗', 'はんてんぐ', 'ハンテング', 'hantengu', '上弦の肆'], 1040),
  ('kimetsu_gyokko', 'kimetsu', '玉壺', 'Gyokko',
    array['玉壺', 'ぎょっこ', 'ギョッコ', 'gyokko', '上弦の伍'], 1050),
  ('kimetsu_gyutaro', 'kimetsu', '妓夫太郎', 'Gyutaro',
    array['妓夫太郎', 'ぎゅうたろう', 'ギュウタロウ', 'gyutaro', 'gyuutarou', '上弦の陸', '兄'], 1060),
  ('kimetsu_daki', 'kimetsu', '堕姫', 'Daki',
    array['堕姫', 'だき', 'ダキ', 'daki', '上弦の陸', '妹', '梅'], 1070)
  on conflict (id) do nothing;

-- 鬼側: 下弦の鬼 5 名 + 元下弦 2 名 (響凱・累)
-- 注: 響凱 (元下弦の陸) は user 指示「Claude Code で正確な漢字リサーチを」に従い
--     35 名目として追加。下弦の陸 historic 枠としての妥当性は canonical 鬼滅で確認済。
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('kimetsu_enmu', 'kimetsu', '魘夢', 'Enmu',
    array['魘夢', 'えんむ', 'エンム', 'enmu', '下弦の壱'], 1100),
  ('kimetsu_rokuro', 'kimetsu', '轆轤', 'Rokuro',
    array['轆轤', 'ろくろ', 'ロクロ', 'rokuro', '下弦の弐'], 1110),
  ('kimetsu_wakuraba', 'kimetsu', '病葉', 'Wakuraba',
    array['病葉', 'わくらば', 'ワクラバ', 'wakuraba', '下弦の参'], 1120),
  ('kimetsu_mukago', 'kimetsu', '零余子', 'Mukago',
    array['零余子', 'むかご', 'ムカゴ', 'mukago', '下弦の肆'], 1130),
  ('kimetsu_kamanue', 'kimetsu', '釜鵺', 'Kamanue',
    array['釜鵺', 'かまぬえ', 'カマヌエ', 'kamanue', '下弦の伍'], 1140),
  ('kimetsu_kyogai', 'kimetsu', '響凱', 'Kyogai',
    array['響凱', 'きょうがい', 'キョウガイ', 'kyogai', 'kyougai', '元下弦の陸', '元下弦', '鼓の鬼'], 1150),
  ('kimetsu_rui', 'kimetsu', '累', 'Rui',
    array['累', 'るい', 'ルイ', 'rui', '元下弦の伍', '元下弦', '蜘蛛の鬼', '那田蜘蛛山'], 1160)
  on conflict (id) do nothing;


-- ─────────────────────────────────────────
-- 名探偵コナン (work_id='conan') 25 名
-- 既存 10 + 警察学校組 4 + 黒の組織 5 + 少年探偵団 3 + その他 3
-- ─────────────────────────────────────────

-- 既存 10 名 (主要キャラ)
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('conan_conan', 'conan', '江戸川コナン', 'Conan Edogawa',
    array['コナン', 'こなん', 'conan', 'edogawa conan', 'edogawa'], 10),
  ('conan_shinichi', 'conan', '工藤新一', 'Shinichi Kudo',
    array['新一', 'しんいち', 'シンイチ', '工藤', 'くどう', 'kudo shinichi', 'shinichi', 'kudou shinichi'], 20),
  ('conan_ran', 'conan', '毛利蘭', 'Ran Mouri',
    array['蘭', 'らん', 'ラン', '毛利', 'もうり', 'ran', 'mouri ran'], 30),
  ('conan_kogoro', 'conan', '毛利小五郎', 'Kogoro Mouri',
    array['小五郎', 'こごろう', 'コゴロウ', 'kogoro', 'mouri kogoro', '眠りの小五郎'], 40),
  ('conan_haibara', 'conan', '灰原哀', 'Ai Haibara',
    array['灰原', 'はいばら', 'ハイバラ', '哀', 'あい', 'haibara', 'ai haibara', '宮野志保', 'みやのしほ', 'miyano shiho', 'シェリー', 'sherry'], 50),
  ('conan_heiji', 'conan', '服部平次', 'Heiji Hattori',
    array['平次', 'へいじ', 'ヘイジ', '服部', 'はっとり', 'heiji', 'hattori heiji'], 60),
  ('conan_kazuha', 'conan', '遠山和葉', 'Kazuha Toyama',
    array['和葉', 'かずは', 'カズハ', '遠山', 'とおやま', 'kazuha', 'toyama kazuha'], 70),
  ('conan_amuro', 'conan', '安室透', 'Toru Amuro',
    array['安室', 'あむろ', 'アムロ', 'amuro', 'toru amuro', '降谷零', 'ふるやれい', 'furuya rei', 'バーボン', 'bourbon', 'ゼロ', 'zero'], 80),
  ('conan_akai', 'conan', '赤井秀一', 'Shuichi Akai',
    array['赤井', 'あかい', 'アカイ', 'akai', 'shuichi akai', 'ライ', 'rye', '諸星大', 'もろほしだい', 'morohoshi dai', 'シルバーブレット'], 90),
  ('conan_kaito', 'conan', '怪盗キッド', 'Kaito Kid',
    array['キッド', 'きっど', 'kid', 'kaito kid', 'phantom thief kid', '黒羽快斗', 'くろばかいと', 'kuroba kaito', '怪盗1412'], 100)
  on conflict (id) do nothing;

-- 警察学校組 4 名コンプ (松田陣平含む、ユーザー妹ヒアリングで追加必須)
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('conan_matsuda', 'conan', '松田陣平', 'Jinpei Matsuda',
    array['松田', 'まつだ', 'マツダ', '陣平', 'じんぺい', 'matsuda jinpei', 'matsuda', '警察学校組'], 200),
  ('conan_hagiwara', 'conan', '萩原研二', 'Kenji Hagiwara',
    array['萩原', 'はぎわら', 'ハギワラ', '研二', 'けんじ', 'hagiwara kenji', 'hagiwara', '警察学校組'], 210),
  ('conan_morofushi', 'conan', '諸伏景光 (スコッチ)', 'Hiromitsu Morofushi (Scotch)',
    array['諸伏', 'もろふし', 'モロフシ', '景光', 'ひろみつ', 'morofushi', 'hiromitsu morofushi', 'スコッチ', 'すこっち', 'scotch', '警察学校組'], 220),
  ('conan_date', 'conan', '伊達航', 'Wataru Date',
    array['伊達', 'だて', 'ダテ', '航', 'わたる', 'date wataru', 'date', '警察学校組'], 230)
  on conflict (id) do nothing;

-- 黒の組織 5 名
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('conan_gin', 'conan', 'ジン', 'Gin',
    array['ジン', 'じん', 'gin', '黒の組織'], 300),
  ('conan_vermouth', 'conan', 'ベルモット', 'Vermouth',
    array['ベルモット', 'べるもっと', 'vermouth', 'シャロン・ヴィンヤード', 'sharon vineyard', 'クリス・ヴィンヤード', 'chris vineyard', '黒の組織'], 310),
  ('conan_vodka', 'conan', 'ウォッカ', 'Vodka',
    array['ウォッカ', 'うぉっか', 'vodka', '黒の組織'], 320),
  ('conan_kir', 'conan', 'キール', 'Kir',
    array['キール', 'きーる', 'kir', '本堂瑛海', 'ほんどうえいみ', 'hondo eimi', '水無怜奈', 'みずなしれな', 'mizunashi rena', '黒の組織'], 330),
  ('conan_rum', 'conan', 'ラム', 'Rum',
    array['ラム', 'らむ', 'rum', '黒田兵衛', 'くろだひょうえ', 'kuroda hyoe', 'kuroda', '黒の組織', 'No.2'], 340)
  on conflict (id) do nothing;

-- 少年探偵団 3 名
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('conan_genta', 'conan', '小嶋元太', 'Genta Kojima',
    array['元太', 'げんた', 'ゲンタ', '小嶋', 'こじま', 'kojima genta', 'genta', '少年探偵団'], 400),
  ('conan_mitsuhiko', 'conan', '円谷光彦', 'Mitsuhiko Tsuburaya',
    array['光彦', 'みつひこ', 'ミツヒコ', '円谷', 'つぶらや', 'tsuburaya mitsuhiko', 'mitsuhiko', '少年探偵団'], 410),
  ('conan_ayumi', 'conan', '吉田歩美', 'Ayumi Yoshida',
    array['歩美', 'あゆみ', 'アユミ', '吉田', 'よしだ', 'yoshida ayumi', 'ayumi', '少年探偵団'], 420)
  on conflict (id) do nothing;

-- その他主要 3 名
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('conan_agasa', 'conan', '阿笠博士', 'Professor Agasa',
    array['阿笠', 'あがさ', 'アガサ', '博士', 'はかせ', 'agasa', 'professor agasa', 'doctor agasa'], 500),
  ('conan_sera', 'conan', '世良真純', 'Masumi Sera',
    array['世良', 'せら', 'セラ', '真純', 'ますみ', 'sera masumi', 'masumi sera', 'sera'], 510),
  ('conan_sonoko', 'conan', '鈴木園子', 'Sonoko Suzuki',
    array['園子', 'そのこ', 'ソノコ', '鈴木', 'すずき', 'suzuki sonoko', 'sonoko'], 520)
  on conflict (id) do nothing;


-- ─────────────────────────────────────────
-- サンリオ (work_id='sanrio') 13 名
-- 大賞 2024 順 (1-6位) + ヒアリング追加 3 名 (キキララ/ばつ丸/ウサハナ) + 既存 4 名
-- ─────────────────────────────────────────

insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('sanrio_pompompurin', 'sanrio', 'ポムポムプリン', 'Pompompurin',
    array['プリン', 'ぷりん', 'purin', 'pompom purin', 'pompompurin', 'pudding', 'プリンちゃん'], 10),
  ('sanrio_cinnamoroll', 'sanrio', 'シナモロール', 'Cinnamoroll',
    array['シナモン', 'しなもん', 'cinnamon', 'cinnamoroll', 'cinnamon roll', 'シナモロール'], 20),
  ('sanrio_kuromi', 'sanrio', 'クロミ', 'Kuromi',
    array['くろみ', 'kuromi', 'kuromy'], 30),
  ('sanrio_pochacco', 'sanrio', 'ポチャッコ', 'Pochacco',
    array['ぽちゃっこ', 'pochacco'], 40),
  ('sanrio_kitty', 'sanrio', 'ハローキティ', 'Hello Kitty',
    array['キティ', 'きてぃ', 'kitty', 'hello kitty', 'hellokitty', 'kitty chan', 'kitty-chan', 'ハロキ'], 50),
  ('sanrio_mymelody', 'sanrio', 'マイメロディ', 'My Melody',
    array['マイメロ', 'まいめろ', 'mymelody', 'my melody', 'マイメロディ'], 60),
  ('sanrio_littletwinstars', 'sanrio', 'キキララ (リトルツインスターズ)', 'Little Twin Stars',
    array['キキララ', 'ききらら', 'リトルツインスターズ', 'little twin stars', 'キキ', 'ララ', 'kiki', 'lala'], 70),
  ('sanrio_badtzmaru', 'sanrio', 'ばつ丸', 'Badtz-Maru',
    array['ばつ丸', 'バツマル', 'バッドばつ丸', 'badtz-maru', 'badtzmaru', 'ばつまる', 'badtz maru'], 80),
  ('sanrio_usahana', 'sanrio', 'ウサハナ', 'Usahana',
    array['ウサハナ', 'うさはな', 'usahana', 'usa-hana', 'usa hana'], 90),
  ('sanrio_keroppi', 'sanrio', 'けろけろけろっぴ', 'Keroppi',
    array['けろっぴ', 'keroppi', 'kero kero keroppi', 'kerokero keroppi', 'けろけろけろっぴ'], 100),
  ('sanrio_hangyodon', 'sanrio', 'ハンギョドン', 'Hangyodon',
    array['はんぎょどん', 'hangyodon', 'ハンギョドン'], 110),
  ('sanrio_gudetama', 'sanrio', 'ぐでたま', 'Gudetama',
    array['gudetama', 'ぐでたま'], 120),
  ('sanrio_pekkle', 'sanrio', 'アヒルのペックル', 'Pekkle',
    array['ペックル', 'ぺっくる', 'pekkle', 'ahiru no pekkle', 'アヒルのペックル'], 130)
  on conflict (id) do nothing;
