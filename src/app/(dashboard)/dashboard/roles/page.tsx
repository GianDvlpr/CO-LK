import { RolesWorkspace } from "@/components/roles/roles-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function RolesPage() {
  const user = await requirePagePermission("roles.read");
  return <RolesWorkspace canManage={user.permissions.includes("roles.manage")} />;
}
