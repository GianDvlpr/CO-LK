ALTER TABLE "warehouses"
ADD COLUMN "description" TEXT,
ADD COLUMN "layout_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "layout_width" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "layout_color" VARCHAR(7) NOT NULL DEFAULT '#1677ff';

CREATE INDEX "warehouses_company_id_layout_order_idx"
ON "warehouses"("company_id", "layout_order");
