ALTER TABLE "inventory_items" ADD COLUMN "default_warehouse_id" UUID;

ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_default_warehouse_id_fkey"
  FOREIGN KEY ("default_warehouse_id") REFERENCES "warehouses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "inventory_items_default_warehouse_id_idx" ON "inventory_items"("default_warehouse_id");
