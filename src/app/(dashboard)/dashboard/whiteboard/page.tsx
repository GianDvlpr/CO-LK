import { WhiteboardWorkspace } from "@/components/whiteboard/whiteboard-workspace";
import { isCloudinaryConfigured } from "@/lib/cloudinary/server";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function WhiteboardPage() {
  const user = await requirePagePermission("whiteboard.read");
  return <WhiteboardWorkspace canManage={user.permissions.includes("whiteboard.manage")} cloudinaryConfigured={isCloudinaryConfigured()} />;
}
