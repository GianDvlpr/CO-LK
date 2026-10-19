import { OrdersWorkspace } from "@/components/orders/orders-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function OrdersPage() {
  const user = await requirePagePermission("orders.read");
  return <OrdersWorkspace permissions={user.permissions} />;
}
