import { hash } from "@node-rs/argon2";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });
const DEMO_COMPANY_NAME = "LK INNOVACION · DEMO";
const DEMO_COMPANY_TAX_ID = "DEMO-LK-INNOVACION";
const DEMO_USERNAME = (process.env.DEMO_USERNAME ?? "demo").trim().toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Demo123!";

const permissionCodes = [
  "dashboard.read", "catalogs.read", "catalogs.manage",
  "users.read", "users.create", "users.update", "users.deactivate",
  "roles.read", "roles.manage",
  "purchases.read", "purchases.create", "purchases.update", "purchases.submit", "purchases.approve", "purchases.reject", "purchases.reverse", "purchases.export",
  "inventory.read", "inventory.create_item", "inventory.adjust_request", "inventory.adjust_approve", "inventory.adjust_value_request", "inventory.adjust_value_approve", "inventory.opening_import", "inventory.export",
  "recipes.read", "recipes.create", "recipes.update", "recipes.activate", "recipes.archive", "recipes.export",
  "production.read", "production.create", "production.release", "production.start", "production.complete", "production.cancel", "production.scrap",
  "machinery.read", "machinery.create", "machinery.maintenance",
  "products.read", "products.create", "products.update", "products.image_manage", "products.export",
  "orders.read", "orders.create", "orders.update", "orders.confirm", "orders.link_production", "orders.dispatch", "orders.deliver", "orders.cancel", "orders.export",
  "pick_pack.read", "pick_pack.create", "pick_pack.update", "pick_pack.ready", "pick_pack.print",
  "calendar.read", "calendar.create", "calendar.update", "calendar.delete",
  "imports.read", "imports.preview", "imports.confirm",
] as const;

function relativeDate(days: number, hour = 10) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value;
}

async function removeDemoCompany() {
  const demo = await prisma.company.findFirst({ where: { name: DEMO_COMPANY_NAME, taxId: DEMO_COMPANY_TAX_ID } });
  if (!demo) return false;
  await prisma.calendarEvent.deleteMany({ where: { companyId: demo.id } });
  await prisma.importJob.deleteMany({ where: { companyId: demo.id } });
  await prisma.productImage.deleteMany({ where: { product: { companyId: demo.id } } });
  await prisma.pickPackOrder.deleteMany({ where: { companyId: demo.id } });
  await prisma.salesOrder.deleteMany({ where: { companyId: demo.id } });
  await prisma.stockReservation.deleteMany({ where: { warehouse: { companyId: demo.id } } });
  await prisma.productionOrder.deleteMany({ where: { companyId: demo.id } });
  await prisma.stockMovement.deleteMany({ where: { warehouse: { companyId: demo.id } } });
  await prisma.stockBalance.deleteMany({ where: { warehouse: { companyId: demo.id } } });
  await prisma.purchase.deleteMany({ where: { companyId: demo.id } });
  await prisma.inventoryAdjustment.deleteMany({ where: { companyId: demo.id } });
  await prisma.recipe.deleteMany({ where: { companyId: demo.id } });
  await prisma.product.deleteMany({ where: { companyId: demo.id } });
  await prisma.inventoryLot.deleteMany({ where: { warehouse: { companyId: demo.id } } });
  await prisma.inventoryItem.deleteMany({ where: { companyId: demo.id } });
  await prisma.company.delete({ where: { id: demo.id } });
  return true;
}

type PurchaseSeedLine = {
  itemId: string;
  presentationType: string;
  presentationQty: number;
  contentPerUnit: number;
  pricePerBaseUnit: number;
};

function purchaseLineData(lines: PurchaseSeedLine[]) {
  return lines.map((line, index) => {
    const receivedQuantity = line.presentationQty * line.contentPerUnit;
    const subtotal = receivedQuantity * line.pricePerBaseUnit;
    const taxAmount = subtotal * 0.18;
    return {
      itemId: line.itemId,
      lineNumber: index + 1,
      presentationType: line.presentationType,
      presentationQty: line.presentationQty,
      contentPerUnit: line.contentPerUnit,
      receivedQuantity,
      pricePerBaseUnit: line.pricePerBaseUnit,
      taxRate: 18,
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
    };
  });
}

function purchaseTotals(lines: ReturnType<typeof purchaseLineData>) {
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

function numeric(value: { toString(): string } | number) {
  return Number(value.toString());
}

async function nextPostingSequence(companyId: string) {
  const counter = await prisma.correlativeCounter.upsert({
    where: { companyId_scope_year: { companyId, scope: "INVENTORY_POSTING", year: 0 } },
    update: { value: { increment: 1 } },
    create: { companyId, scope: "INVENTORY_POSTING", year: 0, value: 1 },
  });
  return BigInt(counter.value);
}

async function postIncoming(input: { companyId: string; userId: string; warehouseId: string; itemId: string; quantity: number; unitCost: number; type: "PURCHASE_RECEIPT" | "PRODUCTION_OUTPUT"; referenceType: string; referenceId: string; occurredAt?: Date }) {
  const current = await prisma.stockBalance.findFirst({ where: { warehouseId: input.warehouseId, itemId: input.itemId, lotId: null } });
  const currentQuantity = numeric(current?.onHandQuantity ?? 0);
  const currentValue = numeric(current?.inventoryValue ?? 0);
  const movementValue = input.quantity * input.unitCost;
  const onHandQuantity = currentQuantity + input.quantity;
  const inventoryValue = currentValue + movementValue;
  const averageUnitCost = onHandQuantity === 0 ? 0 : inventoryValue / onHandQuantity;
  if (current) await prisma.stockBalance.update({ where: { id: current.id }, data: { onHandQuantity, inventoryValue, averageUnitCost } });
  else await prisma.stockBalance.create({ data: { warehouseId: input.warehouseId, itemId: input.itemId, lotId: null, onHandQuantity, inventoryValue, averageUnitCost } });
  await prisma.stockMovement.create({ data: { itemId: input.itemId, warehouseId: input.warehouseId, type: input.type, quantity: input.quantity, unitCost: input.unitCost, movementValue, balanceAfter: onHandQuantity, valueAfter: inventoryValue, averageCostAfter: averageUnitCost, referenceType: input.referenceType, referenceId: input.referenceId, occurredAt: input.occurredAt, postingSequence: await nextPostingSequence(input.companyId), createdById: input.userId } });
}

async function reserveStock(input: { warehouseId: string; itemId: string; quantity: number; referenceType: string; referenceId: string }) {
  const balance = await prisma.stockBalance.findFirst({ where: { warehouseId: input.warehouseId, itemId: input.itemId, lotId: null } });
  if (!balance || numeric(balance.onHandQuantity) - numeric(balance.reservedQuantity) < input.quantity) throw new Error(`Stock demo insuficiente para ${input.itemId}.`);
  await prisma.stockBalance.update({ where: { id: balance.id }, data: { reservedQuantity: { increment: input.quantity } } });
  await prisma.stockReservation.create({ data: { warehouseId: input.warehouseId, itemId: input.itemId, quantity: input.quantity, referenceType: input.referenceType, referenceId: input.referenceId } });
}

async function postOutgoing(input: { companyId: string; userId: string; warehouseId: string; itemId: string; quantity: number; reservedQuantity?: number; type: "PRODUCTION_CONSUMPTION" | "SALES_DISPATCH"; referenceType: string; referenceId: string; occurredAt?: Date }) {
  const balance = await prisma.stockBalance.findFirst({ where: { warehouseId: input.warehouseId, itemId: input.itemId, lotId: null } });
  if (!balance || numeric(balance.onHandQuantity) < input.quantity) throw new Error(`Stock demo insuficiente para ${input.itemId}.`);
  const unitCost = numeric(balance.averageUnitCost);
  const onHandQuantity = numeric(balance.onHandQuantity) - input.quantity;
  const movementValue = input.quantity * unitCost;
  const inventoryValue = onHandQuantity === 0 ? 0 : Math.max(0, numeric(balance.inventoryValue) - movementValue);
  const reservedQuantity = Math.max(0, numeric(balance.reservedQuantity) - (input.reservedQuantity ?? 0));
  await prisma.stockBalance.update({ where: { id: balance.id }, data: { onHandQuantity, reservedQuantity, inventoryValue, averageUnitCost: onHandQuantity === 0 ? 0 : unitCost } });
  await prisma.stockMovement.create({ data: { itemId: input.itemId, warehouseId: input.warehouseId, type: input.type, quantity: -input.quantity, unitCost, movementValue: -movementValue, balanceAfter: onHandQuantity, valueAfter: inventoryValue, averageCostAfter: onHandQuantity === 0 ? 0 : unitCost, referenceType: input.referenceType, referenceId: input.referenceId, occurredAt: input.occurredAt, postingSequence: await nextPostingSequence(input.companyId), createdById: input.userId } });
}

async function approveDemoPurchase(companyId: string, purchaseId: string, userId: string) {
  const purchase = await prisma.purchase.findFirstOrThrow({ where: { id: purchaseId, companyId }, include: { lines: true } });
  for (const line of purchase.lines) await postIncoming({ companyId, userId, warehouseId: purchase.warehouseId, itemId: line.itemId, quantity: numeric(line.receivedQuantity), unitCost: numeric(line.pricePerBaseUnit) * numeric(purchase.exchangeRate), type: "PURCHASE_RECEIPT", referenceType: "PURCHASE", referenceId: purchase.id, occurredAt: purchase.receptionDate });
  await prisma.purchase.update({ where: { id: purchase.id }, data: { status: "APPROVED" } });
  await prisma.purchaseApproval.create({ data: { purchaseId: purchase.id, userId, status: "APPROVED", comment: "Recepción validada para demostración" } });
}

type DemoProductionInput = {
  companyId: string;
  userId: string;
  number: string;
  warehouseId: string;
  productVariantId: string;
  recipeVersionId: string;
  machineId: string;
  recipeRuns: number;
  plannedAt: Date;
  operatorName: string;
  processType: "PRENSA" | "INYECTORA";
  mold: string;
  brandColor: string;
  pressNumber?: string;
  pressLoad?: string;
  injectorNumber?: string;
  curve?: string;
  sizeProgram: { size: string; requestedPairs: number }[];
};

async function createDemoProduction(input: DemoProductionInput) {
  const version = await prisma.recipeVersion.findUniqueOrThrow({ where: { id: input.recipeVersionId }, include: { ingredients: true } });
  const plannedQuantity = numeric(version.yieldQuantity) * input.recipeRuns;
  return prisma.productionOrder.create({ data: { companyId: input.companyId, warehouseId: input.warehouseId, productVariantId: input.productVariantId, recipeVersionId: input.recipeVersionId, machineId: input.machineId, number: input.number, recipeRuns: input.recipeRuns, plannedQuantity, plannedAt: input.plannedAt, operatorName: input.operatorName, processType: input.processType, mold: input.mold, brandColor: input.brandColor, pressNumber: input.pressNumber, pressLoad: input.pressLoad, injectorNumber: input.injectorNumber, curve: input.curve, sizeProgram: input.sizeProgram, dailyProduction: [], materials: { create: version.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, plannedQuantity: numeric(ingredient.quantity) * (1 + numeric(ingredient.wastePercentage) / 100) * input.recipeRuns })) } } });
}

async function releaseDemoProduction(companyId: string, orderId: string) {
  const order = await prisma.productionOrder.findFirstOrThrow({ where: { id: orderId, companyId }, include: { materials: true } });
  for (const material of order.materials) await reserveStock({ warehouseId: order.warehouseId, itemId: material.itemId, quantity: numeric(material.plannedQuantity), referenceType: "PRODUCTION_ORDER", referenceId: order.id });
  await prisma.productionOrder.update({ where: { id: order.id }, data: { status: "RELEASED" } });
}

async function startDemoProduction(companyId: string, orderId: string, userId: string) {
  const order = await prisma.productionOrder.findFirstOrThrow({ where: { id: orderId, companyId }, include: { materials: true } });
  for (const material of order.materials) {
    const quantity = numeric(material.plannedQuantity);
    await postOutgoing({ companyId, userId, warehouseId: order.warehouseId, itemId: material.itemId, quantity, reservedQuantity: quantity, type: "PRODUCTION_CONSUMPTION", referenceType: "PRODUCTION_ORDER", referenceId: order.id, occurredAt: relativeDate(-1) });
    await prisma.productionMaterial.update({ where: { id: material.id }, data: { consumedQuantity: quantity } });
  }
  await prisma.stockReservation.updateMany({ where: { referenceType: "PRODUCTION_ORDER", referenceId: order.id, active: true }, data: { active: false } });
  await prisma.productionOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS", startedAt: relativeDate(-1) } });
}

async function completeDemoProduction(companyId: string, orderId: string, userId: string, producedQuantity: number) {
  const order = await prisma.productionOrder.findFirstOrThrow({ where: { id: orderId, companyId }, include: { productVariant: true } });
  const consumed = await prisma.stockMovement.aggregate({ where: { referenceType: "PRODUCTION_ORDER", referenceId: order.id, type: "PRODUCTION_CONSUMPTION" }, _sum: { movementValue: true } });
  const totalCost = Math.abs(numeric(consumed._sum.movementValue ?? 0));
  await postIncoming({ companyId, userId, warehouseId: order.warehouseId, itemId: order.productVariant.inventoryItemId, quantity: producedQuantity, unitCost: totalCost / producedQuantity, type: "PRODUCTION_OUTPUT", referenceType: "PRODUCTION_ORDER", referenceId: order.id, occurredAt: relativeDate(-10) });
  await prisma.productionOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", producedQuantity, completedAt: relativeDate(-10) } });
}

type DemoSalesOrderInput = { companyId: string; number: string; customerId: string; requestedAt: Date; promisedAt: Date; notes: string; lines: { productVariantId: string; quantity: number; unitPrice: number }[] };

async function createDemoSalesOrder(input: DemoSalesOrderInput) {
  return prisma.salesOrder.create({ data: { companyId: input.companyId, customerId: input.customerId, number: input.number, requestedAt: input.requestedAt, promisedAt: input.promisedAt, notes: input.notes, lines: { create: input.lines } } });
}

async function confirmDemoSalesOrder(companyId: string, orderId: string, warehouseId: string) {
  const order = await prisma.salesOrder.findFirstOrThrow({ where: { id: orderId, companyId }, include: { lines: { include: { productVariant: true } } } });
  for (const line of order.lines) await reserveStock({ warehouseId, itemId: line.productVariant.inventoryItemId, quantity: numeric(line.quantity), referenceType: "SALES_ORDER", referenceId: order.id });
  await prisma.salesOrder.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
}

async function dispatchDemoSalesOrder(companyId: string, orderId: string, userId: string) {
  const order = await prisma.salesOrder.findFirstOrThrow({ where: { id: orderId, companyId }, include: { lines: { include: { productVariant: true } }, pickPackOrder: { include: { lines: true } } } });
  if (!order.pickPackOrder) throw new Error("El pedido demo no tiene Pick & Pack.");
  const packedByLine = new Map(order.pickPackOrder.lines.map((line) => [line.salesOrderLineId, numeric(line.packedQuantity)]));
  for (const line of order.lines) await postOutgoing({ companyId, userId, warehouseId: order.pickPackOrder.warehouseId, itemId: line.productVariant.inventoryItemId, quantity: packedByLine.get(line.id) ?? 0, reservedQuantity: numeric(line.quantity), type: "SALES_DISPATCH", referenceType: "SALES_ORDER", referenceId: order.id, occurredAt: relativeDate(-2) });
  await prisma.stockReservation.updateMany({ where: { referenceType: "SALES_ORDER", referenceId: order.id, active: true }, data: { active: false } });
  await prisma.pickPackOrder.update({ where: { id: order.pickPackOrder.id }, data: { status: "DISPATCHED", dispatchedAt: relativeDate(-2) } });
  await prisma.salesOrder.update({ where: { id: order.id }, data: { status: "DISPATCHED" } });
}

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup");
  const removed = await removeDemoCompany();

  if (cleanupOnly) {
    console.log(removed ? "Datos temporales de demostración eliminados." : "No había datos temporales de demostración.");
    return;
  }

  const usernameConflict = await prisma.user.findUnique({ where: { username: DEMO_USERNAME } });
  if (usernameConflict) throw new Error(`El usuario ${DEMO_USERNAME} ya pertenece a otra empresa. Define DEMO_USERNAME con otro valor.`);

  const company = await prisma.company.create({ data: { name: DEMO_COMPANY_NAME, taxId: DEMO_COMPANY_TAX_ID } });

  const units = await Promise.all([
    prisma.unitOfMeasure.create({ data: { companyId: company.id, code: "KG", name: "Kilogramo", symbol: "kg", decimalPlaces: 3 } }),
    prisma.unitOfMeasure.create({ data: { companyId: company.id, code: "L", name: "Litro", symbol: "L", decimalPlaces: 3 } }),
    prisma.unitOfMeasure.create({ data: { companyId: company.id, code: "M", name: "Metro", symbol: "m", decimalPlaces: 2 } }),
    prisma.unitOfMeasure.create({ data: { companyId: company.id, code: "UND", name: "Unidad", symbol: "und", decimalPlaces: 0 } }),
    prisma.unitOfMeasure.create({ data: { companyId: company.id, code: "PAR", name: "Par", symbol: "par", decimalPlaces: 0 } }),
  ]);
  const unitByCode = new Map(units.map((unit) => [unit.code, unit]));
  const currencies = await Promise.all([
    prisma.currency.create({ data: { companyId: company.id, code: "PEN", name: "Sol peruano", symbol: "S/", isBase: true } }),
    prisma.currency.create({ data: { companyId: company.id, code: "USD", name: "Dólar estadounidense", symbol: "$" } }),
  ]);
  const pen = currencies.find((currency) => currency.code === "PEN")!;
  const warehouse = await prisma.warehouse.create({ data: { companyId: company.id, code: "PRINCIPAL", name: "Almacén principal" } });

  await prisma.permission.createMany({ data: permissionCodes.map((code) => { const [module, action] = code.split("."); return { companyId: company.id, code, module, action }; }) });
  const permissions = await prisma.permission.findMany({ where: { companyId: company.id } });
  const superadminRole = await prisma.role.create({ data: { companyId: company.id, code: "SUPERADMIN", name: "Superadministrador", description: "Acceso total para la presentación", isSystem: true } });
  const adminRole = await prisma.role.create({ data: { companyId: company.id, code: "ADMIN", name: "Administrador", description: "Administración operativa", isSystem: true } });
  const operatorRole = await prisma.role.create({ data: { companyId: company.id, code: "OPERADOR", name: "Operador de planta", description: "Producción, almacén y preparación" } });
  await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: superadminRole.id, permissionId: permission.id })) });
  await prisma.rolePermission.createMany({ data: permissions.filter((permission) => !permission.code.startsWith("users.") && !permission.code.startsWith("roles.")).map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })) });
  await prisma.rolePermission.createMany({ data: permissions.filter((permission) => ["dashboard", "inventory", "production", "machinery", "pick_pack", "calendar"].includes(permission.module)).map((permission) => ({ roleId: operatorRole.id, permissionId: permission.id })) });

  const passwordHash = await hash(DEMO_PASSWORD);
  const demoUser = await prisma.user.create({ data: { companyId: company.id, username: DEMO_USERNAME, email: `${DEMO_USERNAME}@demo.lkinnovacion`, passwordHash, mustChangePassword: false, name: "Gerencia Demo", status: "ACTIVE" } });
  const adminUser = await prisma.user.create({ data: { companyId: company.id, username: "demo.admin", email: "admin@demo.lkinnovacion", passwordHash, mustChangePassword: false, name: "Lucía Ccama", status: "ACTIVE" } });
  const operatorUser = await prisma.user.create({ data: { companyId: company.id, username: "demo.operario", email: "operario@demo.lkinnovacion", passwordHash, mustChangePassword: false, name: "Carlos Rojas", status: "ACTIVE" } });
  await prisma.userRole.createMany({ data: [
    { userId: demoUser.id, roleId: superadminRole.id },
    { userId: adminUser.id, roleId: adminRole.id },
    { userId: operatorUser.id, roleId: operatorRole.id },
  ] });

  const [supplierPolymers, supplierRubber, supplierChemicals] = await Promise.all([
    prisma.supplier.create({ data: { companyId: company.id, code: "DEMO-PROV-001", name: "Polímeros Andinos SAC", taxId: "20100000011", email: "ventas@polimeros-demo.pe", phone: "+51 999 100 101" } }),
    prisma.supplier.create({ data: { companyId: company.id, code: "DEMO-PROV-002", name: "Cauchos Técnicos del Pacífico EIRL", taxId: "20100000022", email: "pedidos@cauchostecnicos-demo.pe", phone: "+51 999 100 202" } }),
    prisma.supplier.create({ data: { companyId: company.id, code: "DEMO-PROV-003", name: "Químicos Industriales Lima SAC", taxId: "20100000033", email: "comercial@quimicos-demo.pe", phone: "+51 999 100 303" } }),
  ]);
  const [customerRetail, customerStore, customerCorporate] = await Promise.all([
    prisma.customer.create({ data: { companyId: company.id, code: "DEMO-CLI-001", name: "Calzados Centro SAC", taxId: "20500000011", email: "compras@calzadoscentro-demo.pe", phone: "+51 988 200 101" } }),
    prisma.customer.create({ data: { companyId: company.id, code: "DEMO-CLI-002", name: "Tiendas Paso Firme", taxId: "20500000022", email: "abastecimiento@pasofirme-demo.pe", phone: "+51 988 200 202" } }),
    prisma.customer.create({ data: { companyId: company.id, code: "DEMO-CLI-003", name: "Servicios Industriales Sur", taxId: "20500000033", email: "logistica@industrialessur-demo.pe", phone: "+51 988 200 303" } }),
  ]);

  const materialDefinitions: { code: string; name: string; unit: string; minimumStock: number; legacyCode?: string; abbreviation?: string }[] = [
    { code: "DEMO-MP-PVC", name: "PVC", unit: "KG", minimumStock: 120, legacyCode: "01", abbreviation: "PVC" },
    { code: "DEMO-MP-EXP", name: "PVC Expanso", unit: "KG", minimumStock: 60, legacyCode: "02", abbreviation: "EXP" },
    { code: "DEMO-MP-TR", name: "Termoplástico", unit: "KG", minimumStock: 70, legacyCode: "03", abbreviation: "TR" },
    { code: "DEMO-MP-CAU", name: "Caucho", unit: "KG", minimumStock: 90, legacyCode: "04", abbreviation: "RB" },
    { code: "DEMO-MP-PU", name: "Poliuretano", unit: "KG", minimumStock: 30, legacyCode: "05", abbreviation: "PU" },
    { code: "DEMO-MP-COL-TR", name: "Colada TR", unit: "KG", minimumStock: 0, legacyCode: "06" },
    { code: "DEMO-MP-COL-EXP", name: "Colada EXP", unit: "KG", minimumStock: 0, legacyCode: "07" },
    { code: "DEMO-MP-COL-RB", name: "Colada RB", unit: "KG", minimumStock: 0, legacyCode: "08" },
    { code: "DEMO-MP-MOL-EXP", name: "Molido EXP", unit: "KG", minimumStock: 0, legacyCode: "09" },
    { code: "DEMO-MP-MOL-TR", name: "Molido TR", unit: "KG", minimumStock: 0, legacyCode: "10" },
    { code: "DEMO-MP-AL", name: "Aluminio", unit: "KG", minimumStock: 0, legacyCode: "11", abbreviation: "AL" },
    { code: "DEMO-MP-CG", name: "Caucho Gel", unit: "KG", minimumStock: 0, legacyCode: "12", abbreviation: "CG" },
    { code: "DEMO-MP-EVA", name: "EVA", unit: "KG", minimumStock: 60, legacyCode: "13", abbreviation: "EVA" },
    { code: "DEMO-MP-EST", name: "Ácido esteárico", unit: "KG", minimumStock: 15 },
    { code: "DEMO-MP-ZINC", name: "Óxido de zinc", unit: "KG", minimumStock: 20 },
    { code: "DEMO-MP-PIG", name: "Pigmento negro", unit: "KG", minimumStock: 8 },
    { code: "DEMO-MP-CACO3", name: "Carbonato de calcio", unit: "KG", minimumStock: 50 },
    { code: "DEMO-MP-AZU", name: "Azufre industrial", unit: "KG", minimumStock: 10 },
    { code: "DEMO-MP-DESM", name: "Desmoldante para suelas", unit: "L", minimumStock: 12 },
  ];
  const materials = await Promise.all(materialDefinitions.map((item) => prisma.inventoryItem.create({ data: { companyId: company.id, code: item.code, legacyCode: item.legacyCode, abbreviation: item.abbreviation, name: item.name, type: "RAW_MATERIAL", unitId: unitByCode.get(item.unit)!.id, minimumStock: item.minimumStock, lotTrackingMode: "NONE" } })));
  const materialByCode = new Map(materials.map((item) => [item.code, item]));

  const [size38, size39, size40, size41, size42] = await Promise.all([
    prisma.size.create({ data: { companyId: company.id, code: "38", name: "Talla 38", sortOrder: 38 } }),
    prisma.size.create({ data: { companyId: company.id, code: "39", name: "Talla 39", sortOrder: 39 } }),
    prisma.size.create({ data: { companyId: company.id, code: "40", name: "Talla 40", sortOrder: 40 } }),
    prisma.size.create({ data: { companyId: company.id, code: "41", name: "Talla 41", sortOrder: 41 } }),
    prisma.size.create({ data: { companyId: company.id, code: "42", name: "Talla 42", sortOrder: 42 } }),
  ]);
  const [black, white] = await Promise.all([
    prisma.color.create({ data: { companyId: company.id, code: "NEG", name: "Negro", hex: "#111827" } }),
    prisma.color.create({ data: { companyId: company.id, code: "BLA", name: "Blanco", hex: "#F8FAFC" } }),
  ]);
  const urbanSoleProduct = await prisma.product.create({ data: { companyId: company.id, code: "DEMO-SUE-FLEX", name: "Suela Urbana Flex", description: "Suela flexible de PVC/TR para calzado urbano" } });
  const industrialSoleProduct = await prisma.product.create({ data: { companyId: company.id, code: "DEMO-SUE-GRIP", name: "Suela Industrial Grip", description: "Suela antideslizante reforzada para calzado industrial" } });

  async function createVariant(productId: string, sizeId: string, colorId: string, sku: string, itemName: string) {
    const inventoryItem = await prisma.inventoryItem.create({ data: { companyId: company.id, code: `DEMO-PT-${sku}`, name: itemName, type: "FINISHED_PRODUCT", unitId: unitByCode.get("PAR")!.id, minimumStock: 8, lotTrackingMode: "NONE" } });
    return prisma.productVariant.create({ data: { productId, sizeId, colorId, inventoryItemId: inventoryItem.id, sku } });
  }

  const urban38Black = await createVariant(urbanSoleProduct.id, size38.id, black.id, "DEMO-FLEX-38-NEG", "Suela Urbana Flex 38 Negro");
  const urban39Black = await createVariant(urbanSoleProduct.id, size39.id, black.id, "DEMO-FLEX-39-NEG", "Suela Urbana Flex 39 Negro");
  const urban40White = await createVariant(urbanSoleProduct.id, size40.id, white.id, "DEMO-FLEX-40-BLA", "Suela Urbana Flex 40 Blanco");
  const industrial41Black = await createVariant(industrialSoleProduct.id, size41.id, black.id, "DEMO-GRIP-41-NEG", "Suela Industrial Grip 41 Negro");
  await createVariant(industrialSoleProduct.id, size42.id, black.id, "DEMO-GRIP-42-NEG", "Suela Industrial Grip 42 Negro");

  const urbanRecipe = await prisma.recipe.create({ data: { companyId: company.id, productId: urbanSoleProduct.id, code: "DEMO-REC-FLEX", name: "Compuesto PVC/TR Urbana Flex", status: "ACTIVE", versions: { create: { version: 1, yieldQuantity: 24, isActive: true, notes: "Mezcla demostrativa para 24 pares de suelas", ingredients: { create: [
    { itemId: materialByCode.get("DEMO-MP-PVC")!.id, quantity: 12, wastePercentage: 3 },
    { itemId: materialByCode.get("DEMO-MP-TR")!.id, quantity: 8, wastePercentage: 3 },
    { itemId: materialByCode.get("DEMO-MP-CAU")!.id, quantity: 5, wastePercentage: 2 },
    { itemId: materialByCode.get("DEMO-MP-PU")!.id, quantity: 3, wastePercentage: 4 },
    { itemId: materialByCode.get("DEMO-MP-EST")!.id, quantity: 0.4, wastePercentage: 2 },
    { itemId: materialByCode.get("DEMO-MP-ZINC")!.id, quantity: 0.5, wastePercentage: 2 },
    { itemId: materialByCode.get("DEMO-MP-PIG")!.id, quantity: 0.6, wastePercentage: 2 },
    { itemId: materialByCode.get("DEMO-MP-CACO3")!.id, quantity: 4, wastePercentage: 2 },
    { itemId: materialByCode.get("DEMO-MP-DESM")!.id, quantity: 0.8, wastePercentage: 2 },
  ] } } } }, include: { versions: true } });
  const industrialRecipe = await prisma.recipe.create({ data: { companyId: company.id, productId: industrialSoleProduct.id, code: "DEMO-REC-GRIP", name: "Compuesto EVA/Caucho Industrial Grip", status: "ACTIVE", versions: { create: { version: 1, yieldQuantity: 12, isActive: true, notes: "Mezcla demostrativa para 12 pares de suelas", ingredients: { create: [
    { itemId: materialByCode.get("DEMO-MP-EVA")!.id, quantity: 15, wastePercentage: 4 },
    { itemId: materialByCode.get("DEMO-MP-CAU")!.id, quantity: 8, wastePercentage: 3 },
    { itemId: materialByCode.get("DEMO-MP-PU")!.id, quantity: 3, wastePercentage: 4 },
    { itemId: materialByCode.get("DEMO-MP-EST")!.id, quantity: 0.4, wastePercentage: 2 },
    { itemId: materialByCode.get("DEMO-MP-ZINC")!.id, quantity: 0.5, wastePercentage: 2 },
    { itemId: materialByCode.get("DEMO-MP-PIG")!.id, quantity: 0.5, wastePercentage: 2 },
    { itemId: materialByCode.get("DEMO-MP-AZU")!.id, quantity: 0.4, wastePercentage: 2 },
    { itemId: materialByCode.get("DEMO-MP-CACO3")!.id, quantity: 4, wastePercentage: 2 },
  ] } } } }, include: { versions: true } });

  const approvedLines = purchaseLineData([
    { itemId: materialByCode.get("DEMO-MP-CAU")!.id, presentationType: "FARDO", presentationQty: 20, contentPerUnit: 15, pricePerBaseUnit: 8.4 },
    { itemId: materialByCode.get("DEMO-MP-PVC")!.id, presentationType: "SACO", presentationQty: 20, contentPerUnit: 20, pricePerBaseUnit: 7.2 },
    { itemId: materialByCode.get("DEMO-MP-TR")!.id, presentationType: "SACO", presentationQty: 10, contentPerUnit: 20, pricePerBaseUnit: 10.8 },
    { itemId: materialByCode.get("DEMO-MP-EVA")!.id, presentationType: "SACO", presentationQty: 10, contentPerUnit: 20, pricePerBaseUnit: 9.5 },
    { itemId: materialByCode.get("DEMO-MP-PU")!.id, presentationType: "CILINDRO", presentationQty: 5, contentPerUnit: 20, pricePerBaseUnit: 23 },
    { itemId: materialByCode.get("DEMO-MP-EST")!.id, presentationType: "SACO", presentationQty: 3, contentPerUnit: 5, pricePerBaseUnit: 13 },
    { itemId: materialByCode.get("DEMO-MP-ZINC")!.id, presentationType: "SACO", presentationQty: 6, contentPerUnit: 3, pricePerBaseUnit: 18 },
    { itemId: materialByCode.get("DEMO-MP-PIG")!.id, presentationType: "BOLSA", presentationQty: 10, contentPerUnit: 2, pricePerBaseUnit: 28 },
    { itemId: materialByCode.get("DEMO-MP-CACO3")!.id, presentationType: "SACO", presentationQty: 10, contentPerUnit: 20, pricePerBaseUnit: 1.2 },
    { itemId: materialByCode.get("DEMO-MP-AZU")!.id, presentationType: "SACO", presentationQty: 6, contentPerUnit: 5, pricePerBaseUnit: 7.8 },
    { itemId: materialByCode.get("DEMO-MP-DESM")!.id, presentationType: "BIDÓN", presentationQty: 12, contentPerUnit: 5, pricePerBaseUnit: 15 },
  ]);
  const approvedPurchase = await prisma.purchase.create({ data: { companyId: company.id, supplierId: supplierPolymers.id, warehouseId: warehouse.id, currencyId: pen.id, code: "DEMO-CMP-001", receptionDate: relativeDate(-18), documentNumber: "F001-DEMO-1842", status: "PENDING", exchangeRate: 1, ...purchaseTotals(approvedLines), lines: { create: approvedLines } } });
  await approveDemoPurchase(company.id, approvedPurchase.id, demoUser.id);

  const pendingLines = purchaseLineData([{ itemId: materialByCode.get("DEMO-MP-TR")!.id, presentationType: "SACO", presentationQty: 15, contentPerUnit: 20, pricePerBaseUnit: 10.4 }]);
  await prisma.purchase.create({ data: { companyId: company.id, supplierId: supplierRubber.id, warehouseId: warehouse.id, currencyId: pen.id, code: "DEMO-CMP-002", receptionDate: relativeDate(-2), documentNumber: "G001-DEMO-776", status: "PENDING", exchangeRate: 1, ...purchaseTotals(pendingLines), lines: { create: pendingLines } } });
  const rejectedLines = purchaseLineData([{ itemId: materialByCode.get("DEMO-MP-ZINC")!.id, presentationType: "SACO", presentationQty: 10, contentPerUnit: 3, pricePerBaseUnit: 17.5 }]);
  const rejectedPurchase = await prisma.purchase.create({ data: { companyId: company.id, supplierId: supplierChemicals.id, warehouseId: warehouse.id, currencyId: pen.id, code: "DEMO-CMP-003", receptionDate: relativeDate(-7), documentNumber: "G002-DEMO-119", status: "REJECTED", exchangeRate: 1, ...purchaseTotals(rejectedLines), lines: { create: rejectedLines } } });
  await prisma.purchaseApproval.create({ data: { purchaseId: rejectedPurchase.id, userId: adminUser.id, status: "REJECTED", comment: "Lote de óxido de zinc sin certificado de calidad" } });

  const press = await prisma.machine.create({ data: { companyId: company.id, code: "DEMO-MAQ-PR-01", name: "Prensa hidráulica 01", type: "PRESS", brand: "HidraMax", model: "HM-220", serialNumber: "DEMO-PR-22001", location: "Planta 1", status: "ACTIVE", purchaseDate: relativeDate(-730), notes: "Equipo principal para suelas" } });
  const injector = await prisma.machine.create({ data: { companyId: company.id, code: "DEMO-MAQ-IN-01", name: "Inyectora EVA 01", type: "INJECTOR", brand: "TecnoMold", model: "TM-500", serialNumber: "DEMO-IN-50001", location: "Planta 1", status: "ACTIVE", purchaseDate: relativeDate(-510) } });
  const cutter = await prisma.machine.create({ data: { companyId: company.id, code: "DEMO-MAQ-MZ-01", name: "Mezclador Banbury 01", type: "OTHER", brand: "MixTech", model: "BM-80", serialNumber: "DEMO-BM-8001", location: "Área de mezclado", status: "MAINTENANCE", purchaseDate: relativeDate(-340) } });
  await prisma.machineMaintenanceRecord.createMany({ data: [
    { machineId: press.id, type: "PREVENTIVE", performedAt: relativeDate(-95), nextDueAt: relativeDate(-5), provider: "Servicio Técnico Industrial", description: "Cambio de aceite y revisión de presión", cost: 850, downtimeHours: 5 },
    { machineId: injector.id, type: "PREVENTIVE", performedAt: relativeDate(-35), nextDueAt: relativeDate(55), provider: "TecnoMold Perú", description: "Limpieza de boquillas y calibración", cost: 620, downtimeHours: 3 },
    { machineId: cutter.id, type: "REPAIR", performedAt: relativeDate(-2), nextDueAt: relativeDate(88), provider: "MixTech Service", description: "Cambio de rodamientos y calibración de temperatura", cost: 1280, downtimeHours: 12, notes: "Equipo aún en validación" },
  ] });

  const urbanVersionId = urbanRecipe.versions[0].id;
  const industrialVersionId = industrialRecipe.versions[0].id;
  const completedProduction = await createDemoProduction({ companyId: company.id, userId: operatorUser.id, number: "DEMO-OP-001", warehouseId: warehouse.id, productVariantId: urban38Black.id, recipeVersionId: urbanVersionId, machineId: press.id, recipeRuns: 1, plannedAt: relativeDate(-12), operatorName: "Carlos Rojas", processType: "PRENSA", mold: "FLEX-38", brandColor: "Negro", pressNumber: "PR-01", pressLoad: "34 kg", sizeProgram: [{ size: "38", requestedPairs: 24 }] });
  await releaseDemoProduction(company.id, completedProduction.id);
  await startDemoProduction(company.id, completedProduction.id, operatorUser.id);
  await completeDemoProduction(company.id, completedProduction.id, operatorUser.id, 24);

  const activeProduction = await createDemoProduction({ companyId: company.id, userId: operatorUser.id, number: "DEMO-OP-002", warehouseId: warehouse.id, productVariantId: urban39Black.id, recipeVersionId: urbanVersionId, machineId: press.id, recipeRuns: 1, plannedAt: relativeDate(0), operatorName: "Carlos Rojas", processType: "PRENSA", mold: "FLEX-39", brandColor: "Negro", pressNumber: "PR-01", pressLoad: "34 kg", sizeProgram: [{ size: "39", requestedPairs: 24 }] });
  await releaseDemoProduction(company.id, activeProduction.id);
  await startDemoProduction(company.id, activeProduction.id, operatorUser.id);

  const reservedProduction = await createDemoProduction({ companyId: company.id, userId: operatorUser.id, number: "DEMO-OP-003", warehouseId: warehouse.id, productVariantId: urban40White.id, recipeVersionId: urbanVersionId, machineId: injector.id, recipeRuns: 1, plannedAt: relativeDate(1), operatorName: "María Salas", processType: "INYECTORA", mold: "FLEX-40", brandColor: "Blanco", injectorNumber: "IN-01", curve: "165 °C / 45 s", sizeProgram: [{ size: "40", requestedPairs: 24 }] });
  await releaseDemoProduction(company.id, reservedProduction.id);
  await createDemoProduction({ companyId: company.id, userId: operatorUser.id, number: "DEMO-OP-004", warehouseId: warehouse.id, productVariantId: industrial41Black.id, recipeVersionId: industrialVersionId, machineId: injector.id, recipeRuns: 1, plannedAt: relativeDate(3), operatorName: "María Salas", processType: "INYECTORA", mold: "GRIP-41", brandColor: "Negro", injectorNumber: "IN-01", curve: "170 °C / 55 s", sizeProgram: [{ size: "41", requestedPairs: 12 }] });

  const draftOrder = await createDemoSalesOrder({ companyId: company.id, number: "DEMO-PED-001", customerId: customerRetail.id, requestedAt: relativeDate(-1), promisedAt: relativeDate(4), notes: "Pedido de muestra pendiente de confirmación", lines: [{ productVariantId: urban38Black.id, quantity: 3, unitPrice: 18.9 }] });
  void draftOrder;
  const pickingOrder = await createDemoSalesOrder({ companyId: company.id, number: "DEMO-PED-002", customerId: customerStore.id, requestedAt: relativeDate(-4), promisedAt: relativeDate(1), notes: "Entrega prioritaria a planta de calzado", lines: [{ productVariantId: urban38Black.id, quantity: 5, unitPrice: 18.5 }] });
  await confirmDemoSalesOrder(company.id, pickingOrder.id, warehouse.id);
  const readyOrder = await createDemoSalesOrder({ companyId: company.id, number: "DEMO-PED-003", customerId: customerCorporate.id, requestedAt: relativeDate(-6), promisedAt: relativeDate(0), notes: "Recojo coordinado con cliente", lines: [{ productVariantId: urban38Black.id, quantity: 6, unitPrice: 18 }] });
  await confirmDemoSalesOrder(company.id, readyOrder.id, warehouse.id);
  const dispatchedOrder = await createDemoSalesOrder({ companyId: company.id, number: "DEMO-PED-004", customerId: customerRetail.id, requestedAt: relativeDate(-10), promisedAt: relativeDate(-3), notes: "Pedido de suelas despachado para historial", lines: [{ productVariantId: urban38Black.id, quantity: 4, unitPrice: 18.8 }] });
  await confirmDemoSalesOrder(company.id, dispatchedOrder.id, warehouse.id);

  async function createPickPack(orderId: string, number: string, status: "PICKING" | "READY", pickedRatio: number) {
    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
    const pickPack = await prisma.pickPackOrder.create({ data: { companyId: company.id, salesOrderId: order.id, warehouseId: warehouse.id, number, priority: number.endsWith("002") ? "URGENT" : "NORMAL", status, startedAt: relativeDate(-1), packingStartedAt: status === "READY" ? relativeDate(0, 8) : null, readyAt: status === "READY" ? relativeDate(0, 9) : null, carrier: "Transporte Demo Express", shippingDocument: status === "READY" ? `GR-${number}` : null, notes: "Datos temporales de presentación", lines: { create: order.lines.map((line) => ({ salesOrderLineId: line.id, warehouseLocation: "A-01-03", requestedQuantity: line.quantity, pickedQuantity: Number(line.quantity) * pickedRatio, packedQuantity: status === "READY" ? line.quantity : 0 })) }, packages: status === "READY" ? { create: [{ packageNumber: 1, packageType: "Caja master", weight: 8.5, length: 60, width: 40, height: 35, notes: "Contenido verificado" }] } : undefined } });
    if (status === "READY") await prisma.salesOrder.update({ where: { id: order.id }, data: { status: "READY" } });
    return pickPack;
  }

  await createPickPack(pickingOrder.id, "DEMO-PP-002", "PICKING", 0.6);
  await createPickPack(readyOrder.id, "DEMO-PP-003", "READY", 1);
  await createPickPack(dispatchedOrder.id, "DEMO-PP-004", "READY", 1);
  await dispatchDemoSalesOrder(company.id, dispatchedOrder.id, adminUser.id);

  await prisma.calendarEvent.createMany({ data: [
    { companyId: company.id, createdById: demoUser.id, title: "[DEMO] Reunión de planificación semanal", type: "MEETING", priority: "NORMAL", status: "PENDING", startAt: relativeDate(1, 9), endAt: relativeDate(1, 10), description: "Revisión de producción, pedidos y abastecimiento", reminderMinutes: 30 },
    { companyId: company.id, createdById: operatorUser.id, title: "[DEMO] Inventario cíclico de materias primas", type: "INVENTORY", priority: "HIGH", status: "PENDING", startAt: relativeDate(2, 8), endAt: relativeDate(2, 12), description: "Pesaje de caucho, PVC, TR, EVA, PU y aditivos", reminderMinutes: 60 },
    { companyId: company.id, createdById: adminUser.id, title: "[DEMO] Coordinar entrega DEMO-PED-003", type: "TASK", priority: "URGENT", status: "PENDING", startAt: relativeDate(0, 15), description: "Confirmar transporte y documento de salida", reminderMinutes: 30 },
    { companyId: company.id, createdById: operatorUser.id, title: "[DEMO] Cierre de orden DEMO-OP-002", type: "TASK", priority: "HIGH", status: "PENDING", startAt: relativeDate(1, 16), description: "Registrar producción diaria y cantidad terminada", reminderMinutes: 45 },
    { companyId: company.id, createdById: demoUser.id, title: "[DEMO] Capacitación de seguridad", type: "OTHER", priority: "LOW", status: "COMPLETED", startAt: relativeDate(-3, 11), endAt: relativeDate(-3, 12), description: "Actividad completada para mostrar el historial" },
  ] });
  await prisma.notification.createMany({ data: [
    { companyId: company.id, userId: demoUser.id, type: "DEMO_STOCK", title: "Stock bajo de óxido de zinc", message: "El stock disponible está por debajo del mínimo configurado.", data: { itemCode: "DEMO-MP-ZINC" } },
    { companyId: company.id, userId: demoUser.id, type: "DEMO_MAINTENANCE", title: "Mantenimiento vencido", message: "La prensa hidráulica 01 requiere programación de mantenimiento.", data: { machineCode: "DEMO-MAQ-PR-01" } },
    { companyId: company.id, userId: demoUser.id, type: "DEMO_ORDER", title: "Pedido próximo a entrega", message: "El pedido DEMO-PED-003 debe entregarse hoy.", data: { orderNumber: "DEMO-PED-003" } },
  ] });

  console.log("Datos temporales de demostración preparados.");
  console.log(`Empresa: ${DEMO_COMPANY_NAME}`);
  console.log(`Usuario: ${DEMO_USERNAME}`);
  console.log(`Contraseña: ${DEMO_PASSWORD}`);
  console.log("Para eliminarlos: npm run demo:cleanup");
}

main()
  .catch(async (error: unknown) => {
    console.error(error);
    try { await removeDemoCompany(); } catch { /* Mantiene el error original. */ }
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
