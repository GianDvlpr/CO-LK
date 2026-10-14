-- Enrich product image records with the metadata required for auditing and cleanup.
ALTER TABLE "product_images"
ADD COLUMN "file_name" TEXT NOT NULL DEFAULT 'imagen',
ADD COLUMN "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
ADD COLUMN "size_bytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "created_by_id" UUID,
ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "product_images" AS image
SET "created_by_id" = (
  SELECT "id"
  FROM "users"
  WHERE "users"."company_id" = (
    SELECT "company_id" FROM "products" WHERE "products"."id" = image."product_id"
  )
  ORDER BY "users"."created_at" ASC
  LIMIT 1
)
WHERE image."created_by_id" IS NULL;

DELETE FROM "product_images" WHERE "created_by_id" IS NULL;

ALTER TABLE "product_images" ALTER COLUMN "created_by_id" SET NOT NULL;
ALTER TABLE "product_images" ALTER COLUMN "file_name" DROP DEFAULT;
ALTER TABLE "product_images" ALTER COLUMN "mime_type" DROP DEFAULT;
ALTER TABLE "product_images" ALTER COLUMN "size_bytes" DROP DEFAULT;

CREATE UNIQUE INDEX "product_images_public_id_key" ON "product_images"("public_id");
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");

ALTER TABLE "product_images"
ADD CONSTRAINT "product_images_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
