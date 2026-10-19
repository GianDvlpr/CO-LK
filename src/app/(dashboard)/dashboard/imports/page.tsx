import { ImportsOverview } from "@/components/imports/imports-overview";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function ImportsPage() {
  const user = await requirePagePermission("imports.read");
  return <ImportsOverview permissions={user.permissions} />;
}
