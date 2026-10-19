import { MachineryWorkspace } from "@/components/machinery/machinery-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function MachineryPage() {
  const user = await requirePagePermission("machinery.read");
  return <MachineryWorkspace permissions={user.permissions} />;
}
