import { OperationsGuide } from "@/components/guide/operations-guide";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function GuidePage() {
  await requirePagePermission("dashboard.read");
  return <OperationsGuide />;
}
