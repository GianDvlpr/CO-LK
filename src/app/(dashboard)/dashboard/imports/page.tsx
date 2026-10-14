import { ImportsOverview } from "@/components/imports/imports-overview";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function ImportsPage() {
  const user = await requirePermission("imports.read");
  return <ImportsOverview permissions={user.permissions} />;
}
