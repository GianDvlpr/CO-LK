import { CostStructuresWorkspace } from "@/components/costs/cost-structures-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function CostsPage() {
  const user = await requirePagePermission("costs.read");
  return <CostStructuresWorkspace canManage={user.permissions.includes("costs.manage")} />;
}
