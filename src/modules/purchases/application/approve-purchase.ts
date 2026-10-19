import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@prisma/client";
import { calculateMovingAverage } from "@/modules/inventory/domain/calculate-moving-average";
import { calculatePurchaseUnitCost } from "../domain/calculate-purchase-unit-cost";
import { PurchaseApplicationError } from "./purchase-errors";

type Database = PrismaClient;

export type ApprovePurchaseCommand = {
  companyId: string;
  purchaseId: string;
  approvedById: string;
  comment?: string;
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

async function lockBalance(tx: Prisma.TransactionClient, warehouseId: string, itemId: string, lotId: string | null) {
  const key = `${warehouseId}:${itemId}:${lotId ?? "GLOBAL"}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

async function addToBalance(
  tx: Prisma.TransactionClient,
  input: { warehouseId: string; itemId: string; lotId: string | null; quantity: Decimal; unitCost: Decimal },
) {
  await lockBalance(tx, input.warehouseId, input.itemId, input.lotId);
  const current = await tx.stockBalance.findFirst({
    where: { warehouseId: input.warehouseId, itemId: input.itemId, lotId: input.lotId },
  });
  const next = calculateMovingAverage({
    currentQuantity: current?.onHandQuantity.toString() ?? 0,
    currentValue: current?.inventoryValue.toString() ?? 0,
    incomingQuantity: input.quantity,
    incomingUnitCost: input.unitCost,
  });

  if (current) {
    await tx.stockBalance.update({
      where: { id: current.id },
      data: {
        onHandQuantity: next.onHandQuantity,
        inventoryValue: next.inventoryValue,
        averageUnitCost: next.averageUnitCost,
      },
    });
  } else {
    await tx.stockBalance.create({
      data: {
        warehouseId: input.warehouseId,
        itemId: input.itemId,
        lotId: input.lotId,
        onHandQuantity: next.onHandQuantity,
        inventoryValue: next.inventoryValue,
        averageUnitCost: next.averageUnitCost,
      },
    });
  }
  return next;
}

export async function approvePurchase(database: Database, command: ApprovePurchaseCommand) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${command.purchaseId}::uuid FOR UPDATE`;
    const purchase = await tx.purchase.findFirst({
      where: { id: command.purchaseId, companyId: command.companyId },
      include: { lines: { include: { item: true, lots: { include: { lot: true } } } } },
    });

    if (!purchase) throw new PurchaseApplicationError("PURCHASE_NOT_FOUND", "La compra no existe.");
    if (purchase.status !== "PENDING") {
      throw new PurchaseApplicationError("PURCHASE_INVALID_STATE", "Solo se puede aprobar una compra pendiente.");
    }

    for (const line of purchase.lines) {
      const receivedQuantity = new Decimal(line.receivedQuantity.toString());
      const unitCostPen = calculatePurchaseUnitCost({
        pricePerBaseUnit: line.pricePerBaseUnit.toString(),
        taxRate: line.taxRate.toString(),
        exchangeRate: purchase.exchangeRate.toString(),
      });
      const lotQuantity = line.lots.reduce((sum, entry) => sum.add(entry.quantity.toString()), new Decimal(0));

      if (line.item.lotTrackingMode === "REQUIRED" && line.lots.length === 0) {
        throw new PurchaseApplicationError("PURCHASE_INVALID_LOTS", `El ítem ${line.item.code} requiere lote.`);
      }
      if (line.item.lotTrackingMode === "NONE" && line.lots.length > 0) {
        throw new PurchaseApplicationError("PURCHASE_INVALID_LOTS", `El ítem ${line.item.code} no admite lote.`);
      }
      if (line.lots.length > 0 && !lotQuantity.equals(receivedQuantity)) {
        throw new PurchaseApplicationError("PURCHASE_INVALID_LOTS", `La suma de lotes no coincide en ${line.item.code}.`);
      }

      const segments = line.lots.length > 0
        ? line.lots.map((entry) => ({ lotId: entry.lotId, quantity: new Decimal(entry.quantity.toString()) }))
        : [{ lotId: null, quantity: receivedQuantity }];

      for (const segment of segments) {
        const global = await addToBalance(tx, {
          warehouseId: purchase.warehouseId,
          itemId: line.itemId,
          lotId: null,
          quantity: segment.quantity,
          unitCost: unitCostPen,
        });
        if (segment.lotId) {
          await addToBalance(tx, {
            warehouseId: purchase.warehouseId,
            itemId: line.itemId,
            lotId: segment.lotId,
            quantity: segment.quantity,
            unitCost: unitCostPen,
          });
        }

        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            warehouseId: purchase.warehouseId,
            lotId: segment.lotId,
            type: "PURCHASE_RECEIPT",
            quantity: segment.quantity,
            unitCost: unitCostPen,
            movementValue: segment.quantity.mul(unitCostPen).toDecimalPlaces(4),
            balanceAfter: global.onHandQuantity,
            valueAfter: global.inventoryValue,
            averageCostAfter: global.averageUnitCost,
            referenceType: "PURCHASE",
            referenceId: purchase.id,
            occurredAt: purchase.receptionDate,
            postingSequence: await nextPostingSequence(tx, command.companyId),
            createdById: command.approvedById,
          },
        });
      }
    }

    const approved = await tx.purchase.update({ where: { id: purchase.id }, data: { status: "APPROVED" } });
    await tx.purchaseApproval.create({
      data: { purchaseId: purchase.id, userId: command.approvedById, status: "APPROVED", comment: command.comment },
    });
    await tx.auditLog.create({
      data: {
        companyId: command.companyId,
        userId: command.approvedById,
        entity: "Purchase",
        entityId: purchase.id,
        action: "APPROVE",
        beforeData: { status: "PENDING" },
        afterData: { status: "APPROVED" },
      },
    });
    await tx.outboxEvent.create({
      data: {
        companyId: command.companyId,
        topic: `private-company-${command.companyId}`,
        eventName: "purchase.approved.v1",
        aggregateId: purchase.id,
        payload: { purchaseId: purchase.id, code: purchase.code },
      },
    });

    return approved;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
