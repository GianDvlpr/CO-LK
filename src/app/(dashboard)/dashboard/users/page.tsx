import { UsersWorkspace } from "@/components/users/users-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function UsersPage() {
  const user = await requirePermission("users.read");
  return <UsersWorkspace currentUserId={user.id} canCreate={user.permissions.includes("users.create")} canUpdate={user.permissions.includes("users.update")} canDeactivate={user.permissions.includes("users.deactivate")} canResetPassword={user.roles.includes("SUPERADMIN")} />;
}
