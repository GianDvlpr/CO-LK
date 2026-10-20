ALTER TABLE "recipes"
  ALTER COLUMN "product_id" DROP NOT NULL,
  ADD COLUMN "output_item_id" UUID;

ALTER TABLE "recipes"
  ADD CONSTRAINT "recipes_output_item_id_fkey"
  FOREIGN KEY ("output_item_id") REFERENCES "inventory_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "recipes_output_item_id_status_idx"
  ON "recipes"("output_item_id", "status");

ALTER TABLE "inventory_transformations"
  ALTER COLUMN "formula_version_id" DROP NOT NULL,
  ADD COLUMN "recipe_version_id" UUID;

ALTER TABLE "inventory_transformations"
  ADD CONSTRAINT "inventory_transformations_recipe_version_id_fkey"
  FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "inventory_transformations_recipe_version_id_idx"
  ON "inventory_transformations"("recipe_version_id");
