import { RolesWorkspace } from "@/components/roles/roles-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function RolesPage() {
  const user = await requirePermission("roles.read");
  return <RolesWorkspace canManage={user.permissions.includes("roles.manage")} />;
}
