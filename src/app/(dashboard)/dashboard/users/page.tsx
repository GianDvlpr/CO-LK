import { UsersWorkspace } from "@/components/users/users-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function UsersPage() {
  const user = await requirePermission("users.read");
  return <UsersWorkspace canCreate={user.permissions.includes("users.create")} canDeactivate={user.permissions.includes("users.deactivate")} />;
}
