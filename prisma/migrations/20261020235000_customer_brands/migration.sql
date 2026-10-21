CREATE TABLE "customer_brands" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_brands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_brands_customer_id_name_key"
ON "customer_brands"("customer_id", "name");

CREATE INDEX "customer_brands_customer_id_active_idx"
ON "customer_brands"("customer_id", "active");

ALTER TABLE "customer_brands"
ADD CONSTRAINT "customer_brands_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "production_orders"
ADD COLUMN "customer_brand_id" UUID;

ALTER TABLE "production_orders"
ADD CONSTRAINT "production_orders_customer_brand_id_fkey"
FOREIGN KEY ("customer_brand_id") REFERENCES "customer_brands"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "production_orders_customer_brand_id_idx"
ON "production_orders"("customer_brand_id");
