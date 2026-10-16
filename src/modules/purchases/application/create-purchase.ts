import Decimal from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { nextBusinessCode } from "@/lib/database/business-code";
import { calculatePurchaseLine } from "@/modules/purchases/domain/calculate-purchase-line";
import { PurchaseApplicationError } from "./purchase-errors";

type PurchaseLotInput = {
  lineNumber: number;
  lotCode: string;
  supplierLot?: string;
  expiresAt?: Date;
  quantity: Decimal.Value;
};

type PurchaseLineInput = {
  lineNumber: number;
  itemId: string;
  presentationType: string;
  presentationQuantity: Decimal.Value;
  contentPerUnit: Decimal.Value;
  pricePerBaseUnit: Decimal.Value;
  taxRate?: Decimal.Value;
  lots?: PurchaseLotInput[];
};

export type CreatePurchaseCommand = {
  companyId: string;
  createdById: string;
  code?: string;
  supplierId: string;
  warehouseId: string;
  currencyId: string;
  receptionDate: Date;
  documentNumber: string;
  sourceOrderReference?: string;
  receiptSequence?: number;
  exchangeRate: Decimal.Value;
  lines: PurchaseLineInput[];
};

export async function createPurchase(database: PrismaClient, command: CreatePurchaseCommand) {
  if (command.lines.length === 0 || new Set(command.lines.map((line) => line.lineNumber)).size !== command.lines.length) {
    throw new PurchaseApplicationError("PURCHASE_INVALID_LINES", "La compra requiere líneas con numeración única.");
  }
  const exchangeRate = new Decimal(command.exchangeRate);
  if (!exchangeRate.greaterThan(0)) {
    throw new PurchaseApplicationError("PURCHASE_INVALID_LINES", "El tipo de cambio debe ser mayor que cero.");
  }

  return database.$transaction(async (tx) => {
    const [supplier, warehouse, currency, items, duplicate] = await Promise.all([
      tx.supplier.findFirst({ where: { id: command.supplierId, companyId: command.companyId, active: true } }),
      tx.warehouse.findFirst({ where: { id: command.warehouseId, companyId: command.companyId, active: true } }),
      tx.currency.findFirst({ where: { id: command.currencyId, companyId: command.companyId } }),
      tx.inventoryItem.findMany({ where: { id: { in: command.lines.map((line) => line.itemId) }, companyId: command.companyId, active: true } }),
      tx.purchase.findFirst({
        where: {
          companyId: command.companyId,
          supplierId: command.supplierId,
          documentNumber: command.documentNumber,
          receiptSequence: command.receiptSequence ?? 1,
        },
        select: { id: true },
      }),
    ]);

    if (!supplier || !warehouse || !currency || items.length !== new Set(command.lines.map((line) => line.itemId)).size) {
      throw new PurchaseApplicationError("PURCHASE_INVALID_REFERENCE", "Proveedor, almacén, moneda o ítem inválido.");
    }
    if (duplicate) throw new PurchaseApplicationError("PURCHASE_DUPLICATE_DOCUMENT", "El documento del proveedor ya fue registrado.");

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const calculated = command.lines.map((line) => ({ line, amounts: calculatePurchaseLine(line) }));
    const subtotal = calculated.reduce((sum, entry) => sum.add(entry.amounts.subtotal), new Decimal(0));
    const taxAmount = calculated.reduce((sum, entry) => sum.add(entry.amounts.taxAmount), new Decimal(0));
    const total = subtotal.add(taxAmount);

    const code = command.code ?? await nextBusinessCode(tx, command.companyId, "PURCHASE", command.receptionDate);
    const purchase = await tx.purchase.create({
      data: {
        companyId: command.companyId,
        supplierId: command.supplierId,
        warehouseId: command.warehouseId,
        currencyId: command.currencyId,
        code,
        receptionDate: command.receptionDate,
        documentNumber: command.documentNumber,
        sourceOrderReference: command.sourceOrderReference,
        receiptSequence: command.receiptSequence ?? 1,
        exchangeRate,
        subtotal,
        taxAmount,
        total,
        status: "PENDING",
      },
    });

    for (const { line, amounts } of calculated) {
      const item = itemMap.get(line.itemId)!;
      const lots = line.lots ?? [];
      const lotTotal = lots.reduce((sum, lot) => sum.add(lot.quantity), new Decimal(0));
      if (item.lotTrackingMode === "REQUIRED" && lots.length === 0) {
        throw new PurchaseApplicationError("PURCHASE_INVALID_LOTS", `El ítem ${item.code} requiere lote.`);
      }
      if (item.lotTrackingMode === "NONE" && lots.length > 0) {
        throw new PurchaseApplicationError("PURCHASE_INVALID_LOTS", `El ítem ${item.code} no admite lote.`);
      }
      if (lots.length > 0 && !lotTotal.equals(amounts.receivedQuantity)) {
        throw new PurchaseApplicationError("PURCHASE_INVALID_LOTS", `La suma de lotes no coincide en ${item.code}.`);
      }

      const purchaseLine = await tx.purchaseLine.create({
        data: {
          purchaseId: purchase.id,
          itemId: line.itemId,
          lineNumber: line.lineNumber,
          presentationType: line.presentationType.trim().toUpperCase(),
          presentationQty: new Decimal(line.presentationQuantity).toString(),
          contentPerUnit: new Decimal(line.contentPerUnit).toString(),
          receivedQuantity: amounts.receivedQuantity,
          pricePerBaseUnit: new Decimal(line.pricePerBaseUnit).toString(),
          taxRate: new Decimal(line.taxRate ?? 18).toString(),
          subtotal: amounts.subtotal,
          taxAmount: amounts.taxAmount,
          total: amounts.total,
        },
      });

      for (const lotInput of lots) {
        const lot = await tx.inventoryLot.upsert({
          where: { warehouseId_itemId_lotCode: { warehouseId: command.warehouseId, itemId: line.itemId, lotCode: lotInput.lotCode } },
          update: { supplierLot: lotInput.supplierLot, expiresAt: lotInput.expiresAt },
          create: {
            warehouseId: command.warehouseId,
            itemId: line.itemId,
            lotCode: lotInput.lotCode,
            supplierLot: lotInput.supplierLot,
            receivedAt: command.receptionDate,
            expiresAt: lotInput.expiresAt,
          },
        });
        await tx.purchaseLineLot.create({
          data: { purchaseLineId: purchaseLine.id, lotId: lot.id, lineNumber: lotInput.lineNumber, quantity: new Decimal(lotInput.quantity).toString() },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        companyId: command.companyId,
        userId: command.createdById,
        entity: "Purchase",
        entityId: purchase.id,
        action: "CREATE",
        afterData: { code: purchase.code, status: purchase.status, total: purchase.total.toString() },
      },
    });
    return purchase;
  });
}
