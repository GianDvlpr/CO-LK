import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@prisma/client";

export class OrderError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = "OrderError"; } }
async function lock(tx: Prisma.TransactionClient, warehouseId: string, itemId: string) { const key = `${warehouseId}:${itemId}:GLOBAL`; await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`; }
async function sequence(tx: Prisma.TransactionClient, companyId: string) { const value = await tx.correlativeCounter.upsert({ where: { companyId_scope_year: { companyId, scope: "INVENTORY_POSTING", year: 0 } }, update: { value: { increment: 1 } }, create: { companyId, scope: "INVENTORY_POSTING", year: 0, value: 1 }, select: { value: true } }); return BigInt(value.value); }
async function mainWarehouse(tx: Prisma.TransactionClient, companyId: string) { return (await tx.warehouse.findFirst({ where: { companyId, active: true, code: "PRINCIPAL" } })) ?? await tx.warehouse.findFirst({ where: { companyId, active: true }, orderBy: { name: "asc" } }); }
async function register(tx: Prisma.TransactionClient, companyId: string, userId: string, orderId: string, action: string, status: string) { await tx.auditLog.create({ data: { companyId, userId, entity: "SalesOrder", entityId: orderId, action, afterData: { status } } }); await tx.outboxEvent.create({ data: { companyId, topic: `private-company-${companyId}`, eventName: `order.${action.toLowerCase()}.v1`, aggregateId: orderId, payload: { salesOrderId: orderId, status } } }); }

export async function createSalesOrder(database: PrismaClient, command: { companyId: string; userId: string; number: string; customerId: string; requestedAt: Date; promisedAt?: Date; notes?: string; lines: { productVariantId: string; quantity: Decimal.Value; unitPrice: Decimal.Value }[] }) {
  if (!command.lines.length || new Set(command.lines.map((line) => line.productVariantId)).size !== command.lines.length) throw new OrderError("ORDER_INVALID_LINES", "El pedido requiere variantes únicas.");
  for (const line of command.lines) if (!new Decimal(line.quantity).greaterThan(0) || new Decimal(line.unitPrice).isNegative()) throw new OrderError("ORDER_INVALID_LINES", "Las cantidades deben ser positivas y los precios no pueden ser negativos.");
  return database.$transaction(async (tx) => {
    const [customer, variants] = await Promise.all([tx.customer.findFirst({ where: { id: command.customerId, companyId: command.companyId } }), tx.productVariant.findMany({ where: { id: { in: command.lines.map((line) => line.productVariantId) }, active: true, product: { companyId: command.companyId, active: true } } })]);
    if (!customer || variants.length !== command.lines.length) throw new OrderError("ORDER_INVALID_REFERENCE", "El cliente o alguna variante no es válida.");
    const order = await tx.salesOrder.create({ data: { companyId: command.companyId, customerId: customer.id, number: command.number, requestedAt: command.requestedAt, promisedAt: command.promisedAt, notes: command.notes, lines: { create: command.lines.map((line) => ({ productVariantId: line.productVariantId, quantity: new Decimal(line.quantity), unitPrice: new Decimal(line.unitPrice) })) } } });
    await register(tx, command.companyId, command.userId, order.id, "CREATE", "DRAFT"); return order;
  });
}

export async function updateSalesOrder(database: PrismaClient, command: { companyId: string; userId: string; orderId: string; number: string; customerId: string; requestedAt: Date; promisedAt?: Date; notes?: string; lines: { productVariantId: string; quantity: Decimal.Value; unitPrice: Decimal.Value }[] }) {
  if (!command.lines.length || new Set(command.lines.map((line) => line.productVariantId)).size !== command.lines.length) throw new OrderError("ORDER_INVALID_LINES", "El pedido requiere variantes únicas.");
  for (const line of command.lines) if (!new Decimal(line.quantity).greaterThan(0) || new Decimal(line.unitPrice).isNegative()) throw new OrderError("ORDER_INVALID_LINES", "Las cantidades deben ser positivas y los precios no pueden ser negativos.");
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${command.orderId}::uuid FOR UPDATE`;
    const current = await tx.salesOrder.findFirst({ where: { id: command.orderId, companyId: command.companyId } });
    if (!current) throw new OrderError("ORDER_NOT_FOUND", "El pedido no existe.");
    if (current.status !== "DRAFT") throw new OrderError("ORDER_INVALID_STATE", "Solo se puede editar un pedido en borrador.");
    const [customer, variants] = await Promise.all([
      tx.customer.findFirst({ where: { id: command.customerId, companyId: command.companyId } }),
      tx.productVariant.findMany({ where: { id: { in: command.lines.map((line) => line.productVariantId) }, active: true, product: { companyId: command.companyId, active: true } } }),
    ]);
    if (!customer || variants.length !== command.lines.length) throw new OrderError("ORDER_INVALID_REFERENCE", "El cliente o alguna variante no es válida.");
    await tx.salesOrderLine.deleteMany({ where: { salesOrderId: current.id } });
    const order = await tx.salesOrder.update({ where: { id: current.id }, data: { number: command.number, customerId: customer.id, requestedAt: command.requestedAt, promisedAt: command.promisedAt ?? null, notes: command.notes ?? null, lines: { create: command.lines.map((line) => ({ productVariantId: line.productVariantId, quantity: new Decimal(line.quantity), unitPrice: new Decimal(line.unitPrice) })) } } });
    await register(tx, command.companyId, command.userId, order.id, "UPDATE", "DRAFT");
    return order;
  });
}

export async function confirmSalesOrder(database: PrismaClient, command: { companyId: string; userId: string; orderId: string }) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${command.orderId}::uuid FOR UPDATE`; const order = await tx.salesOrder.findFirst({ where: { id: command.orderId, companyId: command.companyId }, include: { lines: { include: { productVariant: true } } } });
    if (!order) throw new OrderError("ORDER_NOT_FOUND", "El pedido no existe."); if (order.status !== "DRAFT") throw new OrderError("ORDER_INVALID_STATE", "Solo puede confirmarse un pedido en borrador."); const warehouse = await mainWarehouse(tx, command.companyId); if (!warehouse) throw new OrderError("ORDER_NO_WAREHOUSE", "No existe un almacén activo para reservar stock.");
    for (const line of order.lines) { const itemId = line.productVariant.inventoryItemId; await lock(tx, warehouse.id, itemId); const balance = await tx.stockBalance.findFirst({ where: { warehouseId: warehouse.id, itemId, lotId: null } }); const available = new Decimal(balance?.onHandQuantity.toString() ?? 0).sub(balance?.reservedQuantity.toString() ?? 0); if (!balance || available.lessThan(line.quantity.toString())) throw new OrderError("ORDER_INSUFFICIENT_STOCK", `No existe stock disponible suficiente para ${line.productVariant.sku}.`); await tx.stockBalance.update({ where: { id: balance.id }, data: { reservedQuantity: { increment: line.quantity } } }); await tx.stockReservation.create({ data: { itemId, warehouseId: warehouse.id, referenceType: "SALES_ORDER", referenceId: order.id, quantity: line.quantity } }); }
    const result = await tx.salesOrder.update({ where: { id: order.id }, data: { status: "CONFIRMED" } }); await register(tx, command.companyId, command.userId, order.id, "CONFIRM", "CONFIRMED"); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function dispatchSalesOrder(database: PrismaClient, command: { companyId: string; userId: string; orderId: string }) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${command.orderId}::uuid FOR UPDATE`; const order = await tx.salesOrder.findFirst({ where: { id: command.orderId, companyId: command.companyId }, include: { lines: { include: { productVariant: true } } } });
    if (!order) throw new OrderError("ORDER_NOT_FOUND", "El pedido no existe."); if (!(["CONFIRMED", "READY"] as string[]).includes(order.status)) throw new OrderError("ORDER_INVALID_STATE", "Solo puede despacharse un pedido confirmado o listo."); const warehouse = await mainWarehouse(tx, command.companyId); if (!warehouse) throw new OrderError("ORDER_NO_WAREHOUSE", "No existe un almacén activo para despachar.");
    for (const line of order.lines) { const itemId = line.productVariant.inventoryItemId; const quantity = new Decimal(line.quantity.toString()); await lock(tx, warehouse.id, itemId); const balance = await tx.stockBalance.findFirst({ where: { warehouseId: warehouse.id, itemId, lotId: null } }); if (!balance || new Decimal(balance.onHandQuantity.toString()).lessThan(quantity) || new Decimal(balance.reservedQuantity.toString()).lessThan(quantity)) throw new OrderError("ORDER_INSUFFICIENT_STOCK", `El saldo reservado de ${line.productVariant.sku} ya no es suficiente.`); const unitCost = new Decimal(balance.averageUnitCost.toString()); const nextQty = new Decimal(balance.onHandQuantity.toString()).sub(quantity); const movementValue = quantity.mul(unitCost).toDecimalPlaces(4); const nextValue = nextQty.isZero() ? new Decimal(0) : new Decimal(balance.inventoryValue.toString()).sub(movementValue).toDecimalPlaces(4); await tx.stockBalance.update({ where: { id: balance.id }, data: { onHandQuantity: nextQty, reservedQuantity: { decrement: quantity }, inventoryValue: nextValue, averageUnitCost: nextQty.isZero() ? 0 : unitCost } }); await tx.stockMovement.create({ data: { itemId, warehouseId: warehouse.id, type: "SALES_DISPATCH", quantity: quantity.neg(), unitCost, movementValue: movementValue.neg(), balanceAfter: nextQty, valueAfter: nextValue, averageCostAfter: nextQty.isZero() ? 0 : unitCost, referenceType: "SALES_ORDER", referenceId: order.id, postingSequence: await sequence(tx, command.companyId), createdById: command.userId } }); }
    await tx.stockReservation.updateMany({ where: { referenceType: "SALES_ORDER", referenceId: order.id, active: true }, data: { active: false } }); const result = await tx.salesOrder.update({ where: { id: order.id }, data: { status: "DISPATCHED" } }); await register(tx, command.companyId, command.userId, order.id, "DISPATCH", "DISPATCHED"); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
