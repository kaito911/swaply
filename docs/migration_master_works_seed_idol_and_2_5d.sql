-- master_works seed: idol + 2.5次元・アイドルコンテンツ系のみ抜粋 (35 件)
-- ⚠️ 本ファイルは kaito が Supabase SQL Editor で手動実行する用。
-- ⚠️ Dashboard には自動適用しない。
--
-- 由来:
--   docs/migration_master_works_seed_expansion_beta1.sql から下記カテゴリのみ抜粋。
--
-- 含むもの (35 件):
--   - category='idol' の全件 21 件 (K-POP 14 + J-POP 7)
--   - category='anime' のうち 2.5次元・アイドルコンテンツ 5 件
--       utapri / idolish7 / ensemble_stars / hypnosis_mic / project_sekai
--   - category='other' の全件 9 件 (2.5次元舞台 6 + VTuber 3)
--
-- 含まないもの (保留、別 seed 適用):
--   - category='character' の全件 (Disney / ポケモン / サンリオ / カービィ等)
--   - category='anime' のうち通常アニメ (鬼滅 / コナン / 呪術 / ハイキュー等)
--
-- 設計方針:
--   - 元 seed (migration_master_works_seed_expansion_beta1.sql) と完全同一の id /
--     display_name / aliases / category / sort_order を保持
--   - ON CONFLICT (id) DO NOTHING で冪等性確保 (再実行・部分適用後の追加実行も安全)
--   - sort_order は元 seed のまま (将来 character / anime 通常作も追加されたとき
--     一貫した順序になるよう、空き番号を維持)
--
-- 期待件数 (本 seed 適用後の master_works 件数):
--   idol      : 21 件 (本 seed のみ)
--   anime     : 既存 2 件 (kimetsu / conan) + 本 seed 5 件 = 7 件
--   other     : 9 件 (本 seed のみ)
--   character : 既存 1 件 (sanrio) のまま (本 seed では追加しない)
--   合計      : 既存 3 件 + 本 seed 35 件 = 38 件

-- ─────────────────────────────────────────
-- 1. アイドル系 anime / 2.5次元コンテンツ (sort 170-190、category='anime')
-- ─────────────────────────────────────────
insert into public.master_works (id, display_name_ja, display_name_en, aliases, category, sort_order) values
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
-- 2. アイドル / K-POP / J-POP (sort 200-410、category='idol')
-- ─────────────────────────────────────────
insert into public.master_works (id, display_name_ja, display_name_en, aliases, category, sort_order) values
  -- K-POP (sort 200-330)
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
-- 3. 2.5次元 / 舞台 (sort 600-650、category='other')
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
    array['エーステ', 'a3 stage', 'a3stage', 'mankai'],
    'other', 650)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- 4. VTuber / 配信者 (sort 700-720、category='other')
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
-- 本 seed 単独適用後の期待値 (既存 3 件 kimetsu / conan / sanrio との合算):
--   anime     : 既存 2 (kimetsu/conan) + 本 5 = 7
--   character : 既存 1 (sanrio) のまま
--   idol      : 21
--   other     : 9
--   合計      : 38 件
