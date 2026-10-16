import { SessionsWorkspace } from "@/components/sessions/sessions-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function SessionsPage() {
  const user = await requirePermission("sessions.read");
  return <SessionsWorkspace canRevoke={user.permissions.includes("sessions.revoke")} />;
}
