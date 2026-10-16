CREATE TYPE "TaxDocumentType" AS ENUM ('DNI', 'RUC');

ALTER TABLE "suppliers"
ADD COLUMN "document_type" "TaxDocumentType" NOT NULL DEFAULT 'RUC';

ALTER TABLE "customers"
ADD COLUMN "document_type" "TaxDocumentType" NOT NULL DEFAULT 'RUC';

UPDATE "suppliers"
SET "document_type" = 'DNI'
WHERE "tax_id" ~ '^[0-9]{8}$';

UPDATE "customers"
SET "document_type" = 'DNI'
WHERE "tax_id" ~ '^[0-9]{8}$';
