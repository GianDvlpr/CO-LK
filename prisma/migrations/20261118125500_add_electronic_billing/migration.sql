CREATE TYPE "ElectronicDocumentKind" AS ENUM (
  'INVOICE',
  'RECEIPT',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'SENDER_GUIDE',
  'CARRIER_GUIDE',
  'RETENTION',
  'PERCEPTION',
  'PURCHASE_SETTLEMENT',
  'DAILY_SUMMARY',
  'VOIDED_DOCUMENT',
  'REVERSION'
);

CREATE TYPE "ElectronicDocumentStatus" AS ENUM (
  'SUBMITTING',
  'PENDING',
  'SENT',
  'PROCESSING',
  'ACCEPTED',
  'ACCEPTED_WITH_OBSERVATION',
  'REJECTED',
  'ERROR',
  'VOIDED'
);

CREATE TABLE "electronic_documents" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "sale_id" UUID,
  "created_by_id" UUID,
  "kind" "ElectronicDocumentKind" NOT NULL,
  "status" "ElectronicDocumentStatus" NOT NULL DEFAULT 'SUBMITTING',
  "business_key" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "remote_id" TEXT,
  "series" TEXT,
  "correlativo" TEXT,
  "number" TEXT,
  "remote_status" TEXT,
  "sunat_code" TEXT,
  "sunat_description" TEXT,
  "sunat_notes" JSONB,
  "ticket" TEXT,
  "response" JSONB,
  "last_error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "submitted_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "last_checked_at" TIMESTAMP(3),
  "next_check_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "electronic_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "electronic_documents_company_id_business_key_key" ON "electronic_documents"("company_id", "business_key");
CREATE UNIQUE INDEX "electronic_documents_company_id_idempotency_key_key" ON "electronic_documents"("company_id", "idempotency_key");
CREATE INDEX "electronic_documents_company_id_kind_status_created_at_idx" ON "electronic_documents"("company_id", "kind", "status", "created_at");
CREATE INDEX "electronic_documents_status_next_check_at_idx" ON "electronic_documents"("status", "next_check_at");
CREATE INDEX "electronic_documents_sale_id_created_at_idx" ON "electronic_documents"("sale_id", "created_at");

ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
