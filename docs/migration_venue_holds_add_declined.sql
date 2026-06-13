-- ====================================================================
-- migration_venue_holds_add_declined.sql
-- 作成日: 2026-06-13
-- 目的  : venue_holds.status の CHECK 制約に 'declined' を追加する。
--
--         PR2 (feat/venue-hold-inbox) で「投稿者が Hold 申請を拒否する」
--         アクションを実装するため、status の取り得る値を拡張する。
--         拒否は申請者の取消 (cancelled) とは区別する。
--
-- 設計方針:
--   - 既存 5 値 (pending / held / expired / cancelled / converted) は維持。
--   - 追加 1 値 (declined)。受信者 (= supply_post 投稿者) が拒否した場合に
--     書き込む。将来 PR4b の承認 RPC 原子化では「兄弟 Hold 自動 declined」
--     にも本値を使う想定。
--   - held (holds 側) は legacy 扱い (venue_mode_requirements.md v1.1 §5)。
--     PR2 では未削除、表示は「成立済」タブで converted と合わせて扱う。
--   - 既存データは UPDATE しない (declined は新規発生のみ)。
--   - 本 migration は CHECK 制約の DROP + ADD のみ。データ移動・列追加なし。
--
-- ====================================================================
-- 適用前提:
--   - 本番 venue_holds の status 分布が現行 5 値の範囲内に収まっていること
--     (適用前確認 SQL ◆ 1 で検証)。
--   - PR #24 が main にマージ済 (cca8de7) で、本番 DB の venue_holds FK は
--     profiles 参照になっていること。
--   - 本 migration の本番適用は SQL Editor で手動実行。実行タイミングは
--     PR2 ブランチに本ファイルを commit した後、PR2 main merge 前または後の
--     どちらでも構わない (CHECK 制約のみで TypeScript / RPC との依存なし)。
-- ====================================================================

begin;

-- 既存 CHECK 制約を drop
alter table public.venue_holds
  drop constraint venue_holds_status_check;

-- declined を加えた新 CHECK 制約を add
alter table public.venue_holds
  add constraint venue_holds_status_check
  check (status in (
    'pending',
    'held',
    'expired',
    'cancelled',
    'converted',
    'declined'
  ));

commit;

-- ====================================================================
-- 適用前安全確認 (本 migration 実行前に実行推奨)
-- ====================================================================
--
-- ◆ 1. 既存 status 分布確認 (declined が無く、5 値の範囲内であること)
--
--   select status, count(*) as cnt
--   from public.venue_holds
--   group by status
--   order by status;
--   → 期待: status は pending / held / expired / cancelled / converted のいずれかのみ
--           (venue_holds = 0 件想定なので 0 行返ることも正常)
--
-- ◆ 2. 既存 CHECK 制約の確認 (DROP 前提が崩れていないか)
--
--   select pg_get_constraintdef(oid) as def
--   from pg_constraint
--   where conrelid = 'public.venue_holds'::regclass
--     and conname = 'venue_holds_status_check';
--   → 期待: 1 行返り、定義文に declined を含まず以下 5 値:
--     CHECK ((status = ANY (ARRAY['pending'::text, 'held'::text,
--                                  'expired'::text, 'cancelled'::text,
--                                  'converted'::text])))
--
-- ====================================================================
-- 適用後の検証手順
-- ====================================================================
--
-- ◆ 1. CHECK 制約が 6 値に拡張されたことの確認
--
--   select pg_get_constraintdef(oid) as def
--   from pg_constraint
--   where conrelid = 'public.venue_holds'::regclass
--     and conname = 'venue_holds_status_check';
--   → 期待: 1 行返り、定義文に 'declined' を含む 6 値の CHECK
--
-- ◆ 2. (任意) status='declined' の INSERT 試験 (適用直後にすぐ削除推奨)
--
--   -- 必要なら一時的に dry-run。venue_holds は FK 多数のため簡易テストは難しく、
--   -- PR2 実装後に UI 経由で declineVenueHold() を呼ぶことで検証する方針。
--   -- ここでは制約定義の文言確認だけで十分。
--
-- ◆ 3. 既存データに影響が無いことの確認
--
--   select status, count(*) from public.venue_holds group by status order by status;
--   → 期待: ◆ 1 (適用前) と同じ分布
--
-- ====================================================================
-- ロールバック (緊急時のみ、declined 行が存在しないことが前提)
-- ====================================================================
-- ※ 本番に status='declined' の行が 1 件でも存在する状態で本ロールバックを
--    実行すると、新 CHECK 制約 (5 値) を ADD する際に「既存行が CHECK に
--    違反」して失敗する。ロールバックは declined 発生前にのみ可能。
--
-- ◆ ロールバック前安全確認:
--
--   select count(*) as declined_count
--   from public.venue_holds where status = 'declined';
--   → 0 でない場合はロールバック不可。declined 行を別 status に UPDATE
--     してから (例: 'cancelled' に倒すなど運用判断) ロールバックを試みる。
--
-- ◆ ロールバック SQL:
--
-- begin;
-- alter table public.venue_holds
--   drop constraint venue_holds_status_check;
-- alter table public.venue_holds
--   add constraint venue_holds_status_check
--   check (status in (
--     'pending',
--     'held',
--     'expired',
--     'cancelled',
--     'converted'
--   ));
-- commit;
--
-- ====================================================================
-- 関連
-- ====================================================================
-- - 仕様: docs/venue_mode_requirements.md §5 (venue_holds 状態運用)
-- - 連動 PR: PR2 feat/venue-hold-inbox (declined を書き込む UI / API を追加)
-- - 将来連動: PR4b feat/venue-trade-accept (承認 RPC 原子化、兄弟 Hold の
--             自動 declined をトランザクション内で実行)
