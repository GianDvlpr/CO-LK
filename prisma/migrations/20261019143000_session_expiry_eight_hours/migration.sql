UPDATE "sessions"
SET "expires_at" = LEAST("expires_at", "created_at" + INTERVAL '8 hours')
WHERE "ended_at" IS NULL;
