import { randomUUID } from "node:crypto";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOpeningStock } from "@/modules/inventory/application/create-opening-stock";
import { approvePurchase } from "@/modules/purchases/application/approve-purchase";
import { createPurchase } from "@/modules/purchases/application/create-purchase";

const connectionString = process.env.INTEGRATION_DATABASE_URL;
const branchName = process.env.INTEGRATION_BRANCH_NAME;
if (!connectionString || !branchName?.startsWith("codex-integration-")) throw new Error("Las pruebas requieren una rama codex-integration-* aislada.");
if (connectionString === process.env.DATABASE_URL) throw new Error("La base de integración no puede ser la base principal.");

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const suffix = randomUUID().slice(0, 8);
let fixture: { companyId: string; userId: string; unitId: string; warehouseId: string; currencyId: string; supplierId: string; itemId: string };

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Integración ${suffix}`, taxId: `TEST-${suffix}` } });
  const [user, unit, warehouse, currency, supplier] = await Promise.all([
    prisma.user.create({ data: { companyId: company.id, username: `test-${suffix}`, email: `${suffix}@integration.invalid`, passwordHash: "integration-only", mustChangePassword: false, name: "Integration Test" } }),
    prisma.unitOfMeasure.create({ data: { companyId: company.id, code: "KG", name: "Kilogramo", symbol: "kg" } }),
    prisma.warehouse.create({ data: { companyId: company.id, code: "MAIN", name: "Principal" } }),
    prisma.currency.create({ data: { companyId: company.id, code: "PEN", name: "Sol", symbol: "S/", isBase: true } }),
    prisma.supplier.create({ data: { companyId: company.id, code: "SUP", name: "Proveedor integración" } }),
  ]);
  const item = await prisma.inventoryItem.create({ data: { companyId: company.id, code: "MAT-01", name: "Material", type: "RAW_MATERIAL", unitId: unit.id, minimumStock: 0, lotTrackingMode: "NONE" } });
  fixture = { companyId: company.id, userId: user.id, unitId: unit.id, warehouseId: warehouse.id, currencyId: currency.id, supplierId: supplier.id, itemId: item.id };
}, 30_000);

afterAll(async () => {
  if (fixture?.companyId) {
    const items = await prisma.inventoryItem.findMany({ where: { companyId: fixture.companyId }, select: { id: true } });
    const itemIds = items.map((item) => item.id);
    await prisma.purchase.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.inventoryAdjustment.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.stockMovement.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.stockBalance.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.inventoryLot.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.company.delete({ where: { id: fixture.companyId } });
  }
  await prisma.$disconnect();
}, 30_000);

describe("transacciones de inventario sobre PostgreSQL real", () => {
  it("revierte por completo una compra inválida", async () => {
    const lotItem = await prisma.inventoryItem.create({ data: { companyId: fixture.companyId, code: "LOT-01", name: "Material con lote", type: "RAW_MATERIAL", unitId: fixture.unitId, minimumStock: 0, lotTrackingMode: "REQUIRED" } });
    await expect(createPurchase(prisma, {
      companyId: fixture.companyId, createdById: fixture.userId, code: "PUR-ROLLBACK", supplierId: fixture.supplierId,
      warehouseId: fixture.warehouseId, currencyId: fixture.currencyId, receptionDate: new Date(), documentNumber: "DOC-ROLLBACK", exchangeRate: 1,
      lines: [{ lineNumber: 1, itemId: lotItem.id, presentationType: "SACO", presentationQuantity: 2, contentPerUnit: 5, pricePerBaseUnit: 3 }],
    })).rejects.toMatchObject({ code: "PURCHASE_INVALID_LOTS" });
    expect(await prisma.purchase.count({ where: { companyId: fixture.companyId, code: "PUR-ROLLBACK" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { companyId: fixture.companyId, entity: "Purchase" } })).toBe(0);
  });

  it("un reintento del stock inicial no duplica saldo ni kardex", async () => {
    const command = { companyId: fixture.companyId, createdById: fixture.userId, referenceNumber: "OPEN-001", itemId: fixture.itemId, warehouseId: fixture.warehouseId, quantity: 5, unitCost: 2, occurredAt: new Date() };
    await createOpeningStock(prisma, command);
    await expect(createOpeningStock(prisma, command)).rejects.toBeTruthy();
    const balance = await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: fixture.warehouseId, itemId: fixture.itemId, lotId: null } });
    expect(balance.onHandQuantity.toString()).toBe("5");
    expect(await prisma.stockMovement.count({ where: { referenceType: "INVENTORY_OPENING", itemId: fixture.itemId } })).toBe(1);
  });

  it("dos aprobaciones concurrentes contabilizan una sola vez", async () => {
    const purchase = await createPurchase(prisma, {
      companyId: fixture.companyId, createdById: fixture.userId, code: "PUR-CONCURRENT", supplierId: fixture.supplierId,
      warehouseId: fixture.warehouseId, currencyId: fixture.currencyId, receptionDate: new Date(), documentNumber: "DOC-CONCURRENT", exchangeRate: 1,
      lines: [{ lineNumber: 1, itemId: fixture.itemId, presentationType: "SACO", presentationQuantity: 2, contentPerUnit: 5, pricePerBaseUnit: 3 }],
    });
    const results = await Promise.allSettled([
      approvePurchase(prisma, { companyId: fixture.companyId, purchaseId: purchase.id, approvedById: fixture.userId }),
      approvePurchase(prisma, { companyId: fixture.companyId, purchaseId: purchase.id, approvedById: fixture.userId }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const balance = await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: fixture.warehouseId, itemId: fixture.itemId, lotId: null } });
    expect(balance.onHandQuantity.toString()).toBe("15");
    expect(await prisma.stockMovement.count({ where: { referenceType: "PURCHASE", referenceId: purchase.id } })).toBe(1);
    expect(await prisma.purchaseApproval.count({ where: { purchaseId: purchase.id } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: purchase.id, eventName: "purchase.approved.v1" } })).toBe(1);
  });
});
