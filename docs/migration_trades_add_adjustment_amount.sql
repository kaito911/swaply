-- migration_trades_add_adjustment_amount.sql
-- trades テーブルに adjustment_amount 列を追加。
-- accept_offer_atomic_v3 が offers.adjustment_amount をコピーする受け皿。
-- signed integer（正=受信者支払、負=提案者支払、ゼロ=なし）で
-- counter.tsx の既存実装と整合させる。新規 payer 列は追加しない。

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS adjustment_amount integer NOT NULL DEFAULT 0;
