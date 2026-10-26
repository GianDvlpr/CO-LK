CREATE TABLE "product_cost_structures" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "recipe_version_id" UUID NOT NULL,
    "labor_tariff" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "energy_tariff" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "water_tariff" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "machinery_cost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_cost_structures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_cost_structures_recipe_version_id_key"
ON "product_cost_structures"("recipe_version_id");

CREATE INDEX "product_cost_structures_company_id_updated_at_idx"
ON "product_cost_structures"("company_id", "updated_at");

ALTER TABLE "product_cost_structures"
ADD CONSTRAINT "product_cost_structures_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_cost_structures"
ADD CONSTRAINT "product_cost_structures_recipe_version_id_fkey"
FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_cost_structures"
ADD CONSTRAINT "product_cost_structures_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
