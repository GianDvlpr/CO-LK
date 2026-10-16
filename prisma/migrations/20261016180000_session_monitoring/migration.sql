CREATE TYPE "SessionEndReason" AS ENUM ('LOGOUT', 'REVOKED', 'PASSWORD_RESET', 'ACCOUNT_DISABLED', 'EXPIRED');

ALTER TABLE "sessions"
ADD COLUMN "ip_address" TEXT,
ADD COLUMN "user_agent" TEXT,
ADD COLUMN "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "ended_at" TIMESTAMP(3),
ADD COLUMN "end_reason" "SessionEndReason",
ADD COLUMN "ended_by_id" UUID;

UPDATE "sessions" SET "last_seen_at" = "created_at";

ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_ended_by_id_fkey"
FOREIGN KEY ("ended_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sessions_user_id_created_at_idx" ON "sessions"("user_id", "created_at");
CREATE INDEX "sessions_ended_at_expires_at_idx" ON "sessions"("ended_at", "expires_at");

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action", "description")
SELECT gen_random_uuid(), "id", 'sessions.read', 'sessions', 'read', 'Ver historial y sesiones activas'
FROM "companies"
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action", "description")
SELECT gen_random_uuid(), "id", 'sessions.revoke', 'sessions', 'revoke', 'Cerrar sesiones activas de otros usuarios'
FROM "companies"
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."company_id" = role."company_id"
WHERE role."code" = 'SUPERADMIN'
  AND permission."code" IN ('sessions.read', 'sessions.revoke')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
