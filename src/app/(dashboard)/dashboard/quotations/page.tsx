import { QuotationsWorkspace } from "@/components/quotations/quotations-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function QuotationsPage() {
  const user = await requirePagePermission("quotations.read");
  return <QuotationsWorkspace permissions={user.permissions} />;
}
