DROP INDEX IF EXISTS "stock_movements_posting_sequence_key";

CREATE UNIQUE INDEX "stock_movements_warehouse_id_posting_sequence_key"
ON "stock_movements"("warehouse_id", "posting_sequence");
