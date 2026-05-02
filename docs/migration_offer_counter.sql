-- migration_offer_counter.sql
-- offers テーブルに差額調整・親オファーID カラムを追加

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS adjustment_amount integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_offer_id uuid REFERENCES offers(id) ON DELETE SET NULL;

-- 差額提案時の親オファー参照用インデックス
CREATE INDEX IF NOT EXISTS offers_parent_offer_id_idx ON offers(parent_offer_id);
