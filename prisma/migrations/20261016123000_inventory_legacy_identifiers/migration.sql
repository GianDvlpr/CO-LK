ALTER TABLE "inventory_items"
  ADD COLUMN "legacy_code" TEXT,
  ADD COLUMN "abbreviation" TEXT,
  ADD COLUMN "legacy_secondary_code" TEXT;

CREATE UNIQUE INDEX "inventory_items_company_id_legacy_code_key"
  ON "inventory_items"("company_id", "legacy_code");
