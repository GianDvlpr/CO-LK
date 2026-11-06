CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED');

CREATE TABLE "quotations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "currency_id" UUID NOT NULL,
    "sales_order_id" UUID,
    "number" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "issue_date" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "promised_at" DATE,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "discount_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(7,4) NOT NULL DEFAULT 18,
    "payment_terms" TEXT,
    "delivery_terms" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quotation_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quotations_sales_order_id_key" ON "quotations"("sales_order_id");
CREATE UNIQUE INDEX "quotations_company_id_number_key" ON "quotations"("company_id", "number");
CREATE INDEX "quotations_company_id_status_issue_date_idx" ON "quotations"("company_id", "status", "issue_date");
CREATE INDEX "quotations_customer_id_issue_date_idx" ON "quotations"("customer_id", "issue_date");
CREATE UNIQUE INDEX "quotation_lines_quotation_id_product_variant_id_key" ON "quotation_lines"("quotation_id", "product_variant_id");
CREATE INDEX "quotation_lines_product_variant_id_idx" ON "quotation_lines"("product_variant_id");

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action")
SELECT gen_random_uuid(), company."id", permission."code", 'quotations', permission."action"
FROM "companies" company
CROSS JOIN (VALUES
    ('quotations.read', 'read'),
    ('quotations.create', 'create'),
    ('quotations.update', 'update'),
    ('quotations.send', 'send'),
    ('quotations.approve', 'approve'),
    ('quotations.reject', 'reject'),
    ('quotations.convert', 'convert'),
    ('quotations.print', 'print')
) AS permission("code", "action")
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."company_id" = role."company_id" AND permission."module" = 'quotations'
WHERE role."code" IN ('SUPERADMIN', 'ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
