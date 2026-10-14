import { CatalogsWorkspace } from "@/components/catalogs/catalogs-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function CatalogsPage() {
  const user = await requirePermission("catalogs.read");
  return <CatalogsWorkspace canManage={user.permissions.includes("catalogs.manage")} />;
}
