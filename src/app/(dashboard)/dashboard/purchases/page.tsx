import { PurchasesWorkspace } from "@/components/purchases/purchases-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function PurchasesPage() {
  const user = await requirePagePermission("purchases.read");
  return <PurchasesWorkspace permissions={user.permissions} canCreate={user.permissions.includes("purchases.create")} canApprove={user.permissions.includes("purchases.approve")} canReject={user.permissions.includes("purchases.reject")} />;
}
