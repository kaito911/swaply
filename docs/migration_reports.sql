-- migration_reports.sql
-- reports テーブル新規作成 (通報機能、Phase 0 PR-B)
--
-- Supabase SQL Editor で kaito が手動実行してください。
-- Dashboard 未適用、docs 保存のみ。
--
-- 用途:
--   - 出品 (card) およびユーザー (user) に対する通報の保存
--   - 運営は service_role 経由で reports を read / update / delete (β1 では DB 直接確認、管理画面は Phase 2+)
--   - ユーザーは自分が送信した通報のみ作成可能、第三者通報の参照は不可
--
-- 設計方針:
--   - target_type / target_id の組で対象を多態的に表現 (card / user / 将来 message 等)
--   - reason は UI ラベルをそのまま text 保存 (集計時に SQL で分類可能、enum 化は将来要件次第)
--   - detail (自由記述) は NULL 許容
--   - status enum で運営処理状況を管理 (open / reviewing / resolved / dismissed)
--   - UNIQUE 制約は付けない (同一対象への複数回通報を許容、運営は service_role 経由で重複処理判断)
--   - RLS: INSERT は本人のみ、SELECT は本人のみ (運営は service_role でバイパス)
--   - UPDATE / DELETE はクライアントから禁止 (運営は service_role 経由のみ)

-- ─────────────────────────────────────────
-- 1. reports テーブル
-- ─────────────────────────────────────────

create table public.reports (
  id              uuid        primary key default gen_random_uuid(),
  reporter_id     uuid        not null references auth.users(id) on delete cascade,
  target_type     text        not null,
  target_id       uuid        not null,
  reason          text        not null,
  detail          text,
  status          text        not null default 'open',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint reports_target_type_check
    check (target_type in ('card', 'user')),
  constraint reports_status_check
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint reports_reason_length_check
    check (char_length(reason) between 1 and 100),
  constraint reports_detail_length_check
    check (detail is null or char_length(detail) <= 2000)
);

-- ─────────────────────────────────────────
-- 2. インデックス
-- ─────────────────────────────────────────

-- target 別に集計するため (運営の重複対象抽出)
create index reports_target_idx
  on public.reports (target_type, target_id);

-- 通報者の通報履歴を引く用 (将来「自分の通報履歴」画面で使用予定)
create index reports_reporter_idx
  on public.reports (reporter_id);

-- 未対応抽出 (運営の作業キュー)
create index reports_status_idx
  on public.reports (status)
  where status in ('open', 'reviewing');

-- ─────────────────────────────────────────
-- 3. updated_at 自動更新トリガー
--   (既存の update_updated_at_column() 関数を再利用、wanted_cards 等と同じパターン)
-- ─────────────────────────────────────────

create trigger update_reports_updated_at
  before update on public.reports
  for each row
  execute function public.update_updated_at_column();

-- ─────────────────────────────────────────
-- 4. RLS 設定
-- ─────────────────────────────────────────

alter table public.reports enable row level security;

-- 通報の作成: 認証済ユーザーが自分の reporter_id でのみ INSERT 可能
create policy "Users can create their own reports"
  on public.reports
  for insert
  with check (auth.uid() = reporter_id);

-- 通報の参照: 通報者本人のみ SELECT 可能 (運営は service_role でバイパス)
create policy "Users can read their own reports"
  on public.reports
  for select
  using (auth.uid() = reporter_id);

-- 注意:
--   - UPDATE / DELETE のポリシーは作成しない → 全否定 (運営は service_role 経由のみ)
--   - 自分の通報を取り下げる機能は β1 では未提供 (Phase 1.5+ で検討)

-- ─────────────────────────────────────────
-- 5. 確認クエリ
-- ─────────────────────────────────────────

-- 期待される schema:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'reports'
--   order by ordinal_position;
--
--   id              | uuid        | NO
--   reporter_id     | uuid        | NO
--   target_type     | text        | NO  (CHECK: card | user)
--   target_id       | uuid        | NO
--   reason          | text        | NO  (1..100 chars)
--   detail          | text        | YES (..2000 chars)
--   status          | text        | NO  (CHECK: open | reviewing | resolved | dismissed)
--   created_at      | timestamptz | NO
--   updated_at      | timestamptz | NO
