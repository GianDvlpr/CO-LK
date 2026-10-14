import { PickPackWorkspace } from "@/components/pick-pack/pick-pack-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function PickPackPage() {
  const user = await requirePermission("pick_pack.read");
  return <PickPackWorkspace permissions={user.permissions} />;
}
