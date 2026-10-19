import { ProductionWorkspace } from "@/components/production/production-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function ProductionPage() {
  const user = await requirePagePermission("production.read");
  return <ProductionWorkspace permissions={user.permissions} />;
}
