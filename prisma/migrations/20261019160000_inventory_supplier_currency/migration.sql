ALTER TABLE "inventory_items"
  ADD COLUMN "supplier_id" UUID,
  ADD COLUMN "currency_id" UUID;

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_currency_id_fkey"
  FOREIGN KEY ("currency_id") REFERENCES "currencies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "inventory_items_supplier_id_idx" ON "inventory_items"("supplier_id");
CREATE INDEX "inventory_items_currency_id_idx" ON "inventory_items"("currency_id");
