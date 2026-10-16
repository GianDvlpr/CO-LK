ALTER TABLE "customers"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "customers_company_id_active_name_idx"
ON "customers"("company_id", "active", "name");
