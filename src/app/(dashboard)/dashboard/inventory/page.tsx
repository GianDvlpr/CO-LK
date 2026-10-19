import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function InventoryPage() {
  const user = await requirePagePermission("inventory.read");
  return <InventoryWorkspace permissions={user.permissions} canCreate={user.permissions.includes("inventory.create_item")} canOpenStock={user.permissions.includes("inventory.opening_import")} />;
}
