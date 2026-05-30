-- master_works seed 拡張案 (β1 向け、≈ 50 件追加)
-- ⚠️ 本ファイルはローカル seed 案。**Dashboard / Supabase 実体に適用しないでください。**
-- 適用判断は別途運営判断 + 著作権リスク確認後 (refactor_plan §3.13 IP 弁護士相談を通過したもののみ)。
--
-- 背景:
--   - 既存 master_works seed (migration_master_works_characters.sql:54-63) は 3 件のみ
--     (kimetsu / conan / sanrio)
--   - 出品作成画面の作品/グループ選択肢が β1 検証で狭すぎる
--   - app/listing/new/work.tsx は autocomplete + 自由入力 fallback に対応済 (本 PR 同梱)
--   - サジェスト候補を増やすために本 seed 案を残す
--
-- 適用条件:
--   1. IP 著作権リスク確認 (refactor_plan §3.13、特にサンリオ等の厳格 IP 基準を満たすか)
--   2. 弁護士相談 1 回 (β 着手前必須項目 #13)
--   3. 運営承認 (誰の責任で seed を投入するか明確化)
--   4. 既存 3 件 (kimetsu / conan / sanrio) との衝突確認 → ON CONFLICT (id) DO NOTHING で保護
--
-- 前提:
--   - master_works テーブルが存在 (migration_master_works_characters.sql:22-33)
--   - schema: id TEXT PK / display_name_ja TEXT NOT NULL / display_name_en TEXT
--           / aliases TEXT[] NOT NULL DEFAULT '{}' / category TEXT (CHECK 5 値)
--           / sort_order INTEGER NOT NULL DEFAULT 0 / created_at / updated_at
--   - category CHECK 制約: 'anime' | 'idol' | 'character' | 'manga' | 'other' の 5 値固定
--
-- 設計方針:
--   - id は既存命名規則に合わせた snake_case slug (英数 + underscore)
--   - 日本語固有名詞 (鬼滅、コナン、サンリオ) は romaji 変換 (既存と同形式)
--   - aliases は表記ゆれ吸収用 (略称・カタカナ・英語・誤記)
--   - sort_order: 既存 10/20/30 と衝突しないよう 100+ から開始、category 内で sub-grouping
--   - 全件 ON CONFLICT (id) DO NOTHING で冪等性確保 (既存 3 件は変更しない)
--   - 2.5次元舞台 / VTuber は category='other' に集約 (CHECK 制約 5 値内に収める)

-- ─────────────────────────────────────────
-- アニメ / 漫画 / ゲーム系 (sort 100-200、category='anime')
-- ─────────────────────────────────────────
insert into public.master_works (id, display_name_ja, display_name_en, aliases, category, sort_order) values
  ('haikyu', 'ハイキュー!!', 'Haikyuu',
    array['ハイキュー', 'haikyu', 'haikyuu', 'はいきゅう'],
    'anime', 105),
  ('blue_lock', 'ブルーロック', 'Blue Lock',
    array['ブルロ', 'blue lock', 'bluelock', 'ブルーロック'],
    'anime', 110),
  ('jujutsu_kaisen', '呪術廻戦', 'Jujutsu Kaisen',
    array['呪術', 'じゅじゅつ', 'jujutsu', 'jjk', 'kaisen'],
    'anime', 115),
  ('tokyo_revengers', '東京リベンジャーズ', 'Tokyo Revengers',
    array['東リベ', '東京リベンジャーズ', 'tokyorevengers', 'tokyo revengers'],
    'anime', 120),
  ('my_hero_academia', '僕のヒーローアカデミア', 'My Hero Academia',
    array['ヒロアカ', 'my hero academia', 'mha', 'bnha', 'ヒロアカ'],
    'anime', 125),
  ('one_piece', 'ONE PIECE', 'One Piece',
    array['ワンピース', 'ワンピ', 'one piece', 'onepiece'],
    'anime', 130),
  ('chainsaw_man', 'チェンソーマン', 'Chainsaw Man',
    array['チェンソー', 'chainsaw man', 'chainsawman'],
    'anime', 135),
  ('spy_family', 'SPY×FAMILY', 'Spy x Family',
    array['スパイファミリー', 'spy family', 'spyxfamily', 'spy x family'],
    'anime', 140),
  ('attack_on_titan', '進撃の巨人', 'Attack on Titan',
    array['進撃', 'しんげき', 'aot', 'attack on titan', 'snk', 'shingeki'],
    'anime', 145),
  ('gintama', '銀魂', 'Gintama',
    array['銀魂', 'ぎんたま', 'gintama'],
    'anime', 150),
  ('kuroko_no_basket', '黒子のバスケ', 'Kuroko no Basket',
    array['黒バス', 'くろばす', 'kuroko', 'kuroko no basket', 'knb'],
    'anime', 155),
  ('tennis_no_oujisama', 'テニスの王子様', 'Prince of Tennis',
    array['テニプリ', 'てにぷり', 'tennis no oujisama', 'pot', 'prince of tennis'],
    'anime', 160),
  ('free_iwatobi', 'Free!', 'Free! Iwatobi Swim Club',
    array['free', 'iwatobi', 'フリー', 'free iwatobi'],
    'anime', 165),
  ('utapri', 'うたの☆プリンスさまっ♪', 'Uta no Prince-sama',
    array['うたプリ', 'utapri', 'うたのプリンスさま'],
    'anime', 170),
  ('idolish7', 'アイドリッシュセブン', 'IDOLiSH7',
    array['アイナナ', 'i7', 'idolish7', 'アイドリッシュセブン'],
    'anime', 175),
  ('ensemble_stars', 'あんさんぶるスターズ!!', 'Ensemble Stars',
    array['あんスタ', 'ensemble stars', 'enstars', 'es'],
    'anime', 180),
  ('hypnosis_mic', 'ヒプノシスマイク', 'Hypnosis Mic',
    array['ヒプマイ', 'hypmic', 'hypnosis mic', 'hypnosismic'],
    'anime', 185),
  ('project_sekai', 'プロジェクトセカイ', 'Project Sekai',
    array['プロセカ', 'project sekai', 'projectsekai', 'pjsekai'],
    'anime', 190)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- アイドル / K-POP / J-POP (sort 200-400、category='idol')
-- ─────────────────────────────────────────
insert into public.master_works (id, display_name_ja, display_name_en, aliases, category, sort_order) values
  -- K-POP (sort 200-310)
  ('treasure', 'TREASURE', 'TREASURE',
    array['treasure', 'トレジャー', 'とれじゃー', 'トゥメ', 'tmrw'],
    'idol', 200),
  ('seventeen', 'SEVENTEEN', 'SEVENTEEN',
    array['seventeen', 'svt', 'セブチ', 'せぶちー', 'carat'],
    'idol', 210),
  ('bts', 'BTS', 'BTS',
    array['bts', '防弾少年団', 'バンタン', 'army', 'bangtan'],
    'idol', 220),
  ('enhypen', 'ENHYPEN', 'ENHYPEN',
    array['enhypen', 'エンハイプン', 'engene', 'エナイプン'],
    'idol', 230),
  ('stray_kids', 'Stray Kids', 'Stray Kids',
    array['stray kids', 'straykids', 'skz', 'スキズ', 'すきっず'],
    'idol', 240),
  ('txt', 'TOMORROW X TOGETHER', 'TOMORROW X TOGETHER',
    array['txt', 'tomorrow x together', 'トゥバ', 'moa'],
    'idol', 250),
  ('zerobaseone', 'ZEROBASEONE', 'ZEROBASEONE',
    array['zerobaseone', 'zb1', 'ゼベワン', 'zerobase one'],
    'idol', 260),
  ('nct', 'NCT', 'NCT',
    array['nct', 'nct dream', 'nct127', 'nctdream', 'czennie'],
    'idol', 270),
  ('ateez', 'ATEEZ', 'ATEEZ',
    array['ateez', 'エイティーズ', 'atiny'],
    'idol', 280),
  ('twice', 'TWICE', 'TWICE',
    array['twice', 'トゥワイス', 'once', 'ワンス'],
    'idol', 290),
  ('le_sserafim', 'LE SSERAFIM', 'LE SSERAFIM',
    array['le sserafim', 'lesserafim', 'ルセラフィム', 'fearnot'],
    'idol', 300),
  ('newjeans', 'NewJeans', 'NewJeans',
    array['newjeans', 'ニュージーンズ', 'bunnies', 'tokki'],
    'idol', 310),
  ('ive', 'IVE', 'IVE',
    array['ive', 'アイヴ', 'dive'],
    'idol', 320),
  ('aespa', 'aespa', 'aespa',
    array['aespa', 'エスパ', 'my'],
    'idol', 330),
  -- J-POP (sort 350-410)
  ('snow_man', 'Snow Man', 'Snow Man',
    array['snow man', 'snowman', 'すのまん', 'スノーマン'],
    'idol', 350),
  ('sixtones', 'SixTONES', 'SixTONES',
    array['sixtones', 'すとーんず', 'sixtones', 'sztn'],
    'idol', 360),
  ('naniwa_danshi', 'なにわ男子', 'Naniwa Danshi',
    array['なにわ', 'naniwa danshi', 'なにわだんし', '浪花男子'],
    'idol', 370),
  ('king_and_prince', 'King & Prince', 'King & Prince',
    array['king and prince', 'キンプリ', 'king & prince', 'kingandprince'],
    'idol', 380),
  ('timelesz', 'timelesz', 'timelesz',
    array['timelesz', 'タイムレス', 'タイムレズ'],
    'idol', 390),
  ('ini', 'INI', 'INI',
    array['ini', 'アイエヌアイ', 'mini'],
    'idol', 400),
  ('jo1', 'JO1', 'JO1',
    array['jo1', 'ジェイオーワン', 'jam'],
    'idol', 410)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- キャラクター / ファンシー系 (sort 500-560、category='character')
-- ⚠️ サンリオは既存 sort 30、衝突しないよう 500 番台以降に追加
-- ─────────────────────────────────────────
insert into public.master_works (id, display_name_ja, display_name_en, aliases, category, sort_order) values
  ('chiikawa', 'ちいかわ', 'Chiikawa',
    array['ちいかわ', 'chiikawa', 'ちいかわ'],
    'character', 500),
  ('sumikko_gurashi', 'すみっコぐらし', 'Sumikko Gurashi',
    array['すみっこ', 'sumikko', 'sumikko gurashi', 'すみっこぐらし'],
    'character', 510),
  ('disney', 'ディズニー', 'Disney',
    array['disney', 'ディズニー', 'でぃずにー'],
    'character', 520),
  ('pokemon', 'ポケモン', 'Pokémon',
    array['pokemon', 'ポケモン', 'ぽけもん', 'pokémon'],
    'character', 530),
  ('kirby', 'カービィ', 'Kirby',
    array['kirby', 'カービィ', 'かーびぃ'],
    'character', 540),
  ('rilakkuma', 'リラックマ', 'Rilakkuma',
    array['rilakkuma', 'リラックマ', 'りらっくま'],
    'character', 550)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- 2.5次元 / 舞台 (sort 600-680、category='other')
-- ⚠️ CHECK 制約 5 値内のため 'other' に集約 (将来 'stage' 等の値追加検討は別タスク)
-- ─────────────────────────────────────────
insert into public.master_works (id, display_name_ja, display_name_en, aliases, category, sort_order) values
  ('touken_ranbu', '刀剣乱舞', 'Touken Ranbu',
    array['とうらぶ', 'touken ranbu', 'toukenranbu', '刀剣乱舞'],
    'other', 600),
  ('touken_ranbu_musical', '刀ミュ', 'Touken Ranbu Musical',
    array['刀ミュ', 'とうみゅ', 'touken musical', '刀剣乱舞ミュージカル'],
    'other', 610),
  ('touken_ranbu_stage', '刀ステ', 'Touken Ranbu Stage',
    array['刀ステ', 'とうすて', 'touken stage', '刀剣乱舞ステージ'],
    'other', 620),
  ('tenimyu', 'テニミュ', 'Tennis Musical',
    array['テニミュ', 'てにみゅ', 'tenimyu', 'tennis musical'],
    'other', 630),
  ('hypmic_stage', 'ヒプステ', 'Hypnosis Mic Stage',
    array['ヒプステ', 'hypstage', 'hypnosis mic stage'],
    'other', 640),
  ('a3_stage', 'エーステ', 'A3 Stage',
    array['エーステ', 'a3 stage', 'a3stage', 'mankai']
    , 'other', 650)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- VTuber / 配信者 (sort 700-730、category='other')
-- ─────────────────────────────────────────
insert into public.master_works (id, display_name_ja, display_name_en, aliases, category, sort_order) values
  ('nijisanji', 'にじさんじ', 'Nijisanji',
    array['nijisanji', 'にじさんじ', 'にじ', 'anycolor'],
    'other', 700),
  ('hololive', 'ホロライブ', 'Hololive',
    array['hololive', 'ホロライブ', 'ホロ', 'cover'],
    'other', 710),
  ('vspo', 'ぶいすぽっ！', 'V-Spo',
    array['vspo', 'ぶいすぽ', 'ぶいすぽっ', 'v-spo', 'v spo'],
    'other', 720)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- 確認クエリ (適用後の seed 件数を出す)
-- ─────────────────────────────────────────
-- select category, count(*) as cnt from public.master_works group by category order by category;
-- 期待値 (既存 3 件 + 本 seed):
--   anime:     1 (kimetsu) + 17 (haikyu/blue_lock/...) + 1 (conan、既存) = 19 件
--     ※ kimetsu = anime / conan = anime / 計 19
--   idol:      21 件 (TREASURE / SEVENTEEN ... JO1)
--   character: 1 (sanrio) + 6 (chiikawa ... rilakkuma) = 7 件
--   other:     6 (2.5次元) + 3 (vtuber) = 9 件
--   合計:      56 件 (既存 3 + 追加 53)

-- ─────────────────────────────────────────
-- 適用ガイド (Dashboard 適用時)
-- ─────────────────────────────────────────
-- 1. 上記運営判断 + IP 弁護士相談を通過したら Supabase SQL Editor で全文実行
-- 2. ON CONFLICT (id) DO NOTHING のため、既存 3 件 (kimetsu/conan/sanrio) は無変更
-- 3. 既存 master_characters seed は本 seed の作品とは紐付かない (= 鬼滅・コナン・サンリオのキャラのみ)
--    → 新作品のキャラは出品時にフリーテキストで追加される → user_keyword_history で集計 → 月次 master 追加
-- 4. 適用後、aliases に追加すべき単語 (新略称・誤記) が見つかったら別 migration で更新
