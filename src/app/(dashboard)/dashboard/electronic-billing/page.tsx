import { ElectronicBillingWorkspace } from "@/components/electronic-billing/electronic-billing-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function ElectronicBillingPage() {
  const user = await requirePermission("sales.read");
  return <ElectronicBillingWorkspace permissions={user.permissions} />;
}
