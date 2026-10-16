import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@prisma/client";
import { calculateMovingAverage } from "@/modules/inventory/domain/calculate-moving-average";
import { validateProductionSheetTotals } from "@/modules/production/domain/production-sheet";
import { nextBusinessCode } from "@/lib/database/business-code";

export class ProductionError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = "ProductionError"; } }
async function sequence(tx: Prisma.TransactionClient, companyId: string) { const value = await tx.correlativeCounter.upsert({ where: { companyId_scope_year: { companyId, scope: "INVENTORY_POSTING", year: 0 } }, update: { value: { increment: 1 } }, create: { companyId, scope: "INVENTORY_POSTING", year: 0, value: 1 }, select: { value: true } }); return BigInt(value.value); }
async function lock(tx: Prisma.TransactionClient, warehouseId: string, itemId: string, lotId: string | null) { const key = `${warehouseId}:${itemId}:${lotId ?? "GLOBAL"}`; await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`; }
async function event(tx: Prisma.TransactionClient, companyId: string, userId: string, orderId: string, action: string, status: string) { await tx.auditLog.create({ data: { companyId, userId, entity: "ProductionOrder", entityId: orderId, action, afterData: { status } } }); await tx.outboxEvent.create({ data: { companyId, topic: `private-company-${companyId}`, eventName: `production.${action.toLowerCase()}.v1`, aggregateId: orderId, payload: { productionOrderId: orderId, status } } }); }

export async function createProductionOrder(database: PrismaClient, command: { companyId: string; userId: string; number?: string; warehouseId: string; productVariantId: string; recipeVersionId: string; machineId?: string; recipeRuns: Decimal.Value; plannedAt?: Date; machineEquipment?: string; operatorName?: string; modelLogo?: string; materialLoad?: string; seriesLot?: string; processType?: "PRENSA" | "INYECTORA"; mold?: string; brandColor?: string; pressNumber?: string; pressLoad?: string; injectorNumber?: string; curve?: string; sizeProgram?: { size: string; requestedPairs: number }[]; dailyProduction?: { date: string; size: string; quantity: number; observations?: string }[] }) {
  const runs = new Decimal(command.recipeRuns); if (!runs.greaterThan(0)) throw new ProductionError("PRODUCTION_INVALID_QUANTITY", "El número de ejecuciones debe ser positivo.");
  return database.$transaction(async (tx) => {
    const [warehouse, variant, version, machine] = await Promise.all([
      tx.warehouse.findFirst({ where: { id: command.warehouseId, companyId: command.companyId, active: true } }),
      tx.productVariant.findFirst({ where: { id: command.productVariantId, active: true, product: { companyId: command.companyId } }, include: { product: true } }),
      tx.recipeVersion.findFirst({ where: { id: command.recipeVersionId, isActive: true, recipe: { companyId: command.companyId, status: "ACTIVE" } }, include: { recipe: true, ingredients: true } }),
      command.machineId ? tx.machine.findFirst({ where: { id: command.machineId, companyId: command.companyId, status: { not: "OUT_OF_SERVICE" } } }) : null,
    ]);
    if (!warehouse || !variant || !version || version.recipe.productId !== variant.productId || (command.machineId && !machine)) throw new ProductionError("PRODUCTION_INVALID_REFERENCE", "El almacén, variante, receta activa o máquina no es válido para esta orden.");
    const plannedQuantity = new Decimal(version.yieldQuantity.toString()).mul(runs).toDecimalPlaces(6);
    const sheetIssue = validateProductionSheetTotals({ sizeProgram: command.sizeProgram ?? [], dailyProduction: (command.dailyProduction ?? []).map((entry) => ({ ...entry, date: new Date(entry.date) })) }, plannedQuantity);
    if (sheetIssue) throw new ProductionError("PRODUCTION_SHEET_INVALID", sheetIssue);
    const number = command.number ?? await nextBusinessCode(tx, command.companyId, "PRODUCTION", command.plannedAt);
    const order = await tx.productionOrder.create({ data: { companyId: command.companyId, warehouseId: command.warehouseId, productVariantId: command.productVariantId, recipeVersionId: command.recipeVersionId, machineId: command.machineId || null, number, recipeRuns: runs, plannedQuantity, plannedAt: command.plannedAt, machineEquipment: machine ? `${machine.code} · ${machine.name}` : command.machineEquipment || null, operatorName: command.operatorName || null, modelLogo: command.modelLogo || variant.product.name, materialLoad: command.materialLoad || null, seriesLot: command.seriesLot || null, processType: command.processType || null, mold: command.mold || null, brandColor: command.brandColor || null, pressNumber: command.pressNumber || null, pressLoad: command.pressLoad || null, injectorNumber: command.injectorNumber || null, curve: command.curve || null, sizeProgram: (command.sizeProgram ?? []) as Prisma.InputJsonValue, dailyProduction: (command.dailyProduction ?? []) as Prisma.InputJsonValue, materials: { create: version.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, plannedQuantity: new Decimal(ingredient.quantity.toString()).mul(new Decimal(1).add(new Decimal(ingredient.wastePercentage.toString()).div(100))).mul(runs).toDecimalPlaces(6) })) } } });
    await event(tx, command.companyId, command.userId, order.id, "CREATE", "DRAFT"); return order;
  });
}

export async function releaseProductionOrder(database: PrismaClient, command: { companyId: string; userId: string; orderId: string }) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${command.orderId}::uuid FOR UPDATE`;
    const order = await tx.productionOrder.findFirst({ where: { id: command.orderId, companyId: command.companyId }, include: { materials: true } });
    if (!order) throw new ProductionError("PRODUCTION_NOT_FOUND", "La orden no existe."); if (order.status !== "DRAFT") throw new ProductionError("PRODUCTION_INVALID_STATE", "Solo puede liberarse una orden en borrador.");
    for (const material of order.materials) {
      await lock(tx, order.warehouseId, material.itemId, null); const balance = await tx.stockBalance.findFirst({ where: { warehouseId: order.warehouseId, itemId: material.itemId, lotId: null } }); const available = new Decimal(balance?.onHandQuantity.toString() ?? 0).sub(balance?.reservedQuantity.toString() ?? 0);
      if (!balance || available.lessThan(material.plannedQuantity.toString())) throw new ProductionError("PRODUCTION_INSUFFICIENT_STOCK", "No existe stock disponible suficiente para liberar la orden.");
      await tx.stockBalance.update({ where: { id: balance.id }, data: { reservedQuantity: { increment: material.plannedQuantity } } });
      await tx.stockReservation.create({ data: { itemId: material.itemId, warehouseId: order.warehouseId, referenceType: "PRODUCTION_ORDER", referenceId: order.id, quantity: material.plannedQuantity } });
    }
    const result = await tx.productionOrder.update({ where: { id: order.id }, data: { status: "RELEASED" } }); await event(tx, command.companyId, command.userId, order.id, "RELEASE", "RELEASED"); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function consumeMaterial(tx: Prisma.TransactionClient, companyId: string, userId: string, order: { id: string; warehouseId: string }, material: { id: string; itemId: string; plannedQuantity: Prisma.Decimal }) {
  const required = new Decimal(material.plannedQuantity.toString()); await lock(tx, order.warehouseId, material.itemId, null);
  const [global, item] = await Promise.all([tx.stockBalance.findFirst({ where: { warehouseId: order.warehouseId, itemId: material.itemId, lotId: null } }), tx.inventoryItem.findUnique({ where: { id: material.itemId } })]);
  if (!global || !item || new Decimal(global.onHandQuantity.toString()).lessThan(required)) throw new ProductionError("PRODUCTION_INSUFFICIENT_STOCK", "El stock físico cambió y ya no alcanza para iniciar la orden.");
  const unitCost = new Decimal(global.averageUnitCost.toString()); const newQty = new Decimal(global.onHandQuantity.toString()).sub(required); const movementValue = required.mul(unitCost).toDecimalPlaces(4); const newValue = newQty.isZero() ? new Decimal(0) : new Decimal(global.inventoryValue.toString()).sub(movementValue).toDecimalPlaces(4);
  await tx.stockBalance.update({ where: { id: global.id }, data: { onHandQuantity: newQty, reservedQuantity: { decrement: required }, inventoryValue: newValue, averageUnitCost: newQty.isZero() ? 0 : unitCost } });
  const segments: { lotId: string | null; quantity: Decimal }[] = [];
  if (item.lotTrackingMode === "NONE") segments.push({ lotId: null, quantity: required });
  else {
    const lotBalances = await tx.stockBalance.findMany({ where: { warehouseId: order.warehouseId, itemId: material.itemId, lotId: { not: null }, onHandQuantity: { gt: 0 } }, include: { lot: true } });
    lotBalances.sort((a, b) => (a.lot?.receivedAt?.getTime() ?? 0) - (b.lot?.receivedAt?.getTime() ?? 0) || (a.lot?.lotCode ?? "").localeCompare(b.lot?.lotCode ?? ""));
    let remaining = required;
    for (const balance of lotBalances) {
      if (!remaining.greaterThan(0)) break; const available = new Decimal(balance.onHandQuantity.toString()); const take = Decimal.min(available, remaining); await lock(tx, order.warehouseId, material.itemId, balance.lotId);
      const lotQty = available.sub(take); const lotValue = lotQty.isZero() ? new Decimal(0) : new Decimal(balance.inventoryValue.toString()).sub(take.mul(balance.averageUnitCost.toString())).toDecimalPlaces(4);
      await tx.stockBalance.update({ where: { id: balance.id }, data: { onHandQuantity: lotQty, inventoryValue: lotValue, averageUnitCost: lotQty.isZero() ? 0 : balance.averageUnitCost } }); segments.push({ lotId: balance.lotId, quantity: take }); remaining = remaining.sub(take);
    }
    if (remaining.greaterThan(0)) { if (item.lotTrackingMode === "REQUIRED") throw new ProductionError("PRODUCTION_INSUFFICIENT_LOT_STOCK", `No hay stock por lote suficiente para ${item.code}.`); segments.push({ lotId: null, quantity: remaining }); }
  }
  for (const segment of segments) await tx.stockMovement.create({ data: { itemId: material.itemId, warehouseId: order.warehouseId, lotId: segment.lotId, type: "PRODUCTION_CONSUMPTION", quantity: segment.quantity.neg(), unitCost, movementValue: segment.quantity.mul(unitCost).toDecimalPlaces(4).neg(), balanceAfter: newQty, valueAfter: newValue, averageCostAfter: newQty.isZero() ? 0 : unitCost, referenceType: "PRODUCTION_ORDER", referenceId: order.id, postingSequence: await sequence(tx, companyId), createdById: userId } });
  await tx.productionMaterial.update({ where: { id: material.id }, data: { consumedQuantity: required } });
}

export async function startProductionOrder(database: PrismaClient, command: { companyId: string; userId: string; orderId: string }) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${command.orderId}::uuid FOR UPDATE`; const order = await tx.productionOrder.findFirst({ where: { id: command.orderId, companyId: command.companyId }, include: { materials: true } });
    if (!order) throw new ProductionError("PRODUCTION_NOT_FOUND", "La orden no existe."); if (order.status !== "RELEASED") throw new ProductionError("PRODUCTION_INVALID_STATE", "Solo puede iniciarse una orden liberada.");
    for (const material of order.materials) await consumeMaterial(tx, command.companyId, command.userId, order, material);
    await tx.stockReservation.updateMany({ where: { referenceType: "PRODUCTION_ORDER", referenceId: order.id, active: true }, data: { active: false } });
    const result = await tx.productionOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS", startedAt: new Date() } }); await event(tx, command.companyId, command.userId, order.id, "START", "IN_PROGRESS"); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function completeProductionOrder(database: PrismaClient, command: { companyId: string; userId: string; orderId: string; producedQuantity: Decimal.Value }) {
  const produced = new Decimal(command.producedQuantity); if (!produced.greaterThan(0)) throw new ProductionError("PRODUCTION_INVALID_QUANTITY", "La cantidad producida debe ser mayor que cero.");
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${command.orderId}::uuid FOR UPDATE`; const order = await tx.productionOrder.findFirst({ where: { id: command.orderId, companyId: command.companyId }, include: { productVariant: true } });
    if (!order) throw new ProductionError("PRODUCTION_NOT_FOUND", "La orden no existe."); if (order.status !== "IN_PROGRESS") throw new ProductionError("PRODUCTION_INVALID_STATE", "Solo puede completarse una orden en proceso.");
    const consumed = await tx.stockMovement.aggregate({ where: { referenceType: "PRODUCTION_ORDER", referenceId: order.id, type: "PRODUCTION_CONSUMPTION" }, _sum: { movementValue: true } }); const totalCost = new Decimal(consumed._sum.movementValue?.toString() ?? 0).abs(); const unitCost = totalCost.div(produced).toDecimalPlaces(6);
    await lock(tx, order.warehouseId, order.productVariant.inventoryItemId, null); const current = await tx.stockBalance.findFirst({ where: { warehouseId: order.warehouseId, itemId: order.productVariant.inventoryItemId, lotId: null } }); const next = calculateMovingAverage({ currentQuantity: current?.onHandQuantity.toString() ?? 0, currentValue: current?.inventoryValue.toString() ?? 0, incomingQuantity: produced, incomingUnitCost: unitCost });
    const balanceData = { onHandQuantity: next.onHandQuantity, inventoryValue: next.inventoryValue, averageUnitCost: next.averageUnitCost };
    if (current) await tx.stockBalance.update({ where: { id: current.id }, data: balanceData }); else await tx.stockBalance.create({ data: { warehouseId: order.warehouseId, itemId: order.productVariant.inventoryItemId, lotId: null, ...balanceData } });
    await tx.stockMovement.create({ data: { itemId: order.productVariant.inventoryItemId, warehouseId: order.warehouseId, type: "PRODUCTION_OUTPUT", quantity: produced, unitCost, movementValue: totalCost, balanceAfter: next.onHandQuantity, valueAfter: next.inventoryValue, averageCostAfter: next.averageUnitCost, referenceType: "PRODUCTION_ORDER", referenceId: order.id, postingSequence: await sequence(tx, command.companyId), createdById: command.userId } });
    const result = await tx.productionOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", producedQuantity: produced, completedAt: new Date() } }); await event(tx, command.companyId, command.userId, order.id, "COMPLETE", "COMPLETED"); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
