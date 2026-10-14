import { KardexWorkspace } from "@/components/inventory/kardex-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function KardexPage() {
  await requirePermission("inventory.read");
  return <KardexWorkspace />;
}
