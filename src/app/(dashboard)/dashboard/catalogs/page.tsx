import { CatalogsWorkspace } from "@/components/catalogs/catalogs-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function CatalogsPage() {
  const user = await requirePagePermission("catalogs.read");
  return <CatalogsWorkspace canManage={user.permissions.includes("catalogs.manage")} />;
}
