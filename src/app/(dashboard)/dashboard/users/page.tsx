import { isCloudinaryConfigured } from "@/lib/cloudinary/server";
import { UsersWorkspace } from "@/components/users/users-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function UsersPage() {
  const user = await requirePagePermission("users.read");
  return <UsersWorkspace currentUserId={user.id} canCreate={user.permissions.includes("users.create")} canUpdate={user.permissions.includes("users.update")} canDeactivate={user.permissions.includes("users.deactivate")} canResetPassword={user.roles.includes("SUPERADMIN")} cloudinaryConfigured={isCloudinaryConfigured()} />;
}
