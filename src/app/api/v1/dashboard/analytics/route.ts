import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireUser } from "@/modules/auth/application/session-service";
import { buildDailyActivity, sumInventoryByType, sumInventoryByWarehouse, topConsumedMaterials } from "@/modules/dashboard/domain/analytics-series";
import { parseReportPeriod, ReportPeriodError, reportDateFilter } from "@/modules/imports/application/report-period";

function counts<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((result, value) => { result[value] = (result[value] ?? 0) + 1; return result; }, {});
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const permissions = new Set(user.permissions);
    const url = new URL(request.url);
    let period = parseReportPeriod(url.searchParams);
    if (!period) {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const toExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      period = { from, toExclusive, fromText: from.toISOString().slice(0, 10), toText: now.toISOString().slice(0, 10) };
    }
    const companyId = user.companyId;
    const [purchases, orders, production, inventory, consumed] = await Promise.all([
      permissions.has("purchases.read") ? prisma.purchase.findMany({ where: { companyId, receptionDate: reportDateFilter(period) }, select: { status: true, total: true, receptionDate: true } }) : [],
      permissions.has("orders.read") ? prisma.salesOrder.findMany({ where: { companyId, requestedAt: reportDateFilter(period) }, select: { id: true, number: true, status: true, requestedAt: true, promisedAt: true, customer: { select: { name: true } }, lines: { select: { quantity: true, productVariant: { select: { product: { select: { code: true, name: true } } } } } } } }) : [],
      permissions.has("production.read") ? prisma.productionOrder.findMany({ where: { companyId, createdAt: reportDateFilter(period) }, select: { status: true, createdAt: true } }) : [],
      permissions.has("inventory.read") ? prisma.inventoryItem.findMany({ where: { companyId, active: true }, select: { id: true, code: true, name: true, type: true, minimumStock: true, unit: { select: { code: true } }, balances: { where: { lotId: null }, select: { onHandQuantity: true, inventoryValue: true, warehouse: { select: { code: true, name: true } } } } } }) : [],
      permissions.has("production.read") ? prisma.stockMovement.findMany({ where: { item: { companyId }, type: "PRODUCTION_CONSUMPTION", occurredAt: reportDateFilter(period) }, select: { quantity: true, item: { select: { code: true, name: true, unit: { select: { code: true } } } } } }) : [],
    ]);
    const now = new Date();
    const alertLimit = new Date(now); alertLimit.setUTCDate(alertLimit.getUTCDate() + 7);
    const dueAlerts = orders.filter((order) => order.promisedAt && !["DISPATCHED", "CANCELLED"].includes(order.status) && order.promisedAt <= alertLimit).sort((a, b) => a.promisedAt!.getTime() - b.promisedAt!.getTime()).slice(0, 8).map((order) => ({ id: order.id, number: order.number, customer: order.customer.name, promisedAt: order.promisedAt, severity: order.promisedAt! < now ? "OVERDUE" : "DUE_SOON" }));
    const allLowStock = inventory.map((item) => ({ ...item, onHand: item.balances.reduce((sum, balance) => sum + Number(balance.onHandQuantity), 0), value: item.balances.reduce((sum, balance) => sum + Number(balance.inventoryValue), 0) })).filter((item) => item.onHand <= Number(item.minimumStock)).sort((a, b) => (a.onHand - Number(a.minimumStock)) - (b.onHand - Number(b.minimumStock)));
    const lowStock = allLowStock.slice(0, 8).map((item) => ({ id: item.id, code: item.code, name: item.name, unit: item.unit.code, onHand: item.onHand, minimumStock: Number(item.minimumStock) }));
    const productMap = new Map<string, { code: string; name: string; quantity: number }>();
    orders.flatMap((order) => order.lines).forEach((line) => { const product = line.productVariant.product; const current = productMap.get(product.code) ?? { ...product, quantity: 0 }; current.quantity += Number(line.quantity); productMap.set(product.code, current); });
    const activity = buildDailyActivity({ from: period.from, toExclusive: period.toExclusive, purchases: purchases.map((purchase) => purchase.receptionDate), orders: orders.map((order) => order.requestedAt), production: production.map((order) => order.createdAt) });
    const inventoryByType = sumInventoryByType(inventory.map((item) => ({ type: item.type, value: item.balances.reduce((sum, balance) => sum + Number(balance.inventoryValue), 0) })));
    const inventoryByWarehouse = sumInventoryByWarehouse(inventory.flatMap((item) => item.balances.map((balance) => ({ code: balance.warehouse.code, name: balance.warehouse.name, value: Number(balance.inventoryValue) }))));
    const consumedMaterials = topConsumedMaterials(consumed.map((movement) => ({ code: movement.item.code, name: movement.item.name, unit: movement.item.unit.code, quantity: Number(movement.quantity) })));
    return apiSuccess({
      period: { from: period.fromText, to: period.toText },
      activity,
      purchases: { total: purchases.length, value: purchases.reduce((sum, purchase) => sum + Number(purchase.total), 0), statuses: counts(purchases.map((item) => item.status)) },
      orders: { total: orders.length, statuses: counts(orders.map((item) => item.status)), dueAlerts, topProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 6) },
      production: { total: production.length, statuses: counts(production.map((item) => item.status)), consumedMaterials },
      inventory: { totalItems: inventory.length, totalValue: inventory.flatMap((item) => item.balances).reduce((sum, balance) => sum + Number(balance.inventoryValue), 0), lowStock, lowStockCount: allLowStock.length, outOfStock: allLowStock.filter((item) => item.onHand <= 0).length, byType: inventoryByType, byWarehouse: inventoryByWarehouse },
    });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof ReportPeriodError) return apiError("INVALID_PERIOD", error.message, 400);
    throw error;
  }
}
