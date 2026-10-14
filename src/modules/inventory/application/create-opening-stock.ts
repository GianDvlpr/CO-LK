import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@prisma/client";
import { calculateMovingAverage } from "../domain/calculate-moving-average";
import { InventoryApplicationError } from "./inventory-errors";

export type CreateOpeningStockCommand = {
  companyId: string;
  createdById: string;
  referenceNumber: string;
  itemId: string;
  warehouseId: string;
  quantity: Decimal.Value;
  unitCost: Decimal.Value;
  lotCode?: string;
  occurredAt: Date;
};

async function nextPostingSequence(tx: Prisma.TransactionClient, companyId: string) {
  const counter = await tx.correlativeCounter.upsert({
    where: { companyId_scope_year: { companyId, scope: "INVENTORY_POSTING", year: 0 } },
    update: { value: { increment: 1 } },
    create: { companyId, scope: "INVENTORY_POSTING", year: 0, value: 1 },
    select: { value: true },
  });
  return BigInt(counter.value);
}

async function addBalance(tx: Prisma.TransactionClient, warehouseId: string, itemId: string, lotId: string | null, quantity: Decimal, unitCost: Decimal) {
  const key = `${warehouseId}:${itemId}:${lotId ?? "GLOBAL"}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const current = await tx.stockBalance.findFirst({ where: { warehouseId, itemId, lotId } });
  const next = calculateMovingAverage({
    currentQuantity: current?.onHandQuantity.toString() ?? 0,
    currentValue: current?.inventoryValue.toString() ?? 0,
    incomingQuantity: quantity,
    incomingUnitCost: unitCost,
  });
  const balanceData = { onHandQuantity: next.onHandQuantity, inventoryValue: next.inventoryValue, averageUnitCost: next.averageUnitCost };
  if (current) {
    await tx.stockBalance.update({ where: { id: current.id }, data: balanceData });
  } else {
    await tx.stockBalance.create({ data: { warehouseId, itemId, lotId, ...balanceData } });
  }
  return next;
}

export async function createOpeningStock(database: PrismaClient, command: CreateOpeningStockCommand) {
  const quantity = new Decimal(command.quantity);
  const unitCost = new Decimal(command.unitCost);
  if (!quantity.greaterThan(0) || unitCost.isNegative()) {
    throw new InventoryApplicationError("INVENTORY_INVALID_QUANTITY", "La cantidad debe ser positiva y el costo no puede ser negativo.");
  }

  return database.$transaction(async (tx) => {
    const [item, warehouse] = await Promise.all([
      tx.inventoryItem.findFirst({ where: { id: command.itemId, companyId: command.companyId, active: true } }),
      tx.warehouse.findFirst({ where: { id: command.warehouseId, companyId: command.companyId, active: true } }),
    ]);
    if (!item || !warehouse) throw new InventoryApplicationError("INVENTORY_INVALID_REFERENCE", "El ítem o almacén no es válido.");
    if (item.lotTrackingMode === "REQUIRED" && !command.lotCode) throw new InventoryApplicationError("INVENTORY_INVALID_LOT", "El ítem requiere un código de lote.");
    if (item.lotTrackingMode === "NONE" && command.lotCode) throw new InventoryApplicationError("INVENTORY_INVALID_LOT", "El ítem no admite control por lote.");

    const previousMovement = await tx.stockMovement.findFirst({
      where: command.lotCode
        ? { itemId: command.itemId, warehouseId: command.warehouseId, lot: { lotCode: command.lotCode } }
        : { itemId: command.itemId, warehouseId: command.warehouseId },
      select: { id: true },
    });
    if (previousMovement) throw new InventoryApplicationError("INVENTORY_OPENING_ALREADY_EXISTS", command.lotCode ? "Ese lote ya tiene movimientos y no admite un saldo inicial." : "El ítem ya tiene movimientos en este almacén y no admite un saldo inicial.");

    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        companyId: command.companyId,
        warehouseId: command.warehouseId,
        number: command.referenceNumber,
        reason: "Saldo inicial de implementación",
        status: "APPROVED",
        lines: { create: { itemId: command.itemId, quantity, unitCost } },
      },
    });
    const lot = command.lotCode ? await tx.inventoryLot.upsert({
      where: { warehouseId_itemId_lotCode: { warehouseId: command.warehouseId, itemId: command.itemId, lotCode: command.lotCode } },
      update: {},
      create: { warehouseId: command.warehouseId, itemId: command.itemId, lotCode: command.lotCode, receivedAt: command.occurredAt },
    }) : null;
    const global = await addBalance(tx, command.warehouseId, command.itemId, null, quantity, unitCost);
    if (lot) await addBalance(tx, command.warehouseId, command.itemId, lot.id, quantity, unitCost);
    const movement = await tx.stockMovement.create({
      data: {
        itemId: command.itemId,
        warehouseId: command.warehouseId,
        lotId: lot?.id,
        type: "ADJUSTMENT_IN",
        quantity,
        unitCost,
        movementValue: quantity.mul(unitCost).toDecimalPlaces(4),
        balanceAfter: global.onHandQuantity,
        valueAfter: global.inventoryValue,
        averageCostAfter: global.averageUnitCost,
        referenceType: "INVENTORY_OPENING",
        referenceId: adjustment.id,
        occurredAt: command.occurredAt,
        postingSequence: await nextPostingSequence(tx, command.companyId),
        createdById: command.createdById,
      },
    });
    await tx.auditLog.create({ data: { companyId: command.companyId, userId: command.createdById, entity: "InventoryAdjustment", entityId: adjustment.id, action: "OPENING_STOCK", afterData: { itemId: command.itemId, quantity: quantity.toString(), unitCost: unitCost.toString() } } });
    await tx.outboxEvent.create({ data: { companyId: command.companyId, topic: `private-company-${command.companyId}`, eventName: "inventory.opening-posted.v1", aggregateId: adjustment.id, payload: { adjustmentId: adjustment.id, itemId: command.itemId } } });
    return movement;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
