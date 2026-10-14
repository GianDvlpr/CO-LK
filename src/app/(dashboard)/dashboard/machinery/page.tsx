import { MachineryWorkspace } from "@/components/machinery/machinery-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function MachineryPage() {
  const user = await requirePermission("machinery.read");
  return <MachineryWorkspace permissions={user.permissions} />;
}
