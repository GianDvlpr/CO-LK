ALTER TABLE "recipe_ingredients"
DROP COLUMN "waste_percentage";

ALTER TABLE "production_materials"
ADD COLUMN "actual_waste_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0;
