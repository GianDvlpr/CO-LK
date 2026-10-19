import { PickPackWorkspace } from "@/components/pick-pack/pick-pack-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function PickPackPage() {
  const user = await requirePagePermission("pick_pack.read");
  return <PickPackWorkspace permissions={user.permissions} />;
}
