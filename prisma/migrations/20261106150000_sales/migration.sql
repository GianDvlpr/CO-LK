CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOIDED');
CREATE TYPE "SalePaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');
CREATE TYPE "SaleDocumentType" AS ENUM ('INVOICE', 'RECEIPT', 'SALE_NOTE', 'OTHER');
CREATE TYPE "SalePaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'CREDIT', 'OTHER');

CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "currency_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" "SalePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "document_type" "SaleDocumentType" NOT NULL,
    "document_series" TEXT,
    "document_number" TEXT,
    "issue_date" DATE NOT NULL,
    "due_date" DATE,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "discount_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(7,4) NOT NULL DEFAULT 18,
    "payment_method" "SalePaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_sales_orders" (
    "sale_id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    CONSTRAINT "sale_sales_orders_pkey" PRIMARY KEY ("sale_id", "sales_order_id")
);

CREATE TABLE "sale_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" "SalePaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_company_id_number_key" ON "sales"("company_id", "number");
CREATE UNIQUE INDEX "sales_company_id_document_type_document_series_document_number_key" ON "sales"("company_id", "document_type", "document_series", "document_number");
CREATE INDEX "sales_company_id_status_issue_date_idx" ON "sales"("company_id", "status", "issue_date");
CREATE INDEX "sales_company_id_payment_status_due_date_idx" ON "sales"("company_id", "payment_status", "due_date");
CREATE INDEX "sales_customer_id_issue_date_idx" ON "sales"("customer_id", "issue_date");
CREATE UNIQUE INDEX "sale_sales_orders_sales_order_id_key" ON "sale_sales_orders"("sales_order_id");
CREATE UNIQUE INDEX "sale_lines_sale_id_product_variant_id_key" ON "sale_lines"("sale_id", "product_variant_id");
CREATE INDEX "sale_lines_product_variant_id_idx" ON "sale_lines"("product_variant_id");
CREATE INDEX "sale_payments_sale_id_payment_date_idx" ON "sale_payments"("sale_id", "payment_date");

ALTER TABLE "sales" ADD CONSTRAINT "sales_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_sales_orders" ADD CONSTRAINT "sale_sales_orders_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_sales_orders" ADD CONSTRAINT "sale_sales_orders_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "company_id", "code", "module", "action")
SELECT gen_random_uuid(), company."id", permission."code", 'sales', permission."action"
FROM "companies" company
CROSS JOIN (VALUES
    ('sales.read', 'read'),
    ('sales.create', 'create'),
    ('sales.update', 'update'),
    ('sales.issue', 'issue'),
    ('sales.void', 'void'),
    ('sales.payment', 'payment'),
    ('sales.print', 'print')
) AS permission("code", "action")
ON CONFLICT ("company_id", "code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
JOIN "permissions" permission ON permission."company_id" = role."company_id" AND permission."module" = 'sales'
WHERE role."code" IN ('SUPERADMIN', 'ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
