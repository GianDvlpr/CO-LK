ALTER TABLE "pick_pack_orders" DROP CONSTRAINT IF EXISTS "pick_pack_orders_picker_id_fkey";
ALTER TABLE "pick_pack_orders" DROP CONSTRAINT IF EXISTS "pick_pack_orders_packer_id_fkey";
ALTER TABLE "pick_pack_orders" DROP COLUMN IF EXISTS "picker_id";
ALTER TABLE "pick_pack_orders" DROP COLUMN IF EXISTS "packer_id";
