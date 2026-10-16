ALTER TABLE "suppliers"
ADD COLUMN "fiscal_address" TEXT,
ADD COLUMN "ubigeo" VARCHAR(6),
ADD COLUMN "department" TEXT,
ADD COLUMN "province" TEXT,
ADD COLUMN "district" TEXT,
ADD COLUMN "ruc_status" TEXT,
ADD COLUMN "ruc_condition" TEXT,
ADD COLUMN "sunat_source" TEXT,
ADD COLUMN "sunat_checked_at" TIMESTAMP(3);

ALTER TABLE "customers"
ADD COLUMN "fiscal_address" TEXT,
ADD COLUMN "ubigeo" VARCHAR(6),
ADD COLUMN "department" TEXT,
ADD COLUMN "province" TEXT,
ADD COLUMN "district" TEXT,
ADD COLUMN "ruc_status" TEXT,
ADD COLUMN "ruc_condition" TEXT,
ADD COLUMN "sunat_source" TEXT,
ADD COLUMN "sunat_checked_at" TIMESTAMP(3);
