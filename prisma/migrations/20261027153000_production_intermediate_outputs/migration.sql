CREATE TYPE "ProductionTargetType" AS ENUM ('PRODUCT', 'INTERMEDIATE');

ALTER TABLE "production_orders"
  ADD COLUMN "target_type" "ProductionTargetType" NOT NULL DEFAULT 'PRODUCT',
  ADD COLUMN "output_item_id" UUID,
  ADD COLUMN "labor_tariff" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "energy_tariff" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "water_tariff" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "machinery_cost" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "output_lot_code" TEXT,
  ALTER COLUMN "product_variant_id" DROP NOT NULL;

ALTER TABLE "production_orders"
  ADD CONSTRAINT "production_orders_output_item_id_fkey"
  FOREIGN KEY ("output_item_id") REFERENCES "inventory_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "production_orders_output_item_id_status_idx"
  ON "production_orders"("output_item_id", "status");

ALTER TABLE "production_orders"
  ADD CONSTRAINT "production_orders_target_check"
  CHECK (
    ("target_type" = 'PRODUCT' AND "product_variant_id" IS NOT NULL AND "output_item_id" IS NULL)
    OR
    ("target_type" = 'INTERMEDIATE' AND "product_variant_id" IS NULL AND "output_item_id" IS NOT NULL)
  );
