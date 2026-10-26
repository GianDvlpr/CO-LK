ALTER TABLE "whiteboards" ADD COLUMN "title" VARCHAR(120);

UPDATE "whiteboards"
SET "title" = 'Pizarra principal'
WHERE "title" IS NULL;

ALTER TABLE "whiteboards" ALTER COLUMN "title" SET NOT NULL;

DROP INDEX "whiteboards_company_id_key";

CREATE INDEX "whiteboards_company_id_updated_at_idx"
ON "whiteboards"("company_id", "updated_at");
