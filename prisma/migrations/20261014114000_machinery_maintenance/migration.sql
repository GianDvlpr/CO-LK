CREATE TYPE "MachineType" AS ENUM ('PRESS', 'INJECTOR', 'OTHER');
CREATE TYPE "MachineStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE');
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'REPAIR');

CREATE TABLE "machines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "MachineType" NOT NULL,
  "brand" TEXT,
  "model" TEXT,
  "serial_number" TEXT,
  "location" TEXT,
  "status" "MachineStatus" NOT NULL DEFAULT 'ACTIVE',
  "purchase_date" DATE,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "machine_maintenance_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "machine_id" UUID NOT NULL,
  "type" "MaintenanceType" NOT NULL,
  "performed_at" DATE NOT NULL,
  "next_due_at" DATE,
  "provider" TEXT,
  "description" TEXT NOT NULL,
  "cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "downtime_hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "machine_maintenance_records_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "production_orders" ADD COLUMN "machine_id" UUID;
CREATE UNIQUE INDEX "machines_company_id_code_key" ON "machines"("company_id", "code");
CREATE INDEX "machines_company_id_status_type_idx" ON "machines"("company_id", "status", "type");
CREATE INDEX "machine_maintenance_records_machine_id_performed_at_idx" ON "machine_maintenance_records"("machine_id", "performed_at");
CREATE INDEX "machine_maintenance_records_next_due_at_idx" ON "machine_maintenance_records"("next_due_at");
ALTER TABLE "machines" ADD CONSTRAINT "machines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "machine_maintenance_records" ADD CONSTRAINT "machine_maintenance_records_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action")
SELECT gen_random_uuid(), c."id", p."code", 'machinery', p."action"
FROM "companies" c
CROSS JOIN (VALUES ('machinery.read', 'read'), ('machinery.create', 'create'), ('machinery.maintenance', 'maintenance')) AS p("code", "action")
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."company_id" = r."company_id" AND p."module" = 'machinery'
WHERE r."code" IN ('SUPERADMIN', 'ADMIN')
ON CONFLICT DO NOTHING;
