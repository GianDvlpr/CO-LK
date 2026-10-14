import { OperationsGuide } from "@/components/guide/operations-guide";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function GuidePage() {
  await requirePermission("dashboard.read");
  return <OperationsGuide />;
}
