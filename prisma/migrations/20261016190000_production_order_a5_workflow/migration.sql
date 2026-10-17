ALTER TABLE "products" ADD COLUMN "matrix_code" TEXT;

UPDATE "products"
SET "matrix_code" = UPPER(REGEXP_REPLACE("code", '[^A-Za-z0-9]+', '-', 'g'))
WHERE "matrix_code" IS NULL;

ALTER TABLE "products" ALTER COLUMN "matrix_code" SET NOT NULL;
CREATE UNIQUE INDEX "products_company_id_matrix_code_key" ON "products"("company_id", "matrix_code");

DROP INDEX IF EXISTS "product_variants_product_id_size_id_color_id_key";
ALTER TABLE "product_variants" ADD COLUMN "secondary_color_id" UUID;
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_secondary_color_id_fkey"
  FOREIGN KEY ("secondary_color_id") REFERENCES "colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "product_variants_product_id_size_id_color_id_secondary_color_id_idx"
  ON "product_variants"("product_id", "size_id", "color_id", "secondary_color_id");
CREATE UNIQUE INDEX "product_variants_color_pair_key"
  ON "product_variants"("product_id", "size_id", "color_id", COALESCE("secondary_color_id", '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE "production_orders"
  ADD COLUMN "secondary_recipe_version_id" UUID,
  ADD COLUMN "sales_order_id" UUID,
  ADD COLUMN "material_item_id" UUID,
  ADD COLUMN "secondary_recipe_runs" DECIMAL(18,6),
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "production_turns" JSONB;

ALTER TABLE "production_orders"
  ADD CONSTRAINT "production_orders_secondary_recipe_version_id_fkey"
  FOREIGN KEY ("secondary_recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "production_orders_sales_order_id_fkey"
  FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "production_orders_material_item_id_fkey"
  FOREIGN KEY ("material_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "production_orders_priority_check" CHECK ("priority" BETWEEN 1 AND 3);

CREATE INDEX "production_orders_sales_order_id_idx" ON "production_orders"("sales_order_id");

CREATE TABLE "production_components" (
  "id" UUID NOT NULL,
  "production_order_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "component_type" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  "color_detail" TEXT,
  CONSTRAINT "production_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_components_production_order_id_fkey"
    FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "production_components_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "production_components_production_order_id_component_type_key"
  ON "production_components"("production_order_id", "component_type");
CREATE INDEX "production_components_item_id_idx" ON "production_components"("item_id");
