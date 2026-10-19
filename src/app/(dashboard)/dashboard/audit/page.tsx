import { AuditWorkspace } from "@/components/audit/audit-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function AuditPage() {
  await requirePagePermission("audit.read");
  return <AuditWorkspace />;
}
