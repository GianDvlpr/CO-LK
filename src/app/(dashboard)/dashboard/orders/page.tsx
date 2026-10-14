import { OrdersWorkspace } from "@/components/orders/orders-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function OrdersPage() {
  const user = await requirePermission("orders.read");
  return <OrdersWorkspace permissions={user.permissions} />;
}
