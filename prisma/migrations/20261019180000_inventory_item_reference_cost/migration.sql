ALTER TABLE "inventory_items"
  ADD COLUMN "supplier_product_code" TEXT,
  ADD COLUMN "reference_net_price" DECIMAL(18, 6),
  ADD COLUMN "reference_tax_rate" DECIMAL(7, 4);
