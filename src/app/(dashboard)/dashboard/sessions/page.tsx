import { SessionsWorkspace } from "@/components/sessions/sessions-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function SessionsPage() {
  const user = await requirePagePermission("sessions.read");
  return <SessionsWorkspace canRevoke={user.permissions.includes("sessions.revoke")} />;
}
