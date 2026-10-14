import { createHash, randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticateCredentials } from "@/modules/auth/application/authenticate-credentials";
import { changePasswordForUser } from "@/modules/auth/application/change-password-for-user";
import { createOpeningStock } from "@/modules/inventory/application/create-opening-stock";
import { confirmSalesOrder, createSalesOrder, dispatchSalesOrder } from "@/modules/orders/application/order-service";
import { completeProductionOrder, createProductionOrder, releaseProductionOrder, startProductionOrder } from "@/modules/production/application/production-service";

const connectionString = process.env.INTEGRATION_DATABASE_URL;
const branchName = process.env.INTEGRATION_BRANCH_NAME;
if (!connectionString || !branchName?.startsWith("codex-integration-")) throw new Error("Las pruebas requieren una rama codex-integration-* aislada.");
if (connectionString === process.env.DATABASE_URL) throw new Error("La base de integración no puede ser la base principal.");

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
const suffix = randomUUID().slice(0, 8);
const authIdentifier = `flow-${suffix}`;
const authIpAddress = `integration-${suffix}`;
const authBucketKey = createHash("sha256").update(`${authIdentifier}:${authIpAddress}`).digest("hex");
let fixture: { companyId: string; userId: string; warehouseId: string; rawItemId: string; finishedItemId: string; variantId: string; recipeVersionId: string; customerId: string };

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Flujos ${suffix}`, taxId: `FLOW-${suffix}` } });
  const unit = await prisma.unitOfMeasure.create({ data: { companyId: company.id, code: "UND", name: "Unidad", symbol: "und" } });
  const [user, warehouse, size, color, rawItem, finishedItem, customer] = await Promise.all([
    prisma.user.create({ data: { companyId: company.id, username: authIdentifier, email: `${suffix}@flows.invalid`, passwordHash: await hash("clave-inicial"), mustChangePassword: true, name: "Flow Test" } }),
    prisma.warehouse.create({ data: { companyId: company.id, code: "PRINCIPAL", name: "Almacén principal" } }),
    prisma.size.create({ data: { companyId: company.id, code: "40", name: "Talla 40" } }),
    prisma.color.create({ data: { companyId: company.id, code: "NEG", name: "Negro" } }),
    prisma.inventoryItem.create({ data: { companyId: company.id, code: "CUERO", name: "Cuero", type: "RAW_MATERIAL", unitId: unit.id, lotTrackingMode: "NONE" } }),
    prisma.inventoryItem.create({ data: { companyId: company.id, code: "ZAP-40-N", name: "Zapato 40 negro", type: "FINISHED_PRODUCT", unitId: unit.id, lotTrackingMode: "NONE" } }),
    prisma.customer.create({ data: { companyId: company.id, code: "CLI-01", name: "Cliente integración" } }),
  ]);
  const product = await prisma.product.create({ data: { companyId: company.id, code: "ZAP", name: "Zapato" } });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, sizeId: size.id, colorId: color.id, inventoryItemId: finishedItem.id, sku: `ZAP-40-N-${suffix}` } });
  const recipe = await prisma.recipe.create({ data: { companyId: company.id, productId: product.id, code: "REC-ZAP", name: "Receta zapato", status: "ACTIVE" } });
  const version = await prisma.recipeVersion.create({ data: { recipeId: recipe.id, version: 1, yieldQuantity: 2, isActive: true, ingredients: { create: { itemId: rawItem.id, quantity: 3, wastePercentage: 0 } } } });
  fixture = { companyId: company.id, userId: user.id, warehouseId: warehouse.id, rawItemId: rawItem.id, finishedItemId: finishedItem.id, variantId: variant.id, recipeVersionId: version.id, customerId: customer.id };
}, 30_000);

afterAll(async () => {
  if (fixture?.companyId) {
    const itemIds = [fixture.rawItemId, fixture.finishedItemId];
    await prisma.salesOrder.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.productionOrder.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.stockReservation.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.stockMovement.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.stockBalance.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.inventoryAdjustment.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.recipe.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.product.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.company.delete({ where: { id: fixture.companyId } });
  }
  await prisma.rateLimitBucket.deleteMany({ where: { key: authBucketKey } });
  await prisma.$disconnect();
}, 30_000);

describe("autenticación sobre PostgreSQL real", () => {
  it("valida credenciales, limita intentos y permite cambiar la contraseña", async () => {
    const base = { username: authIdentifier, remember: false, ipAddress: authIpAddress };
    const authenticated = await authenticateCredentials(prisma, { ...base, password: "clave-inicial" });
    expect(authenticated.id).toBe(fixture.userId);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(authenticateCredentials(prisma, { ...base, password: "incorrecta" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    }
    await expect(authenticateCredentials(prisma, { ...base, password: "clave-inicial" })).rejects.toMatchObject({ code: "RATE_LIMITED" });

    await changePasswordForUser(prisma, fixture.userId, "clave-inicial", "clave-nueva-123");
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } });
    expect(updated.mustChangePassword).toBe(false);
    expect(await verify(updated.passwordHash, "clave-nueva-123")).toBe(true);
  });
});

describe("producción y pedidos sobre PostgreSQL real", () => {
  it("consume materias primas, ingresa producto terminado, reserva y despacha", async () => {
    await createOpeningStock(prisma, { companyId: fixture.companyId, createdById: fixture.userId, referenceNumber: "OPEN-FLOW", itemId: fixture.rawItemId, warehouseId: fixture.warehouseId, quantity: 30, unitCost: 4, occurredAt: new Date() });
    const production = await createProductionOrder(prisma, { companyId: fixture.companyId, userId: fixture.userId, number: "OP-001", warehouseId: fixture.warehouseId, productVariantId: fixture.variantId, recipeVersionId: fixture.recipeVersionId, recipeRuns: 2 });
    expect(production.plannedQuantity.toString()).toBe("4");
    await releaseProductionOrder(prisma, { companyId: fixture.companyId, userId: fixture.userId, orderId: production.id });
    let raw = await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: fixture.warehouseId, itemId: fixture.rawItemId, lotId: null } });
    expect(raw.reservedQuantity.toString()).toBe("6");

    await startProductionOrder(prisma, { companyId: fixture.companyId, userId: fixture.userId, orderId: production.id });
    raw = await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: fixture.warehouseId, itemId: fixture.rawItemId, lotId: null } });
    expect(raw.onHandQuantity.toString()).toBe("24");
    expect(raw.reservedQuantity.toString()).toBe("0");

    await completeProductionOrder(prisma, { companyId: fixture.companyId, userId: fixture.userId, orderId: production.id, producedQuantity: 4 });
    let finished = await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: fixture.warehouseId, itemId: fixture.finishedItemId, lotId: null } });
    expect(finished.onHandQuantity.toString()).toBe("4");
    expect(finished.averageUnitCost.toString()).toBe("6");

    const salesOrder = await createSalesOrder(prisma, { companyId: fixture.companyId, userId: fixture.userId, number: "PED-001", customerId: fixture.customerId, requestedAt: new Date(), lines: [{ productVariantId: fixture.variantId, quantity: 2, unitPrice: 20 }] });
    await confirmSalesOrder(prisma, { companyId: fixture.companyId, userId: fixture.userId, orderId: salesOrder.id });
    finished = await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: fixture.warehouseId, itemId: fixture.finishedItemId, lotId: null } });
    expect(finished.reservedQuantity.toString()).toBe("2");

    await dispatchSalesOrder(prisma, { companyId: fixture.companyId, userId: fixture.userId, orderId: salesOrder.id });
    finished = await prisma.stockBalance.findFirstOrThrow({ where: { warehouseId: fixture.warehouseId, itemId: fixture.finishedItemId, lotId: null } });
    expect(finished.onHandQuantity.toString()).toBe("2");
    expect(finished.reservedQuantity.toString()).toBe("0");
    await expect(dispatchSalesOrder(prisma, { companyId: fixture.companyId, userId: fixture.userId, orderId: salesOrder.id })).rejects.toMatchObject({ code: "ORDER_INVALID_STATE" });

    expect(await prisma.stockMovement.count({ where: { referenceType: "PRODUCTION_ORDER", referenceId: production.id, type: "PRODUCTION_CONSUMPTION" } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { referenceType: "PRODUCTION_ORDER", referenceId: production.id, type: "PRODUCTION_OUTPUT" } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { referenceType: "SALES_ORDER", referenceId: salesOrder.id, type: "SALES_DISPATCH" } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: production.id } })).toBe(4);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: salesOrder.id } })).toBe(3);
  });
});
