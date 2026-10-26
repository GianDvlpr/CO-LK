ALTER TABLE "recipe_versions"
ADD COLUMN "calculated_cost" DECIMAL(18,6),
ADD COLUMN "manual_cost" DECIMAL(18,6);
