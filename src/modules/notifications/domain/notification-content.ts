export type NotificationContent = { type: string; title: string; message: string };

export function notificationContent(eventName: string): NotificationContent | null {
  const exact: Record<string, NotificationContent> = {
    "purchase.approved.v1": { type: "PURCHASE_APPROVED", title: "Compra aprobada", message: "La compra fue aprobada y el inventario se actualizó." },
    "production.release.v1": { type: "PRODUCTION_RELEASED", title: "Producción liberada", message: "La orden reservó los materiales necesarios." },
    "production.start.v1": { type: "PRODUCTION_STARTED", title: "Producción iniciada", message: "La orden inició y consumió las materias primas." },
    "production.complete.v1": { type: "PRODUCTION_COMPLETED", title: "Producción completada", message: "El producto terminado ingresó al almacén." },
    "order.confirm.v1": { type: "ORDER_CONFIRMED", title: "Pedido confirmado", message: "El pedido confirmó y reservó el stock disponible." },
    "order.dispatch.v1": { type: "ORDER_DISPATCHED", title: "Pedido despachado", message: "El pedido salió del almacén y actualizó el kardex." },
    "import.completed.v1": { type: "IMPORT_COMPLETED", title: "Importación completada", message: "La carga masiva finalizó correctamente." },
    "inventory.opening-posted.v1": { type: "INVENTORY_OPENING", title: "Stock inicial registrado", message: "El saldo inicial fue contabilizado en el kardex." },
  };
  return exact[eventName] ?? null;
}

const notificationPermissions: Record<string, string> = {
  PURCHASE_APPROVED: "purchases.read",
  PRODUCTION_RELEASED: "production.read",
  PRODUCTION_STARTED: "production.read",
  PRODUCTION_COMPLETED: "production.read",
  ORDER_CONFIRMED: "orders.read",
  ORDER_DISPATCHED: "orders.read",
  IMPORT_COMPLETED: "imports.read",
  INVENTORY_OPENING: "inventory.read",
};

export function notificationTypesForPermissions(permissions: string[]) {
  const available = new Set(permissions);
  return Object.entries(notificationPermissions).filter(([, permission]) => available.has(permission)).map(([type]) => type);
}

export function retryDelayMilliseconds(attempt: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}
