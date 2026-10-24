ALTER TABLE "inventory_items"
ADD COLUMN "default_presentation_type" VARCHAR(50),
ADD COLUMN "default_presentation_content" DECIMAL(18, 6);

ALTER TABLE "inventory_items"
ADD CONSTRAINT "inventory_items_default_presentation_check"
CHECK (
  ("default_presentation_type" IS NULL AND "default_presentation_content" IS NULL)
  OR
  (
    LENGTH(BTRIM("default_presentation_type")) > 0
    AND "default_presentation_content" > 0
  )
);
