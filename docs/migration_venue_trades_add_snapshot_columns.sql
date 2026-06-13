-- ====================================================================
-- migration_venue_trades_add_snapshot_columns.sql
-- 作成日: 2026-06-13
-- 目的  : venue_trades に offered_snapshot / wanted_snapshot jsonb 列を追加。
--         venue_trade 生成時点のアイテム情報を確定値として保持する。
--         supply_post / cards が後で変更/削除されても trade 履歴の意味を保つ。
--
-- snapshot 構造 (β1 minimum、jsonb で将来拡張可):
--   offered_snapshot (proposer = Hold 申請者が手渡すもの)
--     { "card_name": "<text>", "source": "venue_hold" }
--   wanted_snapshot  (receiver = supply_post 投稿者が手渡すもの)
--     { "card_name": "<text>",
--       "supply_post_id": "<uuid>",
--       "group_name": "<text>" (NULL なら省略),
--       "want_card_text": "<text>" (NULL なら省略),
--       "source": "venue_hold + venue_supply_post" }
--
-- 関連:
--   - docs/venue_mode_requirements.md §5 (PR4b 範囲)
--   - 連動 RPC: docs/migration_rpc_accept_venue_hold.sql (本列に書き込む)
-- ====================================================================

begin;

-- 1. 列追加 (NOT NULL DEFAULT '{}'::jsonb で既存行も即時整合)
alter table public.venue_trades
  add column offered_snapshot jsonb not null default '{}'::jsonb,
  add column wanted_snapshot  jsonb not null default '{}'::jsonb;

-- 2. 既存行 (現状 1 件想定、PR4a 検証由来) を backfill
--    proposer_card / receiver_card の text のみで再構成 (元情報がそれしかないため)
update public.venue_trades
set offered_snapshot = jsonb_build_object(
      'card_name', proposer_card,
      'source', 'backfill_pr4b_2026-06-13'
    ),
    wanted_snapshot = jsonb_build_object(
      'card_name', receiver_card,
      'source', 'backfill_pr4b_2026-06-13'
    ),
    updated_at = now()
where offered_snapshot = '{}'::jsonb
   or wanted_snapshot = '{}'::jsonb;

commit;

-- ====================================================================
-- 適用後確認 (Block C の C1 / C2 と同等、本ファイル単独でも実行可)
-- ====================================================================
--
-- ◆ 列追加確認
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'venue_trades'
--     and column_name in ('offered_snapshot', 'wanted_snapshot');
--   → 期待: 2 行、data_type='jsonb', is_nullable='NO', column_default='''{}''::jsonb'
--
-- ◆ backfill 結果確認
--   select id, proposer_card, receiver_card,
--          offered_snapshot->>'card_name' as snap_offered,
--          wanted_snapshot->>'card_name' as snap_wanted
--   from public.venue_trades;
--   → 期待: 全行で snap_offered = proposer_card, snap_wanted = receiver_card
--
-- ====================================================================
-- ロールバック (緊急時、データ消失あり)
-- ====================================================================
-- ※ 列削除で snapshot 情報は失われる。コード commit / 実機検証前のみ即時可。
--
-- alter table public.venue_trades
--   drop column if exists offered_snapshot,
--   drop column if exists wanted_snapshot;
