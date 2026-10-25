CREATE TABLE "whiteboards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "updated_by_id" UUID NOT NULL,
  "content" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whiteboards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whiteboard_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "whiteboard_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "public_id" TEXT NOT NULL,
  "secure_url" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whiteboard_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whiteboards_company_id_key" ON "whiteboards"("company_id");
CREATE UNIQUE INDEX "whiteboard_assets_public_id_key" ON "whiteboard_assets"("public_id");
CREATE INDEX "whiteboard_assets_whiteboard_id_created_at_idx" ON "whiteboard_assets"("whiteboard_id", "created_at");

ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whiteboard_assets" ADD CONSTRAINT "whiteboard_assets_whiteboard_id_fkey" FOREIGN KEY ("whiteboard_id") REFERENCES "whiteboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboard_assets" ADD CONSTRAINT "whiteboard_assets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action")
SELECT gen_random_uuid(), c."id", p."code", 'whiteboard', p."action"
FROM "companies" c
CROSS JOIN (VALUES
  ('whiteboard.read', 'read'),
  ('whiteboard.manage', 'manage')
) AS p("code", "action")
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."company_id" = r."company_id" AND p."module" = 'whiteboard'
WHERE r."code" IN ('SUPERADMIN', 'ADMIN')
ON CONFLICT DO NOTHING;
