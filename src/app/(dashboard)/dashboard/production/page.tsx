import { ProductionWorkspace } from "@/components/production/production-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function ProductionPage() {
  const user = await requirePermission("production.read");
  return <ProductionWorkspace permissions={user.permissions} />;
}
