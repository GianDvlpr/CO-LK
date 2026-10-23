export const PREPARABLE_ORDER_STATUSES = ["CONFIRMED", "IN_PRODUCTION", "READY"] as const;
export type PreparablesalesOrderStatus = (typeof PREPARABLE_ORDER_STATUSES)[number];

export function canPrepareSalesOrder(status: string): boolean {
  return (PREPARABLE_ORDER_STATUSES as readonly string[]).includes(status);
}
