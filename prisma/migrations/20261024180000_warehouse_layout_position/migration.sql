ALTER TABLE "warehouses"
ADD COLUMN "layout_x" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "layout_y" INTEGER NOT NULL DEFAULT 0;

UPDATE "warehouses"
SET "layout_x" = ("layout_order" % 3) * 260,
    "layout_y" = ("layout_order" / 3) * 220;
