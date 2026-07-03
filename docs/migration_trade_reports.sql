-- ====================================================================
-- migration_trade_reports.sql
-- 作成日: 2026-07-04
-- 目的  : 取引の質への申告テーブル (Trust 質 PR、β1 は収集のみ・表示なし)。
--
--         通常取引 (trades) と会場取引 (venue_trades) の当事者間で
--         完了済取引 (venue_noshow だけ cancelled 例外) の質を運営に
--         共有するためのデータ収集。β1 はフォーム UI 側で「収集のみ」、
--         表示ロジックは Phase 1.5+ で別 PR。
--
-- 設計判断 (kaito 承認済):
--   案 B 採用: normal_trade_id / venue_trade_id の 2 nullable FK + XOR CHECK
--     理由: (1) FK CASCADE で参照整合性、(2) 集計クエリで両表 LEFT JOIN が自然、
--           (3) venue_noshow は venue_trade でのみ有効の DB CHECK が素直に書ける。
--   既存 status のみで Trust 反映/非反映 3 分類が成立 (追加カラム不要)。
--
-- 制約:
--   - reporter_id / reported_id: profiles(id) ON DELETE CASCADE
--     (tombstone 設計により通常退会では消えない、手動 DELETE のみ cascade)
--   - normal_trade_id / venue_trade_id: いずれも ON DELETE CASCADE
--   - XOR: normal_trade_id ⊕ venue_trade_id のどちらか一方 NOT NULL
--   - 自己申告不可 (reporter_id <> reported_id)
--   - venue_noshow は venue_trade_id NOT NULL のときのみ許可
--   - 1 取引 1 申告者 1 申告 (partial unique、NULL 同士は distinct 扱い)
--   - note は 2000 文字上限
--
-- RLS:
--   - INSERT: 本人 (reporter_id = auth.uid()) のみ。通常は RPC create_trade_report 経由で
--     reported_id / trade_id をサーバ導出する。直 insert も policy 上は本人であれば可能だが、
--     with check (auth.uid() = reporter_id) で他人成りすまし insert を封じる。
--   - SELECT: 申告者本人 (reporter_id = auth.uid()) のみ。
--     被申告者 (reported_id = auth.uid()) を条件に含めない = 被申告者にも見せない設計。
--   - UPDATE / DELETE: policy 未作成 = 全否定 (運営は service_role のみ)。
--
-- 適用手順:
--   - Supabase SQL Editor で本ファイルを実行 (kaito が別途タイミング指示)
--   - 適用後、末尾の確認クエリで schema / policy 状態を確認
-- ====================================================================

begin;

create table public.trade_reports (
  id                uuid        primary key default gen_random_uuid(),
  reporter_id       uuid        not null references public.profiles(id) on delete cascade,
  reported_id       uuid        not null references public.profiles(id) on delete cascade,
  normal_trade_id   uuid        references public.trades(id)       on delete cascade,
  venue_trade_id    uuid        references public.venue_trades(id) on delete cascade,
  category          text        not null,
  note              text,
  photo_path        text,
  created_at        timestamptz not null default now(),

  -- XOR: どちらか一方の trade_id のみ (両 NULL / 両 NOT NULL 不可)
  constraint trade_reports_trade_ref_xor
    check ((normal_trade_id is null) <> (venue_trade_id is null)),

  -- カテゴリ 8 値
  constraint trade_reports_category_check
    check (category in (
      'state_mismatch',
      'wrong_item',
      'poor_packaging',
      'late_shipping',
      'no_contact',
      'not_received',
      'venue_noshow',
      'other'
    )),

  -- venue_noshow は venue_trade でのみ有効
  constraint trade_reports_venue_noshow_only_for_venue
    check (category <> 'venue_noshow' or venue_trade_id is not null),

  -- 自己申告不可
  constraint trade_reports_no_self_report
    check (reporter_id <> reported_id),

  -- note 長さ上限
  constraint trade_reports_note_len_check
    check (note is null or char_length(note) <= 2000),

  -- 1 取引 1 申告者 (partial unique、NULL 同士は distinct 扱いで独立に効く)
  constraint trade_reports_unique_normal unique (reporter_id, normal_trade_id),
  constraint trade_reports_unique_venue  unique (reporter_id, venue_trade_id)
);

-- インデックス
create index trade_reports_normal_trade_idx
  on public.trade_reports (normal_trade_id) where normal_trade_id is not null;
create index trade_reports_venue_trade_idx
  on public.trade_reports (venue_trade_id)  where venue_trade_id is not null;
create index trade_reports_reported_idx
  on public.trade_reports (reported_id);
create index trade_reports_created_at_idx
  on public.trade_reports (created_at desc);

-- ─────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────
alter table public.trade_reports enable row level security;

-- INSERT: 本人が reporter_id を自分の auth.uid() で作成
create policy "Users can create their own trade reports"
  on public.trade_reports
  for insert
  with check (auth.uid() = reporter_id);

-- SELECT: 申告者本人のみ (被申告者・第三者には見せない)
create policy "Users can read their own trade reports"
  on public.trade_reports
  for select
  using (auth.uid() = reporter_id);

-- UPDATE / DELETE: policy 未作成 → 全否定 (運営は service_role のみ)

commit;

-- ====================================================================
-- 適用後確認クエリ (Supabase SQL Editor で実行)
-- ====================================================================
--
-- ◆ カラム
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'trade_reports'
--   order by ordinal_position;
--   → 期待: id / reporter_id / reported_id / normal_trade_id / venue_trade_id
--           / category / note / photo_path / created_at の 9 列
--
-- ◆ CHECK / UNIQUE 制約
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.trade_reports'::regclass
--   order by conname;
--   → 期待: trade_reports_trade_ref_xor / category_check /
--           venue_noshow_only_for_venue / no_self_report /
--           note_len_check / unique_normal / unique_venue
--
-- ◆ RLS policy
--   select polname, cmd, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename = 'trade_reports'
--   order by polname;
--   → 期待: 2 policy
--     "Users can create their own trade reports" cmd=INSERT with_check=(auth.uid() = reporter_id)
--     "Users can read their own trade reports"   cmd=SELECT qual=(auth.uid() = reporter_id)
--     UPDATE / DELETE の policy が存在しないこと
--
-- ◆ 被申告者への露出遮断確認 (被申告者アカウントで実行)
--   select count(*) from public.trade_reports;
--   → 期待: 0 (自分が reporter_id ではないため RLS で全遮断)
