ALTER TYPE "InventoryItemType" ADD VALUE 'INTERMEDIATE';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFORMATION_CONSUMPTION';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFORMATION_OUTPUT';

CREATE TYPE "InventoryTransformationStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "inventory_formulas" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "output_item_id" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_formulas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_formula_versions" (
  "id" UUID NOT NULL,
  "formula_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "yield_quantity" DECIMAL(18,6) NOT NULL,
  "notes" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_formula_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_formula_ingredients" (
  "id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  CONSTRAINT "inventory_formula_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_transformations" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "formula_version_id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "status" "InventoryTransformationStatus" NOT NULL DEFAULT 'DRAFT',
  "planned_output_quantity" DECIMAL(18,6) NOT NULL,
  "actual_output_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "actual_waste_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "output_lot_code" TEXT,
  "notes" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_transformations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_transformation_materials" (
  "id" UUID NOT NULL,
  "transformation_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "planned_quantity" DECIMAL(18,6) NOT NULL,
  "consumed_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(18,6) NOT NULL DEFAULT 0,
  CONSTRAINT "inventory_transformation_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_formulas_company_id_code_key" ON "inventory_formulas"("company_id", "code");
CREATE INDEX "inventory_formulas_company_id_active_idx" ON "inventory_formulas"("company_id", "active");
CREATE UNIQUE INDEX "inventory_formula_versions_formula_id_version_key" ON "inventory_formula_versions"("formula_id", "version");
CREATE UNIQUE INDEX "inventory_formula_ingredients_version_id_item_id_key" ON "inventory_formula_ingredients"("version_id", "item_id");
CREATE UNIQUE INDEX "inventory_transformations_company_id_number_key" ON "inventory_transformations"("company_id", "number");
CREATE INDEX "inventory_transformations_company_id_status_created_at_idx" ON "inventory_transformations"("company_id", "status", "created_at");
CREATE UNIQUE INDEX "inventory_transformation_materials_transformation_id_item_id_key" ON "inventory_transformation_materials"("transformation_id", "item_id");

ALTER TABLE "inventory_formulas" ADD CONSTRAINT "inventory_formulas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_formulas" ADD CONSTRAINT "inventory_formulas_output_item_id_fkey" FOREIGN KEY ("output_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_formula_versions" ADD CONSTRAINT "inventory_formula_versions_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "inventory_formulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_formula_ingredients" ADD CONSTRAINT "inventory_formula_ingredients_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "inventory_formula_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_formula_ingredients" ADD CONSTRAINT "inventory_formula_ingredients_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transformations" ADD CONSTRAINT "inventory_transformations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_transformations" ADD CONSTRAINT "inventory_transformations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transformations" ADD CONSTRAINT "inventory_transformations_formula_version_id_fkey" FOREIGN KEY ("formula_version_id") REFERENCES "inventory_formula_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transformation_materials" ADD CONSTRAINT "inventory_transformation_materials_transformation_id_fkey" FOREIGN KEY ("transformation_id") REFERENCES "inventory_transformations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_transformation_materials" ADD CONSTRAINT "inventory_transformation_materials_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
