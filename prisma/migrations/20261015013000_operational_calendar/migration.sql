CREATE TYPE "CalendarEventType" AS ENUM ('INVENTORY', 'MEETING', 'TASK', 'OTHER');
CREATE TYPE "CalendarEventPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "CalendarEventStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

CREATE TABLE "calendar_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "type" "CalendarEventType" NOT NULL DEFAULT 'TASK',
  "priority" "CalendarEventPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "CalendarEventStatus" NOT NULL DEFAULT 'PENDING',
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3),
  "all_day" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "reminder_minutes" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_events_company_id_start_at_idx" ON "calendar_events"("company_id", "start_at");
CREATE INDEX "calendar_events_company_id_status_start_at_idx" ON "calendar_events"("company_id", "status", "start_at");

ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action")
SELECT gen_random_uuid(), c."id", p."code", 'calendar', p."action"
FROM "companies" c
CROSS JOIN (VALUES
  ('calendar.read', 'read'),
  ('calendar.create', 'create'),
  ('calendar.update', 'update'),
  ('calendar.delete', 'delete')
) AS p("code", "action")
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."company_id" = r."company_id" AND p."module" = 'calendar'
WHERE r."code" IN ('SUPERADMIN', 'ADMIN')
ON CONFLICT DO NOTHING;
