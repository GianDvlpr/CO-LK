import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function InventoryPage() {
  const user = await requirePermission("inventory.read");
  return <InventoryWorkspace permissions={user.permissions} canCreate={user.permissions.includes("inventory.create_item")} canOpenStock={user.permissions.includes("inventory.opening_import")} />;
}
