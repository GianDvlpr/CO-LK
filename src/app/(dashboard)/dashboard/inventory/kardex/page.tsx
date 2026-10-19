import { KardexWorkspace } from "@/components/inventory/kardex-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function KardexPage() {
  await requirePagePermission("inventory.read");
  return <KardexWorkspace />;
}
