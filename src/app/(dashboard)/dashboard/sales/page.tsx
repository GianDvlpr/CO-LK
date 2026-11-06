import { SalesWorkspace } from "@/components/sales/sales-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function SalesPage() {
  const user = await requirePagePermission("sales.read");
  return <SalesWorkspace permissions={user.permissions} />;
}
