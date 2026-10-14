import { PurchasesWorkspace } from "@/components/purchases/purchases-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function PurchasesPage() {
  const user = await requirePermission("purchases.read");
  return <PurchasesWorkspace permissions={user.permissions} canCreate={user.permissions.includes("purchases.create")} canApprove={user.permissions.includes("purchases.approve")} canReject={user.permissions.includes("purchases.reject")} />;
}
