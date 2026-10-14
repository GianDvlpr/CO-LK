CREATE TYPE "PickPackStatus" AS ENUM ('PENDING', 'PICKING', 'PACKING', 'READY', 'DISPATCHED', 'CANCELLED');
CREATE TYPE "PickPackPriority" AS ENUM ('NORMAL', 'URGENT');
CREATE TYPE "PickPackIncidentType" AS ENUM ('SHORTAGE', 'DAMAGED', 'SUBSTITUTION', 'OTHER');

CREATE TABLE "pick_pack_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "picker_id" UUID,
  "packer_id" UUID,
  "number" TEXT NOT NULL,
  "priority" "PickPackPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "PickPackStatus" NOT NULL DEFAULT 'PENDING',
  "started_at" TIMESTAMP(3),
  "packing_started_at" TIMESTAMP(3),
  "ready_at" TIMESTAMP(3),
  "dispatched_at" TIMESTAMP(3),
  "carrier" TEXT,
  "shipping_document" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pick_pack_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pick_pack_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pick_pack_order_id" UUID NOT NULL,
  "sales_order_line_id" UUID NOT NULL,
  "warehouse_location" TEXT,
  "lot_code" TEXT,
  "requested_quantity" DECIMAL(18,6) NOT NULL,
  "picked_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "packed_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "incident_type" "PickPackIncidentType",
  "incident_reason" TEXT,
  "notes" TEXT,
  CONSTRAINT "pick_pack_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pick_pack_packages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pick_pack_order_id" UUID NOT NULL,
  "package_number" INTEGER NOT NULL,
  "package_type" TEXT,
  "weight" DECIMAL(18,3),
  "length" DECIMAL(18,2),
  "width" DECIMAL(18,2),
  "height" DECIMAL(18,2),
  "notes" TEXT,
  CONSTRAINT "pick_pack_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pick_pack_orders_sales_order_id_key" ON "pick_pack_orders"("sales_order_id");
CREATE UNIQUE INDEX "pick_pack_orders_company_id_number_key" ON "pick_pack_orders"("company_id", "number");
CREATE INDEX "pick_pack_orders_company_id_status_created_at_idx" ON "pick_pack_orders"("company_id", "status", "created_at");
CREATE UNIQUE INDEX "pick_pack_lines_sales_order_line_id_key" ON "pick_pack_lines"("sales_order_line_id");
CREATE INDEX "pick_pack_lines_pick_pack_order_id_idx" ON "pick_pack_lines"("pick_pack_order_id");
CREATE UNIQUE INDEX "pick_pack_packages_pick_pack_order_id_package_number_key" ON "pick_pack_packages"("pick_pack_order_id", "package_number");

ALTER TABLE "pick_pack_orders" ADD CONSTRAINT "pick_pack_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pick_pack_orders" ADD CONSTRAINT "pick_pack_orders_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pick_pack_orders" ADD CONSTRAINT "pick_pack_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pick_pack_orders" ADD CONSTRAINT "pick_pack_orders_picker_id_fkey" FOREIGN KEY ("picker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pick_pack_orders" ADD CONSTRAINT "pick_pack_orders_packer_id_fkey" FOREIGN KEY ("packer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pick_pack_lines" ADD CONSTRAINT "pick_pack_lines_pick_pack_order_id_fkey" FOREIGN KEY ("pick_pack_order_id") REFERENCES "pick_pack_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pick_pack_lines" ADD CONSTRAINT "pick_pack_lines_sales_order_line_id_fkey" FOREIGN KEY ("sales_order_line_id") REFERENCES "sales_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pick_pack_packages" ADD CONSTRAINT "pick_pack_packages_pick_pack_order_id_fkey" FOREIGN KEY ("pick_pack_order_id") REFERENCES "pick_pack_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action")
SELECT gen_random_uuid(), c."id", p."code", 'pick_pack', p."action"
FROM "companies" c
CROSS JOIN (VALUES
  ('pick_pack.read', 'read'),
  ('pick_pack.create', 'create'),
  ('pick_pack.update', 'update'),
  ('pick_pack.ready', 'ready'),
  ('pick_pack.print', 'print')
) AS p("code", "action")
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."company_id" = r."company_id" AND p."module" = 'pick_pack'
WHERE r."code" IN ('SUPERADMIN', 'ADMIN')
ON CONFLICT DO NOTHING;
