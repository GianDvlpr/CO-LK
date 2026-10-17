DROP INDEX IF EXISTS "inventory_items_company_id_legacy_code_key";

ALTER TABLE "inventory_items"
  DROP COLUMN IF EXISTS "legacy_code",
  DROP COLUMN IF EXISTS "legacy_secondary_code";
