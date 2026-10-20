CREATE TABLE "inventory_item_images" (
  "id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "public_id" TEXT NOT NULL,
  "secure_url" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_item_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_item_images_public_id_key" ON "inventory_item_images"("public_id");
CREATE INDEX "inventory_item_images_item_id_sort_order_idx" ON "inventory_item_images"("item_id", "sort_order");

ALTER TABLE "inventory_item_images"
  ADD CONSTRAINT "inventory_item_images_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_item_images"
  ADD CONSTRAINT "inventory_item_images_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action", "description")
SELECT gen_random_uuid(), c."id", 'inventory.image_manage', 'inventory', 'image_manage', 'Cargar y eliminar imágenes de materias primas'
FROM "companies" c
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."company_id" = r."company_id" AND p."code" = 'inventory.image_manage'
WHERE r."code" IN ('SUPERADMIN', 'ADMIN')
ON CONFLICT DO NOTHING;
