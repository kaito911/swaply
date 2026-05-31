-- master_characters seed: K-POP / J-POP アイドル メンバー
-- ⚠️ 本ファイルは kaito が Supabase SQL Editor で手動実行する用。
-- ⚠️ Dashboard には自動適用しない。
--
-- 前提:
--   1. master_works に対応する idol グループが seed 済
--      (migration_master_works_seed_idol_and_2_5d.sql で treasure / seventeen /
--       bts / enhypen / stray_kids / txt / zerobaseone / ateez / twice /
--       le_sserafim / newjeans / ive / aespa / snow_man / sixtones /
--       naniwa_danshi / king_and_prince / timelesz / ini / jo1 を追加済)
--   2. master_characters テーブルが存在 (migration_master_works_characters.sql)
--   3. update_updated_at_column() トリガー関数が存在
--
-- 設計方針:
--   - id は work_id をプレフィックスにした slug 形式 (例: 'treasure_hyunsuk')
--   - aliases: 表記ゆれ吸収用 (漢字 / ひらがな / カタカナ / ローマ字 / 愛称 / 旧名)
--   - sort_order: グループ内デビュー時公式順 or 年齢順で 10/20/30 ...
--   - ON CONFLICT (id) DO NOTHING で冪等性確保
--   - NCT は unit が多すぎる (NCT 127 / Dream / WayV 等) ため今回スコープ外
--
-- ★ 要確認のため seed から除外したメンバー (12 名):
--   - TREASURE: Mashiho (高田万豊)
--       理由: 健康問題で長期活動休止、復帰状況が知識範囲で確定できない
--   - NewJeans: グループ全 5 名 (Minji / Hanni / Danielle / Haerin / Hyein)
--       理由: 2024 年労使紛争・脱退報道で 2025-2026 年の構成が不確実、グループ単位で
--       見送り (work_id='newjeans' に紐づくメンバーは本 seed では 0 件)
--   - timelesz: 2024 年タイプロ新メンバー 5 名
--       (篠塚大輝 / 原嘉孝 / 寺西拓人 / 猪俣周杜 / 橋本将生)
--       理由: 2025 年加入と認識しているが正式メンバー名簿の確定情報を持たない
--       既存 Sexy Zone 残留 3 名 (菊池風磨 / 佐藤勝利 / 松島聡) のみ追加
--   - JO1: 金城碧海
--       理由: 2024 年脱退? 活動休止? の情報が知識範囲で確定できない
--       残 10 名のみ追加
--
-- 含むもの (グループ別件数、合計 139 名):
--   K-POP (91 名):
--     treasure: 10 / seventeen: 13 / bts: 7 / enhypen: 7 / stray_kids: 8 /
--     txt: 5 / zerobaseone: 9 / ateez: 8 / twice: 9 / le_sserafim: 5 /
--     newjeans: 0 (グループ全体見送り) / ive: 6 / aespa: 4
--   J-POP (48 名):
--     snow_man: 9 / sixtones: 6 / naniwa_danshi: 7 / king_and_prince: 2 /
--     timelesz: 3 / ini: 11 / jo1: 10

-- ═══════════════════════════════════════════════
-- ── K-POP ───────────────────────────────────────
-- ═══════════════════════════════════════════════

-- ─────────────────────────────────────────
-- TREASURE (work_id='treasure'、10 名)
-- ※ Mashiho (高田万豊) は健康問題で活動休止、復帰要確認のため見送り
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('treasure_hyunsuk', 'treasure', 'チェ・ヒョンソク', 'Choi Hyunsuk',
    array['ヒョンソク', 'hyunsuk', 'choi hyunsuk', 'リーダー'], 10),
  ('treasure_jihoon', 'treasure', 'パク・ジフン', 'Park Jihoon',
    array['ジフン', 'jihoon', 'park jihoon'], 20),
  ('treasure_yoshi', 'treasure', 'ヨシ', 'Yoshi',
    array['金本芳典', 'かねもとよしのり', 'yoshi', 'kanemoto yoshinori', 'よしのり'], 30),
  ('treasure_junkyu', 'treasure', 'キム・ジュンギュ', 'Kim Junkyu',
    array['ジュンギュ', 'junkyu', 'kim junkyu'], 40),
  ('treasure_jaehyuk', 'treasure', 'ユン・ジェヒョク', 'Yoon Jaehyuk',
    array['ジェヒョク', 'jaehyuk', 'yoon jaehyuk'], 50),
  ('treasure_asahi', 'treasure', 'アサヒ', 'Asahi',
    array['浜田朝光', 'はまだあさひ', 'asahi', 'hamada asahi', 'あさひ'], 60),
  ('treasure_jeongwoo', 'treasure', 'パク・ジョンウ', 'Park Jeongwoo',
    array['ジョンウ', 'jeongwoo', 'park jeongwoo'], 70),
  ('treasure_haruto', 'treasure', 'ハルト', 'Haruto',
    array['渡辺温人', 'わたなべはると', 'haruto', 'watanabe haruto', 'はると'], 80),
  ('treasure_doyoung', 'treasure', 'キム・ドヨン', 'Kim Doyoung',
    array['ドヨン', 'doyoung', 'kim doyoung'], 90),
  ('treasure_junghwan', 'treasure', 'ソ・ジョンファン', 'So Junghwan',
    array['ジョンファン', 'junghwan', 'so junghwan', 'マンネ'], 100)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- SEVENTEEN (work_id='seventeen'、13 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('seventeen_scoups', 'seventeen', 'エスクプス', 'S.Coups',
    array['s.coups', 'scoups', '崔勝哲', 'チェ・スンチョル', 'choi seungcheol', 'リーダー'], 10),
  ('seventeen_jeonghan', 'seventeen', 'ジョンハン', 'Jeonghan',
    array['jeonghan', '尹淨漢', 'ユン・ジョンハン', 'yoon jeonghan'], 20),
  ('seventeen_joshua', 'seventeen', 'ジョシュア', 'Joshua',
    array['joshua', 'ホン・ジス', 'hong jisoo', 'hong joshua'], 30),
  ('seventeen_jun', 'seventeen', 'ジュン', 'Jun',
    array['jun', '文俊輝', 'ウェン・ジュンフィ', 'wen junhui'], 40),
  ('seventeen_hoshi', 'seventeen', 'ホシ', 'Hoshi',
    array['hoshi', '權順榮', 'クォン・スニョン', 'kwon soonyoung'], 50),
  ('seventeen_wonwoo', 'seventeen', 'ウォヌ', 'Wonwoo',
    array['wonwoo', '全圓佑', 'ジョン・ウォヌ', 'jeon wonwoo'], 60),
  ('seventeen_woozi', 'seventeen', 'ウジ', 'Woozi',
    array['woozi', '李知勳', 'イ・ジフン', 'lee jihoon'], 70),
  ('seventeen_dk', 'seventeen', 'ドギョム', 'DK',
    array['dk', 'dokyeom', '李碩珉', 'イ・ソクミン', 'lee seokmin'], 80),
  ('seventeen_mingyu', 'seventeen', 'ミンギュ', 'Mingyu',
    array['mingyu', '金珉奎', 'キム・ミンギュ', 'kim mingyu'], 90),
  ('seventeen_the8', 'seventeen', 'ディエイト', 'The8',
    array['the8', 'minghao', 'ミンハオ', '徐明浩', 'シュー・ミンハオ', 'xu minghao'], 100),
  ('seventeen_seungkwan', 'seventeen', 'スングァン', 'Seungkwan',
    array['seungkwan', '夫勝寬', 'ブ・スングァン', 'boo seungkwan'], 110),
  ('seventeen_vernon', 'seventeen', 'バーノン', 'Vernon',
    array['vernon', '崔ハンソル', 'チェ・ハンソル', 'choi hansol', 'hansol vernon chwe'], 120),
  ('seventeen_dino', 'seventeen', 'ディノ', 'Dino',
    array['dino', '李燦', 'イ・チャン', 'lee chan', 'マンネ'], 130)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- BTS (work_id='bts'、7 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('bts_rm', 'bts', 'RM', 'RM',
    array['rm', 'ナムジュン', '金南俊', 'キム・ナムジュン', 'kim namjoon', 'リーダー'], 10),
  ('bts_jin', 'bts', 'ジン', 'Jin',
    array['jin', 'ソクジン', '金碩珍', 'キム・ソクジン', 'kim seokjin'], 20),
  ('bts_suga', 'bts', 'シュガ', 'Suga',
    array['suga', 'agust d', 'ユンギ', '閔玧其', 'ミン・ユンギ', 'min yoongi'], 30),
  ('bts_jhope', 'bts', 'ジェイホープ', 'J-Hope',
    array['j-hope', 'jhope', 'hobi', 'ホソク', '鄭號錫', 'チョン・ホソク', 'jung hoseok'], 40),
  ('bts_jimin', 'bts', 'ジミン', 'Jimin',
    array['jimin', '朴智旻', 'パク・ジミン', 'park jimin'], 50),
  ('bts_v', 'bts', 'ブイ', 'V',
    array['v', 'taehyung', 'テヒョン', '金泰亨', 'キム・テヒョン', 'kim taehyung'], 60),
  ('bts_jungkook', 'bts', 'ジョングク', 'Jungkook',
    array['jungkook', 'jk', '田柾國', 'チョン・ジョングク', 'jeon jungkook', 'マンネ'], 70)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- ENHYPEN (work_id='enhypen'、7 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('enhypen_heeseung', 'enhypen', 'ヒスン', 'Heeseung',
    array['heeseung', 'ヒースン', '李希昇', 'イ・ヒスン', 'lee heeseung'], 10),
  ('enhypen_jay', 'enhypen', 'ジェイ', 'Jay',
    array['jay', 'ジェイク', 'パク・ジョンソン', 'park jongseong'], 20),
  ('enhypen_jake', 'enhypen', 'ジェイク', 'Jake',
    array['jake', '沈在允', 'シム・ジェユン', 'sim jaeyun'], 30),
  ('enhypen_sunghoon', 'enhypen', 'ソンフン', 'Sunghoon',
    array['sunghoon', 'パク・ソンフン', 'park sunghoon'], 40),
  ('enhypen_sunoo', 'enhypen', 'ソヌ', 'Sunoo',
    array['sunoo', 'キム・ソヌ', 'kim sunoo'], 50),
  ('enhypen_jungwon', 'enhypen', 'ジョンウォン', 'Jungwon',
    array['jungwon', 'ヤン・ジョンウォン', 'yang jungwon', 'リーダー'], 60),
  ('enhypen_niki', 'enhypen', 'ニキ', 'Ni-ki',
    array['ni-ki', 'niki', '西村力', 'にしむらりき', 'nishimura riki', 'マンネ'], 70)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- Stray Kids (work_id='stray_kids'、8 名)
-- ※ Woojin は 2019 年に脱退済のため不含
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('stray_kids_bangchan', 'stray_kids', 'バンチャン', 'Bang Chan',
    array['bang chan', 'bangchan', 'chan', 'bang christopher chan', 'リーダー'], 10),
  ('stray_kids_leeknow', 'stray_kids', 'リノ', 'Lee Know',
    array['lee know', 'leeknow', 'minho', 'ミノ', 'lee minho'], 20),
  ('stray_kids_changbin', 'stray_kids', 'チャンビン', 'Changbin',
    array['changbin', 'ソ・チャンビン', 'seo changbin'], 30),
  ('stray_kids_hyunjin', 'stray_kids', 'ヒョンジン', 'Hyunjin',
    array['hyunjin', 'ファン・ヒョンジン', 'hwang hyunjin'], 40),
  ('stray_kids_han', 'stray_kids', 'ハン', 'Han',
    array['han', 'jisung', 'ジソン', 'han jisung'], 50),
  ('stray_kids_felix', 'stray_kids', 'フィリックス', 'Felix',
    array['felix', 'lee felix', 'リ・ヨンボク', 'lee yongbok'], 60),
  ('stray_kids_seungmin', 'stray_kids', 'スンミン', 'Seungmin',
    array['seungmin', 'キム・スンミン', 'kim seungmin'], 70),
  ('stray_kids_in', 'stray_kids', 'アイエン', 'I.N',
    array['i.n', 'in', 'jeongin', 'ジョンイン', 'yang jeongin', 'マンネ'], 80)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- TOMORROW X TOGETHER / TXT (work_id='txt'、5 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('txt_soobin', 'txt', 'スビン', 'Soobin',
    array['soobin', 'チェ・スビン', 'choi soobin', 'リーダー'], 10),
  ('txt_yeonjun', 'txt', 'ヨンジュン', 'Yeonjun',
    array['yeonjun', 'チェ・ヨンジュン', 'choi yeonjun'], 20),
  ('txt_beomgyu', 'txt', 'ボムギュ', 'Beomgyu',
    array['beomgyu', 'チェ・ボムギュ', 'choi beomgyu'], 30),
  ('txt_taehyun', 'txt', 'テヒョン', 'Taehyun',
    array['taehyun', 'カン・テヒョン', 'kang taehyun'], 40),
  ('txt_hueningkai', 'txt', 'ヒュニンカイ', 'Hueningkai',
    array['hueningkai', 'huening kai', 'kai', 'カイ', 'マンネ'], 50)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- ZEROBASEONE / ZB1 (work_id='zerobaseone'、9 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('zerobaseone_hanbin', 'zerobaseone', 'ソン・ハンビン', 'Sung Hanbin',
    array['hanbin', 'sung hanbin', 'ハンビン', 'リーダー'], 10),
  ('zerobaseone_jiwoong', 'zerobaseone', 'キム・ジウン', 'Kim Jiwoong',
    array['jiwoong', 'kim jiwoong', 'ジウン'], 20),
  ('zerobaseone_zhanghao', 'zerobaseone', 'チャン・ハオ', 'Zhang Hao',
    array['zhang hao', 'zhanghao', 'ハオ', 'hao'], 30),
  ('zerobaseone_matthew', 'zerobaseone', 'ソク・マシュー', 'Seok Matthew',
    array['matthew', 'seok matthew', 'マシュー'], 40),
  ('zerobaseone_taerae', 'zerobaseone', 'キム・テレ', 'Kim Taerae',
    array['taerae', 'kim taerae', 'テレ'], 50),
  ('zerobaseone_ricky', 'zerobaseone', 'リッキー', 'Ricky',
    array['ricky', 'シェン・チュエンルイ', '沈泉睿'], 60),
  ('zerobaseone_gyuvin', 'zerobaseone', 'キム・ギュビン', 'Kim Gyuvin',
    array['gyuvin', 'kim gyuvin', 'ギュビン'], 70),
  ('zerobaseone_gunwook', 'zerobaseone', 'パク・ゴヌク', 'Park Gunwook',
    array['gunwook', 'park gunwook', 'ゴヌク'], 80),
  ('zerobaseone_yujin', 'zerobaseone', 'ハン・ユジン', 'Han Yujin',
    array['yujin', 'han yujin', 'ユジン', 'マンネ'], 90)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- ATEEZ (work_id='ateez'、8 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('ateez_hongjoong', 'ateez', 'ホンジュン', 'Hongjoong',
    array['hongjoong', 'kim hongjoong', 'キム・ホンジュン', 'リーダー'], 10),
  ('ateez_seonghwa', 'ateez', 'ソンファ', 'Seonghwa',
    array['seonghwa', 'park seonghwa', 'パク・ソンファ'], 20),
  ('ateez_yunho', 'ateez', 'ユンホ', 'Yunho',
    array['yunho', 'jeong yunho', 'チョン・ユンホ'], 30),
  ('ateez_yeosang', 'ateez', 'ヨサン', 'Yeosang',
    array['yeosang', 'kang yeosang', 'カン・ヨサン'], 40),
  ('ateez_san', 'ateez', 'サン', 'San',
    array['san', 'choi san', 'チェ・サン'], 50),
  ('ateez_mingi', 'ateez', 'ミンギ', 'Mingi',
    array['mingi', 'song mingi', 'ソン・ミンギ'], 60),
  ('ateez_wooyoung', 'ateez', 'ウヨン', 'Wooyoung',
    array['wooyoung', 'jung wooyoung', 'チョン・ウヨン'], 70),
  ('ateez_jongho', 'ateez', 'ジョンホ', 'Jongho',
    array['jongho', 'choi jongho', 'チェ・ジョンホ', 'マンネ'], 80)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- TWICE (work_id='twice'、9 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('twice_nayeon', 'twice', 'ナヨン', 'Nayeon',
    array['nayeon', 'im nayeon', 'イム・ナヨン'], 10),
  ('twice_jeongyeon', 'twice', 'ジョンヨン', 'Jeongyeon',
    array['jeongyeon', 'yoo jeongyeon', 'ユ・ジョンヨン'], 20),
  ('twice_momo', 'twice', 'モモ', 'Momo',
    array['momo', '平井もも', 'ひらいもも', 'hirai momo'], 30),
  ('twice_sana', 'twice', 'サナ', 'Sana',
    array['sana', '湊崎紗夏', 'みなとざきさな', 'minatozaki sana'], 40),
  ('twice_jihyo', 'twice', 'ジヒョ', 'Jihyo',
    array['jihyo', 'park jihyo', 'パク・ジヒョ', 'リーダー'], 50),
  ('twice_mina', 'twice', 'ミナ', 'Mina',
    array['mina', '名井南', 'みょういみな', 'myoui mina'], 60),
  ('twice_dahyun', 'twice', 'ダヒョン', 'Dahyun',
    array['dahyun', 'kim dahyun', 'キム・ダヒョン'], 70),
  ('twice_chaeyoung', 'twice', 'チェヨン', 'Chaeyoung',
    array['chaeyoung', 'son chaeyoung', 'ソン・チェヨン'], 80),
  ('twice_tzuyu', 'twice', 'ツウィ', 'Tzuyu',
    array['tzuyu', 'chou tzuyu', '周子瑜', 'マンネ'], 90)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- LE SSERAFIM (work_id='le_sserafim'、5 名)
-- ※ Garam は 2022 年脱退済のため不含
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('le_sserafim_sakura', 'le_sserafim', 'サクラ', 'Sakura',
    array['sakura', '宮脇咲良', 'みやわきさくら', 'miyawaki sakura'], 10),
  ('le_sserafim_chaewon', 'le_sserafim', 'チェウォン', 'Chaewon',
    array['chaewon', 'kim chaewon', 'キム・チェウォン', 'リーダー'], 20),
  ('le_sserafim_yunjin', 'le_sserafim', 'ユンジン', 'Yunjin',
    array['yunjin', 'huh yunjin', 'ホ・ユンジン', 'jenny huh'], 30),
  ('le_sserafim_kazuha', 'le_sserafim', 'カズハ', 'Kazuha',
    array['kazuha', '中村一葉', 'なかむらかずは', 'nakamura kazuha'], 40),
  ('le_sserafim_eunchae', 'le_sserafim', 'ウンチェ', 'Eunchae',
    array['eunchae', 'hong eunchae', 'ホン・ウンチェ', 'マンネ'], 50)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- NewJeans (work_id='newjeans'、★ 見送り)
-- 2024 年 ADOR / HYBE 労使紛争・脱退報道で 2025-2026 年の構成が不確実
-- 在籍メンバー (Minji / Hanni / Danielle / Haerin / Hyein) はグループ単位で
-- 要確認、本 seed では 0 件追加。次回 user 判断後に別 seed で追加予定。
-- ─────────────────────────────────────────

-- ─────────────────────────────────────────
-- IVE (work_id='ive'、6 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('ive_yujin', 'ive', 'ユジン', 'Yujin',
    array['yujin', 'an yujin', 'アン・ユジン', 'リーダー'], 10),
  ('ive_gaeul', 'ive', 'ガウル', 'Gaeul',
    array['gaeul', 'kim gaeul', 'キム・ガウル'], 20),
  ('ive_rei', 'ive', 'レイ', 'Rei',
    array['rei', '直井玲', 'なおいれい', 'naoi rei'], 30),
  ('ive_wonyoung', 'ive', 'ウォニョン', 'Wonyoung',
    array['wonyoung', 'jang wonyoung', 'チャン・ウォニョン'], 40),
  ('ive_liz', 'ive', 'リズ', 'Liz',
    array['liz', 'kim jiwon', 'キム・ジウォン'], 50),
  ('ive_leeseo', 'ive', 'イソ', 'Leeseo',
    array['leeseo', 'lee hyunseo', 'イ・ヒョンソ', 'マンネ'], 60)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- aespa (work_id='aespa'、4 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('aespa_karina', 'aespa', 'カリナ', 'Karina',
    array['karina', 'yu jimin', 'ユ・ジミン', 'リーダー'], 10),
  ('aespa_giselle', 'aespa', 'ジゼル', 'Giselle',
    array['giselle', '内永えり', 'うちながえり', 'uchinaga aeri', 'aeri uchinaga'], 20),
  ('aespa_winter', 'aespa', 'ウィンター', 'Winter',
    array['winter', 'kim minjeong', 'キム・ミンジョン'], 30),
  ('aespa_ningning', 'aespa', 'ニンニン', 'Ningning',
    array['ningning', 'ning yizhuo', 'マンネ'], 40)
  on conflict (id) do nothing;

-- ═══════════════════════════════════════════════
-- ── J-POP ───────────────────────────────────────
-- ═══════════════════════════════════════════════

-- ─────────────────────────────────────────
-- Snow Man (work_id='snow_man'、9 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('snow_man_iwamoto', 'snow_man', '岩本照', 'Iwamoto Hikaru',
    array['岩本照', 'いわもとひかる', 'iwamoto hikaru', 'ひかる', 'リーダー'], 10),
  ('snow_man_fukazawa', 'snow_man', '深澤辰哉', 'Fukazawa Tatsuya',
    array['深澤辰哉', 'ふかざわたつや', 'fukazawa tatsuya', 'ふっか', 'たつや'], 20),
  ('snow_man_raul', 'snow_man', 'ラウール', 'Raul',
    array['ラウール', 'raul', 'らうーる'], 30),
  ('snow_man_watanabe', 'snow_man', '渡辺翔太', 'Watanabe Shota',
    array['渡辺翔太', 'わたなべしょうた', 'watanabe shota', 'しょっぴー', 'しょうた'], 40),
  ('snow_man_mukai', 'snow_man', '向井康二', 'Mukai Koji',
    array['向井康二', 'むかいこうじ', 'mukai koji', 'こーじ', 'こうじ'], 50),
  ('snow_man_abe', 'snow_man', '阿部亮平', 'Abe Ryohei',
    array['阿部亮平', 'あべりょうへい', 'abe ryohei', 'あべちゃん', 'りょうへい'], 60),
  ('snow_man_meguro', 'snow_man', '目黒蓮', 'Meguro Ren',
    array['目黒蓮', 'めぐろれん', 'meguro ren', 'めめ', 'れん'], 70),
  ('snow_man_miyadate', 'snow_man', '宮舘涼太', 'Miyadate Ryota',
    array['宮舘涼太', 'みやだてりょうた', 'miyadate ryota', 'だてさま', 'りょうた'], 80),
  ('snow_man_sakuma', 'snow_man', '佐久間大介', 'Sakuma Daisuke',
    array['佐久間大介', 'さくまだいすけ', 'sakuma daisuke', 'さっくん', 'だいすけ'], 90)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- SixTONES (work_id='sixtones'、6 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('sixtones_jesse', 'sixtones', 'ジェシー', 'Jesse',
    array['ジェシー', 'jesse', 'jesse lewis'], 10),
  ('sixtones_kyomoto', 'sixtones', '京本大我', 'Kyomoto Taiga',
    array['京本大我', 'きょうもとたいが', 'kyomoto taiga', 'たいが'], 20),
  ('sixtones_matsumura', 'sixtones', '松村北斗', 'Matsumura Hokuto',
    array['松村北斗', 'まつむらほくと', 'matsumura hokuto', 'ほっくん', 'ほくと'], 30),
  ('sixtones_kochi', 'sixtones', '髙地優吾', 'Kochi Yugo',
    array['髙地優吾', '高地優吾', 'こうちゆうご', 'kochi yugo', 'ゆうご'], 40),
  ('sixtones_morimoto', 'sixtones', '森本慎太郎', 'Morimoto Shintaro',
    array['森本慎太郎', 'もりもとしんたろう', 'morimoto shintaro', 'しんたろう'], 50),
  ('sixtones_tanaka', 'sixtones', '田中樹', 'Tanaka Juri',
    array['田中樹', 'たなかじゅり', 'tanaka juri', 'じゅり'], 60)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- なにわ男子 (work_id='naniwa_danshi'、7 名)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('naniwa_danshi_fujiwara', 'naniwa_danshi', '藤原丈一郎', 'Fujiwara Joichiro',
    array['藤原丈一郎', 'ふじわらじょういちろう', 'fujiwara joichiro', 'じょー', 'じょういちろう'], 10),
  ('naniwa_danshi_ohashi', 'naniwa_danshi', '大橋和也', 'Ohashi Kazuya',
    array['大橋和也', 'おおはしかずや', 'ohashi kazuya', 'はっすー', 'かずや', 'リーダー'], 20),
  ('naniwa_danshi_takahashi', 'naniwa_danshi', '高橋恭平', 'Takahashi Kyohei',
    array['高橋恭平', 'たかはしきょうへい', 'takahashi kyohei', 'きょへ', 'きょうへい'], 30),
  ('naniwa_danshi_nishihata', 'naniwa_danshi', '西畑大吾', 'Nishihata Daigo',
    array['西畑大吾', 'にしはただいご', 'nishihata daigo', 'だいご'], 40),
  ('naniwa_danshi_onishi', 'naniwa_danshi', '大西流星', 'Onishi Ryusei',
    array['大西流星', 'おおにしりゅうせい', 'onishi ryusei', 'りゅちぇ', 'りゅうせい'], 50),
  ('naniwa_danshi_michieda', 'naniwa_danshi', '道枝駿佑', 'Michieda Shunsuke',
    array['道枝駿佑', 'みちえだしゅんすけ', 'michieda shunsuke', 'みっちー', 'しゅんすけ'], 60),
  ('naniwa_danshi_nagao', 'naniwa_danshi', '長尾謙杜', 'Nagao Kento',
    array['長尾謙杜', 'ながおけんと', 'nagao kento', 'けんと'], 70)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- King & Prince (work_id='king_and_prince'、2 名)
-- ※ 2023 年に平野紫耀 / 神宮寺勇太 / 岸優太が脱退 (Number_i 結成)、岩橋玄樹は活動休止のち
--   契約解除。2024 年以降は 2 人体制。
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('king_and_prince_nagase', 'king_and_prince', '永瀬廉', 'Nagase Ren',
    array['永瀬廉', 'ながせれん', 'nagase ren', 'れん'], 10),
  ('king_and_prince_takahashi', 'king_and_prince', '髙橋海人', 'Takahashi Kaito',
    array['髙橋海人', '高橋海人', 'たかはしかいと', 'takahashi kaito', 'かいと'], 20)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- timelesz (work_id='timelesz'、3 名)
-- ※ 2024 年 Sexy Zone から改名。元 Sexy Zone 残留 3 名のみ追加。
-- ※ 2025 年 Timelesz Project (タイプロ) の新メンバー 5 名 (篠塚大輝 / 原嘉孝 /
--   寺西拓人 / 猪俣周杜 / 橋本将生) は名簿の確定情報を持たないため見送り。
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('timelesz_kikuchi', 'timelesz', '菊池風磨', 'Kikuchi Fuma',
    array['菊池風磨', 'きくちふうま', 'kikuchi fuma', 'ふま', 'ふうま'], 10),
  ('timelesz_sato', 'timelesz', '佐藤勝利', 'Sato Shori',
    array['佐藤勝利', 'さとうしょうり', 'sato shori', 'しょり', 'しょうり'], 20),
  ('timelesz_matsushima', 'timelesz', '松島聡', 'Matsushima So',
    array['松島聡', 'まつしまそう', 'matsushima so', 'そう'], 30)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- INI (work_id='ini'、11 名)
-- ※ PRODUCE 101 JAPAN SEASON 2 (2021 デビュー)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('ini_kimura', 'ini', '木村柾哉', 'Kimura Masaya',
    array['木村柾哉', 'きむらまさや', 'kimura masaya', 'まさや', 'センター'], 10),
  ('ini_takatsuka', 'ini', '髙塚大夢', 'Takatsuka Hiromu',
    array['髙塚大夢', '高塚大夢', 'たかつかひろむ', 'takatsuka hiromu', 'ひろむ'], 20),
  ('ini_ikezaki', 'ini', '池﨑理人', 'Ikezaki Rihito',
    array['池﨑理人', '池崎理人', 'いけざきりひと', 'ikezaki rihito', 'りひと'], 30),
  ('ini_tajima', 'ini', '田島将吾', 'Tajima Shogo',
    array['田島将吾', 'たじましょうご', 'tajima shogo', 'しょうご'], 40),
  ('ini_nishi', 'ini', '西洸人', 'Nishi Hiroto',
    array['西洸人', 'にしひろと', 'nishi hiroto', 'ひろと'], 50),
  ('ini_fujimaki', 'ini', '藤牧京介', 'Fujimaki Kyosuke',
    array['藤牧京介', 'ふじまききょうすけ', 'fujimaki kyosuke', 'きょうすけ'], 60),
  ('ini_goto', 'ini', '後藤威吹', 'Goto Ibuki',
    array['後藤威吹', 'ごとういぶき', 'goto ibuki', 'いぶき'], 70),
  ('ini_xu', 'ini', '許豊凡', 'Xu Fengfan',
    array['許豊凡', 'きょほうぼん', 'xu fengfan', 'フォンファン', 'ほうぼん'], 80),
  ('ini_matsuda', 'ini', '松田迅', 'Matsuda Jin',
    array['松田迅', 'まつだじん', 'matsuda jin', 'じん'], 90),
  ('ini_ozaki', 'ini', '尾崎匠海', 'Ozaki Takumi',
    array['尾崎匠海', 'おざきたくみ', 'ozaki takumi', 'たくみ'], 100),
  ('ini_sano', 'ini', '佐野雄大', 'Sano Yudai',
    array['佐野雄大', 'さのゆうだい', 'sano yudai', 'ゆうだい'], 110)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- JO1 (work_id='jo1'、10 名)
-- ※ PRODUCE 101 JAPAN SEASON 1 (2020 デビュー)
-- ※ 金城碧海は脱退? 活動休止? の情報が確定できないため見送り (要確認)
-- ─────────────────────────────────────────
insert into public.master_characters (id, work_id, display_name_ja, display_name_en, aliases, sort_order) values
  ('jo1_yonashiro', 'jo1', '與那城奨', 'Yonashiro Sho',
    array['與那城奨', '与那城奨', 'よなしろしょう', 'yonashiro sho', 'しょう', 'リーダー'], 10),
  ('jo1_kawashiri', 'jo1', '川尻蓮', 'Kawashiri Ren',
    array['川尻蓮', 'かわしりれん', 'kawashiri ren', 'れん'], 20),
  ('jo1_kawanishi', 'jo1', '川西拓実', 'Kawanishi Takumi',
    array['川西拓実', 'かわにしたくみ', 'kawanishi takumi', 'たくみ'], 30),
  ('jo1_kimata', 'jo1', '木全翔也', 'Kimata Shoya',
    array['木全翔也', 'きまたしょうや', 'kimata shoya', 'しょうや'], 40),
  ('jo1_kono', 'jo1', '河野純喜', 'Kono Junki',
    array['河野純喜', 'こうのじゅんき', 'kono junki', 'じゅんき'], 50),
  ('jo1_tsurubo', 'jo1', '鶴房汐恩', 'Tsurubo Shion',
    array['鶴房汐恩', 'つるぼうしおん', 'tsurubo shion', 'しおん'], 60),
  ('jo1_shiraiwa', 'jo1', '白岩瑠姫', 'Shiraiwa Ruki',
    array['白岩瑠姫', 'しらいわるき', 'shiraiwa ruki', 'るき'], 70),
  ('jo1_ohira', 'jo1', '大平祥生', 'Ohira Shosei',
    array['大平祥生', 'おおひらしょうせい', 'ohira shosei', 'しょうせい'], 80),
  ('jo1_sato', 'jo1', '佐藤景瑚', 'Sato Keigo',
    array['佐藤景瑚', 'さとうけいご', 'sato keigo', 'けいご'], 90),
  ('jo1_mamehara', 'jo1', '豆原一成', 'Mamehara Issei',
    array['豆原一成', 'まめはらいっせい', 'mamehara issei', 'いっせい', 'マンネ'], 100)
  on conflict (id) do nothing;

-- ─────────────────────────────────────────
-- 確認クエリ (適用後の seed 件数を出す)
-- ─────────────────────────────────────────
-- select work_id, count(*) as cnt from public.master_characters
-- where work_id in (
--   'treasure','seventeen','bts','enhypen','stray_kids','txt','zerobaseone',
--   'ateez','twice','le_sserafim','newjeans','ive','aespa',
--   'snow_man','sixtones','naniwa_danshi','king_and_prince','timelesz','ini','jo1'
-- )
-- group by work_id order by work_id;
--
-- 本 seed 適用後の期待値 (要確認分は含まれない):
--   ateez:           8
--   aespa:           4
--   bts:             7
--   enhypen:         7
--   ini:            11
--   ive:             6
--   jo1:            10  (金城碧海 1 名は見送り)
--   king_and_prince: 2  (永瀬廉 / 髙橋海人)
--   le_sserafim:     5  (Garam は 2022 脱退済)
--   naniwa_danshi:   7
--   newjeans:        0  (グループ全 5 名見送り)
--   seventeen:      13
--   sixtones:        6
--   snow_man:        9
--   stray_kids:      8  (Woojin は 2019 脱退済)
--   timelesz:        3  (タイプロ新メンバー 5 名見送り)
--   treasure:       10  (Mashiho 1 名見送り)
--   twice:           9
--   txt:             5
--   zerobaseone:     9
--   合計:          139 名
