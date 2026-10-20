CREATE TABLE "production_order_sales_orders" (
  "production_order_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  CONSTRAINT "production_order_sales_orders_pkey" PRIMARY KEY ("production_order_id", "sales_order_id")
);

INSERT INTO "production_order_sales_orders" ("production_order_id", "sales_order_id")
SELECT "id", "sales_order_id"
FROM "production_orders"
WHERE "sales_order_id" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX "production_order_sales_orders_sales_order_id_idx"
  ON "production_order_sales_orders"("sales_order_id");

ALTER TABLE "production_order_sales_orders"
  ADD CONSTRAINT "production_order_sales_orders_production_order_id_fkey"
  FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "production_order_sales_orders"
  ADD CONSTRAINT "production_order_sales_orders_sales_order_id_fkey"
  FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "production_orders_sales_order_id_idx";
ALTER TABLE "production_orders" DROP CONSTRAINT IF EXISTS "production_orders_sales_order_id_fkey";
ALTER TABLE "production_orders" DROP COLUMN "sales_order_id";
