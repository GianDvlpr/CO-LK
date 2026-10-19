ALTER TABLE "audit_logs"
  ADD COLUMN "module" TEXT,
  ADD COLUMN "result" TEXT NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "user_agent" TEXT,
  ADD COLUMN "request_path" TEXT;

CREATE OR REPLACE FUNCTION lk_audit_module_for_entity(entity_name TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN entity_name = 'Module' THEN NULL
    WHEN entity_name LIKE 'Catalog:%' THEN 'catalogs'
    WHEN entity_name IN ('User', 'PasswordReset') THEN 'users'
    WHEN entity_name = 'Role' THEN 'roles'
    WHEN entity_name = 'Session' THEN 'sessions'
    WHEN entity_name IN ('Purchase', 'PurchaseApproval') THEN 'purchases'
    WHEN entity_name IN ('InventoryItem', 'InventoryAdjustment', 'StockMovement') THEN 'inventory'
    WHEN entity_name IN ('Recipe', 'RecipeVersion') THEN 'recipes'
    WHEN entity_name IN ('ProductionOrder', 'ProductionMaterial') THEN 'production'
    WHEN entity_name IN ('Machine', 'MachineMaintenance') THEN 'machinery'
    WHEN entity_name IN ('Product', 'ProductImage', 'ProductVariant') THEN 'products'
    WHEN entity_name = 'SalesOrder' THEN 'orders'
    WHEN entity_name = 'PickPackOrder' THEN 'pick-pack'
    WHEN entity_name = 'CalendarEvent' THEN 'calendar'
    WHEN entity_name = 'ImportJob' THEN 'imports'
    WHEN entity_name = 'ExchangeRate' THEN 'catalogs'
    WHEN entity_name = 'AuditLog' THEN 'audit'
    ELSE 'system'
  END;
$$;

UPDATE "audit_logs"
SET "module" = lk_audit_module_for_entity("entity")
WHERE "module" IS NULL AND "entity" <> 'Module';

CREATE OR REPLACE FUNCTION lk_set_audit_module()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."module" IS NULL THEN
    NEW."module" := lk_audit_module_for_entity(NEW."entity");
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "audit_logs_set_module"
BEFORE INSERT OR UPDATE OF "entity", "module" ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION lk_set_audit_module();

CREATE INDEX "audit_logs_company_id_module_created_at_idx"
  ON "audit_logs"("company_id", "module", "created_at");
CREATE INDEX "audit_logs_company_id_user_id_created_at_idx"
  ON "audit_logs"("company_id", "user_id", "created_at");

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action", "description")
SELECT gen_random_uuid(), c."id", 'audit.read', 'audit', 'read', 'Consultar y exportar la trazabilidad de usuarios'
FROM "companies" c
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."company_id" = r."company_id" AND p."code" = 'audit.read'
WHERE r."code" = 'SUPERADMIN'
ON CONFLICT DO NOTHING;
