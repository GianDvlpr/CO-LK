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
  "sessions.read", "sessions.revoke",
  "audit.read",
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

async function postIncoming(input: { companyId: string; userId: string; warehouseId: string; itemId: string; quantity: number; unitCost: number; type: "PURCHASE_RECEIPT" | "PRODUCTION_OUTPUT" | "ADJUSTMENT_IN"; referenceType: string; referenceId: string; occurredAt?: Date }) {
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
  recipeVersionId: string;
  secondaryRecipeVersionId?: string;
  salesOrderId?: string;
  materialItemId?: string;
  machineId: string;
  priority: 1 | 2 | 3;
  plannedAt: Date;
  operatorName: string;
  processType: "PRENSA" | "INYECTORA" | "AMBOS" | "NINGUNO";
  modelLogo: string;
  brandColor: string;
  pressNumber?: string;
  pressLoad?: string;
  injectorNumber?: string;
  curve?: string;
  sizeProgram: { productVariantId: string; requestedPairs: number }[];
  productionTurns?: { date: string; quantities: { productVariantId: string; quantity: number }[]; observations?: string }[];
  components?: { itemId: string; componentType: "CERCO_VIRA" | "INSERTO_PUNTA" | "INSERTO_TALON" | "OTRO"; quantity: number; colorDetail?: string }[];
};

async function createDemoProduction(input: DemoProductionInput) {
  const [version, secondaryVersion, machine, materialItem, variants] = await Promise.all([
    prisma.recipeVersion.findUniqueOrThrow({ where: { id: input.recipeVersionId }, include: { ingredients: true } }),
    input.secondaryRecipeVersionId ? prisma.recipeVersion.findUniqueOrThrow({ where: { id: input.secondaryRecipeVersionId }, include: { ingredients: true } }) : null,
    prisma.machine.findUniqueOrThrow({ where: { id: input.machineId } }),
    input.materialItemId ? prisma.inventoryItem.findUniqueOrThrow({ where: { id: input.materialItemId } }) : null,
    prisma.productVariant.findMany({
      where: { id: { in: input.sizeProgram.map((item) => item.productVariantId) } },
      include: { product: true, size: true, color: true, secondaryColor: true },
    }),
  ]);
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const normalizedProgram = input.sizeProgram.map((entry) => {
    const variant = variantById.get(entry.productVariantId);
    if (!variant) throw new Error(`Variante demo inválida: ${entry.productVariantId}.`);
    return {
      ...entry,
      sku: variant.sku,
      size: variant.size.name,
      color: variant.secondaryColor ? `${variant.color.name} / ${variant.secondaryColor.name}` : variant.color.name,
    };
  });
  const normalizedTurns = (input.productionTurns ?? []).map((turn) => ({
    ...turn,
    quantities: turn.quantities.map((entry) => {
      const variant = variantById.get(entry.productVariantId);
      if (!variant) throw new Error(`Variante demo inválida: ${entry.productVariantId}.`);
      return { ...entry, sku: variant.sku, size: variant.size.name };
    }),
  }));
  const plannedQuantity = normalizedProgram.reduce((sum, item) => sum + item.requestedPairs, 0);
  const recipeRuns = plannedQuantity / numeric(version.yieldQuantity);
  const secondaryRecipeRuns = secondaryVersion ? plannedQuantity / numeric(secondaryVersion.yieldQuantity) : null;
  const plannedMaterials = new Map<string, number>();
  const addMaterial = (itemId: string, quantity: number) => plannedMaterials.set(itemId, (plannedMaterials.get(itemId) ?? 0) + quantity);
  for (const ingredient of version.ingredients) addMaterial(ingredient.itemId, numeric(ingredient.quantity) * recipeRuns);
  if (secondaryVersion && secondaryRecipeRuns) for (const ingredient of secondaryVersion.ingredients) addMaterial(ingredient.itemId, numeric(ingredient.quantity) * secondaryRecipeRuns);
  for (const component of input.components ?? []) addMaterial(component.itemId, component.quantity);
  const primaryVariant = variantById.get(normalizedProgram[0].productVariantId)!;
  const order = await prisma.productionOrder.create({ data: {
    companyId: input.companyId,
    warehouseId: input.warehouseId,
    productVariantId: primaryVariant.id,
    recipeVersionId: input.recipeVersionId,
    secondaryRecipeVersionId: input.secondaryRecipeVersionId,
    salesOrderId: input.salesOrderId,
    materialItemId: input.materialItemId,
    machineId: input.machineId,
    number: input.number,
    recipeRuns,
    secondaryRecipeRuns,
    plannedQuantity,
    priority: input.priority,
    plannedAt: input.plannedAt,
    machineEquipment: `${machine.code} · ${machine.name}`,
    operatorName: input.operatorName,
    modelLogo: input.modelLogo,
    materialLoad: materialItem ? `${materialItem.code} · ${materialItem.name}` : null,
    seriesLot: normalizedProgram.map((item) => item.size).join(", "),
    processType: input.processType,
    mold: primaryVariant.product.matrixCode,
    brandColor: input.brandColor,
    pressNumber: input.pressNumber,
    pressLoad: input.pressLoad,
    injectorNumber: input.injectorNumber,
    curve: input.curve,
    sizeProgram: normalizedProgram,
    dailyProduction: [],
    productionTurns: normalizedTurns,
    materials: { create: Array.from(plannedMaterials, ([itemId, plannedQuantity]) => ({ itemId, plannedQuantity })) },
    components: { create: (input.components ?? []).map((component) => ({ itemId: component.itemId, componentType: component.componentType, quantity: component.quantity, colorDetail: component.colorDetail })) },
  } });
  if (input.salesOrderId) await prisma.salesOrderLine.updateMany({ where: { salesOrderId: input.salesOrderId, productVariantId: { in: normalizedProgram.map((item) => item.productVariantId) } }, data: { productionOrderId: order.id } });
  return order;
}

async function releaseDemoProduction(companyId: string, orderId: string) {
  const order = await prisma.productionOrder.findFirstOrThrow({ where: { id: orderId, companyId }, include: { materials: true } });
  for (const material of order.materials) await reserveStock({ warehouseId: order.warehouseId, itemId: material.itemId, quantity: numeric(material.plannedQuantity), referenceType: "PRODUCTION_ORDER", referenceId: order.id });
  await prisma.productionOrder.update({ where: { id: order.id }, data: { status: "RELEASED" } });
}

async function startDemoProduction(companyId: string, orderId: string, userId: string, startedAt = relativeDate(-1)) {
  const order = await prisma.productionOrder.findFirstOrThrow({ where: { id: orderId, companyId }, include: { materials: true } });
  for (const material of order.materials) {
    const quantity = numeric(material.plannedQuantity);
    await postOutgoing({ companyId, userId, warehouseId: order.warehouseId, itemId: material.itemId, quantity, reservedQuantity: quantity, type: "PRODUCTION_CONSUMPTION", referenceType: "PRODUCTION_ORDER", referenceId: order.id, occurredAt: startedAt });
    await prisma.productionMaterial.update({ where: { id: material.id }, data: { consumedQuantity: quantity } });
  }
  await prisma.stockReservation.updateMany({ where: { referenceType: "PRODUCTION_ORDER", referenceId: order.id, active: true }, data: { active: false } });
  await prisma.productionOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS", startedAt } });
  if (order.salesOrderId) await prisma.salesOrder.update({ where: { id: order.salesOrderId }, data: { status: "IN_PRODUCTION" } });
}

async function completeDemoProduction(companyId: string, orderId: string, userId: string, outputs: { productVariantId: string; quantity: number }[], completedAt = relativeDate(-10)) {
  const order = await prisma.productionOrder.findFirstOrThrow({ where: { id: orderId, companyId }, include: { materials: true } });
  const consumed = await prisma.stockMovement.aggregate({ where: { referenceType: "PRODUCTION_ORDER", referenceId: order.id, type: "PRODUCTION_CONSUMPTION" }, _sum: { movementValue: true } });
  const totalCost = Math.abs(numeric(consumed._sum.movementValue ?? 0));
  const producedQuantity = outputs.reduce((sum, output) => sum + output.quantity, 0);
  const variants = await prisma.productVariant.findMany({ where: { id: { in: outputs.map((output) => output.productVariantId) } } });
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  for (const output of outputs) {
    const variant = variantById.get(output.productVariantId);
    if (!variant) throw new Error(`Salida demo inválida: ${output.productVariantId}.`);
    await postIncoming({ companyId, userId, warehouseId: order.warehouseId, itemId: variant.inventoryItemId, quantity: output.quantity, unitCost: totalCost / producedQuantity, type: "PRODUCTION_OUTPUT", referenceType: "PRODUCTION_ORDER", referenceId: order.id, occurredAt: completedAt });
  }
  const sizeProgram = Array.isArray(order.sizeProgram) ? order.sizeProgram.map((item) => {
    if (!item || typeof item !== "object" || !("productVariantId" in item)) return item;
    const variantId = String(item.productVariantId);
    return { ...item, producedPairs: outputs.find((output) => output.productVariantId === variantId)?.quantity ?? 0 };
  }) : [];
  for (const [index, material] of order.materials.entries()) {
    const actualWasteQuantity = index < 3 ? Number((numeric(material.consumedQuantity) * (0.012 + index * 0.004)).toFixed(3)) : 0;
    await prisma.productionMaterial.update({ where: { id: material.id }, data: { actualWasteQuantity } });
  }
  await prisma.productionOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", producedQuantity, sizeProgram, completedAt } });
  if (order.salesOrderId) {
    const pendingLines = await prisma.salesOrderLine.count({ where: { salesOrderId: order.salesOrderId, OR: [{ productionOrderId: null }, { productionOrder: { status: { not: "COMPLETED" } } }] } });
    if (pendingLines === 0) await prisma.salesOrder.update({ where: { id: order.salesOrderId }, data: { status: "READY" } });
  }
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
  await prisma.rolePermission.createMany({ data: permissions.filter((permission) => !permission.code.startsWith("users.") && !permission.code.startsWith("roles.") && !permission.code.startsWith("sessions.") && !permission.code.startsWith("audit.")).map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })) });
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
  await prisma.session.createMany({ data: [
    { userId: operatorUser.id, tokenHash: `demo-active-${company.id}`, ipAddress: "192.168.1.48", userAgent: "Chrome · Tablet de planta", createdAt: relativeDate(-1, 7), lastSeenAt: relativeDate(0, 10), expiresAt: relativeDate(5, 18) },
    { userId: adminUser.id, tokenHash: `demo-ended-${company.id}`, ipAddress: "192.168.1.21", userAgent: "Edge · Equipo administrativo", createdAt: relativeDate(-3, 8), lastSeenAt: relativeDate(-3, 16), expiresAt: relativeDate(2, 8), endedAt: relativeDate(-3, 16), endReason: "LOGOUT" },
  ] });

  const businessYear = new Date().getFullYear();
  const [supplierPolymers, supplierRubber, supplierChemicals] = await Promise.all([
    prisma.supplier.create({ data: { companyId: company.id, code: "PROV-000001", name: "Polímeros Andinos SAC", taxId: "20100000011", fiscalAddress: "Av. Industrial 245, Ate", department: "Lima", province: "Lima", district: "Ate", email: "ventas@polimeros-demo.pe", phone: "+51 999 100 101" } }),
    prisma.supplier.create({ data: { companyId: company.id, code: "PROV-000002", name: "Cauchos Técnicos del Pacífico EIRL", taxId: "20100000022", fiscalAddress: "Calle Los Cauchos 180, Callao", department: "Callao", province: "Callao", district: "Callao", email: "pedidos@cauchostecnicos-demo.pe", phone: "+51 999 100 202" } }),
    prisma.supplier.create({ data: { companyId: company.id, code: "PROV-000003", name: "Químicos Industriales Lima SAC", taxId: "20100000033", fiscalAddress: "Jr. Química 810, San Luis", department: "Lima", province: "Lima", district: "San Luis", email: "comercial@quimicos-demo.pe", phone: "+51 999 100 303" } }),
  ]);
  const [customerRetail, customerStore, customerCorporate] = await Promise.all([
    prisma.customer.create({ data: { companyId: company.id, code: "CLI-000001", name: "Calzados Centro SAC", taxId: "20500000011", fiscalAddress: "Av. Gamarra 540, La Victoria", department: "Lima", province: "Lima", district: "La Victoria", email: "compras@calzadoscentro-demo.pe", phone: "+51 988 200 101" } }),
    prisma.customer.create({ data: { companyId: company.id, code: "CLI-000002", name: "Tiendas Paso Firme", taxId: "20500000022", fiscalAddress: "Av. Grau 1120, Trujillo", department: "La Libertad", province: "Trujillo", district: "Trujillo", email: "abastecimiento@pasofirme-demo.pe", phone: "+51 988 200 202" } }),
    prisma.customer.create({ data: { companyId: company.id, code: "CLI-000003", name: "Servicios Industriales Sur", taxId: "20500000033", fiscalAddress: "Parque Industrial Río Seco, Cerro Colorado", department: "Arequipa", province: "Arequipa", district: "Cerro Colorado", email: "logistica@industrialessur-demo.pe", phone: "+51 988 200 303" } }),
  ]);

  const materialDefinitions: { key: string; code: string; name: string; type: "RAW_MATERIAL" | "WASTE"; unit: string; minimumStock: number; abbreviation?: string }[] = [
    { key: "DEMO-MP-PVC", code: "MP-000001", name: "PVC", type: "RAW_MATERIAL", unit: "KG", minimumStock: 120, abbreviation: "PVC" },
    { key: "DEMO-MP-EXP", code: "MP-000002", name: "PVC Expanso", type: "RAW_MATERIAL", unit: "KG", minimumStock: 60, abbreviation: "EXP" },
    { key: "DEMO-MP-TR", code: "MP-000003", name: "Termoplástico TR", type: "RAW_MATERIAL", unit: "KG", minimumStock: 70, abbreviation: "TR" },
    { key: "DEMO-MP-CAU", code: "MP-000004", name: "Caucho", type: "RAW_MATERIAL", unit: "KG", minimumStock: 90, abbreviation: "RB" },
    { key: "DEMO-MP-PU", code: "MP-000005", name: "Poliuretano", type: "RAW_MATERIAL", unit: "KG", minimumStock: 30, abbreviation: "PU" },
    { key: "DEMO-MP-COL-TR", code: "MER-000001", name: "Colada TR", type: "WASTE", unit: "KG", minimumStock: 0 },
    { key: "DEMO-MP-COL-EXP", code: "MER-000002", name: "Colada EXP", type: "WASTE", unit: "KG", minimumStock: 0 },
    { key: "DEMO-MP-COL-RB", code: "MER-000003", name: "Colada RB", type: "WASTE", unit: "KG", minimumStock: 0 },
    { key: "DEMO-MP-MOL-EXP", code: "MER-000004", name: "Molido EXP", type: "WASTE", unit: "KG", minimumStock: 0 },
    { key: "DEMO-MP-MOL-TR", code: "MER-000005", name: "Molido TR", type: "WASTE", unit: "KG", minimumStock: 0 },
    { key: "DEMO-MP-AL", code: "MP-000006", name: "Aluminio", type: "RAW_MATERIAL", unit: "KG", minimumStock: 0, abbreviation: "AL" },
    { key: "DEMO-MP-CG", code: "MP-000007", name: "Caucho Gel", type: "RAW_MATERIAL", unit: "KG", minimumStock: 0, abbreviation: "CG" },
    { key: "DEMO-MP-EVA", code: "MP-000008", name: "EVA", type: "RAW_MATERIAL", unit: "KG", minimumStock: 60, abbreviation: "EVA" },
    { key: "DEMO-MP-EST", code: "MP-000009", name: "Ácido esteárico", type: "RAW_MATERIAL", unit: "KG", minimumStock: 15 },
    { key: "DEMO-MP-ZINC", code: "MP-000010", name: "Óxido de zinc", type: "RAW_MATERIAL", unit: "KG", minimumStock: 20 },
    { key: "DEMO-MP-PIG", code: "MP-000011", name: "Pigmento negro", type: "RAW_MATERIAL", unit: "KG", minimumStock: 8 },
    { key: "DEMO-MP-CACO3", code: "MP-000012", name: "Carbonato de calcio", type: "RAW_MATERIAL", unit: "KG", minimumStock: 50 },
    { key: "DEMO-MP-AZU", code: "MP-000013", name: "Azufre industrial", type: "RAW_MATERIAL", unit: "KG", minimumStock: 10 },
    { key: "DEMO-MP-DESM", code: "MP-000014", name: "Desmoldante para suelas", type: "RAW_MATERIAL", unit: "L", minimumStock: 12 },
    { key: "DEMO-MP-PIG-ROJ", code: "MP-000015", name: "Pigmento rojo", type: "RAW_MATERIAL", unit: "KG", minimumStock: 6 },
    { key: "DEMO-MP-VIRA", code: "MP-000016", name: "Cerco / vira negra", type: "RAW_MATERIAL", unit: "M", minimumStock: 40 },
    { key: "DEMO-MP-INS-TAL", code: "MP-000017", name: "Inserto de talón", type: "RAW_MATERIAL", unit: "UND", minimumStock: 50 },
  ];
  const chemicalMaterialKeys = new Set(["DEMO-MP-AL", "DEMO-MP-EST", "DEMO-MP-ZINC", "DEMO-MP-PIG", "DEMO-MP-CACO3", "DEMO-MP-AZU", "DEMO-MP-DESM", "DEMO-MP-PIG-ROJ"]);
  const materials = await Promise.all(materialDefinitions.map((item) => {
    const supplierId = chemicalMaterialKeys.has(item.key)
      ? supplierChemicals.id
      : item.type === "WASTE" || ["DEMO-MP-CAU", "DEMO-MP-CG", "DEMO-MP-VIRA", "DEMO-MP-INS-TAL"].includes(item.key)
        ? supplierRubber.id
        : supplierPolymers.id;
    return prisma.inventoryItem.create({ data: { companyId: company.id, code: item.code, abbreviation: item.abbreviation, name: item.name, type: item.type, supplierId, currencyId: pen.id, unitId: unitByCode.get(item.unit)!.id, minimumStock: item.minimumStock, lotTrackingMode: "NONE" } });
  }));
  const materialByCode = new Map(materials.map((item, index) => [materialDefinitions[index].key, item]));

  const [size38, size39, size40, size41, size42] = await Promise.all([
    prisma.size.create({ data: { companyId: company.id, code: "38", name: "Talla 38", sortOrder: 38 } }),
    prisma.size.create({ data: { companyId: company.id, code: "39", name: "Talla 39", sortOrder: 39 } }),
    prisma.size.create({ data: { companyId: company.id, code: "40", name: "Talla 40", sortOrder: 40 } }),
    prisma.size.create({ data: { companyId: company.id, code: "41", name: "Talla 41", sortOrder: 41 } }),
    prisma.size.create({ data: { companyId: company.id, code: "42", name: "Talla 42", sortOrder: 42 } }),
  ]);
  const [black, white, red] = await Promise.all([
    prisma.color.create({ data: { companyId: company.id, code: "NEG", name: "Negro", hex: "#111827" } }),
    prisma.color.create({ data: { companyId: company.id, code: "BLA", name: "Blanco", hex: "#F8FAFC" } }),
    prisma.color.create({ data: { companyId: company.id, code: "ROJ", name: "Rojo", hex: "#B91C1C" } }),
  ]);
  const urbanSoleProduct = await prisma.product.create({ data: { companyId: company.id, code: `PROD-${businessYear}-000001`, matrixCode: "I0034", name: "Suela Urbana Flex", description: "Suela flexible de PVC/TR para calzado urbano, disponible en versión monocolor y bicolor" } });
  const industrialSoleProduct = await prisma.product.create({ data: { companyId: company.id, code: `PROD-${businessYear}-000002`, matrixCode: "I0042", name: "Suela Industrial Grip", description: "Suela antideslizante reforzada para calzado industrial" } });

  async function createVariant(productId: string, sizeId: string, colorId: string, sku: string, itemName: string, secondaryColorId?: string) {
    const inventoryItem = await prisma.inventoryItem.create({ data: { companyId: company.id, code: sku, name: itemName, type: "FINISHED_PRODUCT", unitId: unitByCode.get("PAR")!.id, minimumStock: 6, lotTrackingMode: "NONE" } });
    return prisma.productVariant.create({ data: { productId, sizeId, colorId, secondaryColorId, inventoryItemId: inventoryItem.id, sku } });
  }

  const urban38Black = await createVariant(urbanSoleProduct.id, size38.id, black.id, "I0034-NEG-38", "Suela Urbana Flex · Talla 38 · Negro");
  const urban39Black = await createVariant(urbanSoleProduct.id, size39.id, black.id, "I0034-NEG-39", "Suela Urbana Flex · Talla 39 · Negro");
  const urban40Black = await createVariant(urbanSoleProduct.id, size40.id, black.id, "I0034-NEG-40", "Suela Urbana Flex · Talla 40 · Negro");
  const urban38Bicolor = await createVariant(urbanSoleProduct.id, size38.id, black.id, "I0034-NEG-ROJ-38", "Suela Urbana Flex · Talla 38 · Negro / Rojo", red.id);
  const urban39Bicolor = await createVariant(urbanSoleProduct.id, size39.id, black.id, "I0034-NEG-ROJ-39", "Suela Urbana Flex · Talla 39 · Negro / Rojo", red.id);
  const urban40Bicolor = await createVariant(urbanSoleProduct.id, size40.id, black.id, "I0034-NEG-ROJ-40", "Suela Urbana Flex · Talla 40 · Negro / Rojo", red.id);
  const industrial41Black = await createVariant(industrialSoleProduct.id, size41.id, black.id, "I0042-NEG-41", "Suela Industrial Grip · Talla 41 · Negro");
  const industrial42Black = await createVariant(industrialSoleProduct.id, size42.id, black.id, "I0042-NEG-42", "Suela Industrial Grip · Talla 42 · Negro");
  void white;

  const urbanRecipe = await prisma.recipe.create({ data: { companyId: company.id, productId: urbanSoleProduct.id, code: "REC-000001", name: "Formulación C1 negra · Urbana Flex", status: "ACTIVE", versions: { create: { version: 1, yieldQuantity: 24, isActive: true, notes: "Rendimiento manual: 24 pares por carga de color principal C1", ingredients: { create: [
    { itemId: materialByCode.get("DEMO-MP-PVC")!.id, quantity: 12 },
    { itemId: materialByCode.get("DEMO-MP-TR")!.id, quantity: 8 },
    { itemId: materialByCode.get("DEMO-MP-CAU")!.id, quantity: 5 },
    { itemId: materialByCode.get("DEMO-MP-PU")!.id, quantity: 3 },
    { itemId: materialByCode.get("DEMO-MP-EST")!.id, quantity: 0.4 },
    { itemId: materialByCode.get("DEMO-MP-ZINC")!.id, quantity: 0.5 },
    { itemId: materialByCode.get("DEMO-MP-PIG")!.id, quantity: 0.6 },
    { itemId: materialByCode.get("DEMO-MP-CACO3")!.id, quantity: 4 },
    { itemId: materialByCode.get("DEMO-MP-DESM")!.id, quantity: 0.8 },
  ] } } } }, include: { versions: true } });
  const urbanRedRecipe = await prisma.recipe.create({ data: { companyId: company.id, productId: urbanSoleProduct.id, code: "REC-000002", name: "Formulación C2 roja · Urbana Flex", status: "ACTIVE", versions: { create: { version: 1, yieldQuantity: 24, isActive: true, notes: "Rendimiento manual: 24 pares por carga de color secundario C2", ingredients: { create: [
    { itemId: materialByCode.get("DEMO-MP-PVC")!.id, quantity: 5 },
    { itemId: materialByCode.get("DEMO-MP-TR")!.id, quantity: 3 },
    { itemId: materialByCode.get("DEMO-MP-PIG-ROJ")!.id, quantity: 0.5 },
    { itemId: materialByCode.get("DEMO-MP-EST")!.id, quantity: 0.2 },
    { itemId: materialByCode.get("DEMO-MP-ZINC")!.id, quantity: 0.2 },
  ] } } } }, include: { versions: true } });
  const industrialRecipe = await prisma.recipe.create({ data: { companyId: company.id, productId: industrialSoleProduct.id, code: "REC-000003", name: "Formulación EVA/Caucho · Industrial Grip", status: "ACTIVE", versions: { create: { version: 1, yieldQuantity: 12, isActive: true, notes: "Rendimiento manual: 12 pares por carga", ingredients: { create: [
    { itemId: materialByCode.get("DEMO-MP-EVA")!.id, quantity: 15 },
    { itemId: materialByCode.get("DEMO-MP-CAU")!.id, quantity: 8 },
    { itemId: materialByCode.get("DEMO-MP-PU")!.id, quantity: 3 },
    { itemId: materialByCode.get("DEMO-MP-EST")!.id, quantity: 0.4 },
    { itemId: materialByCode.get("DEMO-MP-ZINC")!.id, quantity: 0.5 },
    { itemId: materialByCode.get("DEMO-MP-PIG")!.id, quantity: 0.5 },
    { itemId: materialByCode.get("DEMO-MP-AZU")!.id, quantity: 0.4 },
    { itemId: materialByCode.get("DEMO-MP-CACO3")!.id, quantity: 4 },
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
    { itemId: materialByCode.get("DEMO-MP-PIG-ROJ")!.id, presentationType: "BOLSA", presentationQty: 8, contentPerUnit: 2, pricePerBaseUnit: 29 },
    { itemId: materialByCode.get("DEMO-MP-VIRA")!.id, presentationType: "ROLLO", presentationQty: 10, contentPerUnit: 20, pricePerBaseUnit: 2.8 },
    { itemId: materialByCode.get("DEMO-MP-INS-TAL")!.id, presentationType: "CAJA", presentationQty: 4, contentPerUnit: 50, pricePerBaseUnit: 1.6 },
  ]);
  const approvedPurchase = await prisma.purchase.create({ data: { companyId: company.id, supplierId: supplierPolymers.id, warehouseId: warehouse.id, currencyId: pen.id, code: `CMP-${businessYear}-000001`, receptionDate: relativeDate(-18), documentNumber: "F001-001842", status: "PENDING", exchangeRate: 1, ...purchaseTotals(approvedLines), lines: { create: approvedLines } } });
  await approveDemoPurchase(company.id, approvedPurchase.id, demoUser.id);

  const pendingLines = purchaseLineData([{ itemId: materialByCode.get("DEMO-MP-TR")!.id, presentationType: "SACO", presentationQty: 15, contentPerUnit: 20, pricePerBaseUnit: 10.4 }]);
  await prisma.purchase.create({ data: { companyId: company.id, supplierId: supplierRubber.id, warehouseId: warehouse.id, currencyId: pen.id, code: `CMP-${businessYear}-000002`, receptionDate: relativeDate(-2), documentNumber: "G001-000776", status: "PENDING", exchangeRate: 1, ...purchaseTotals(pendingLines), lines: { create: pendingLines } } });
  const rejectedLines = purchaseLineData([{ itemId: materialByCode.get("DEMO-MP-ZINC")!.id, presentationType: "SACO", presentationQty: 10, contentPerUnit: 3, pricePerBaseUnit: 17.5 }]);
  const rejectedPurchase = await prisma.purchase.create({ data: { companyId: company.id, supplierId: supplierChemicals.id, warehouseId: warehouse.id, currencyId: pen.id, code: `CMP-${businessYear}-000003`, receptionDate: relativeDate(-7), documentNumber: "G002-000119", status: "REJECTED", exchangeRate: 1, ...purchaseTotals(rejectedLines), lines: { create: rejectedLines } } });
  await prisma.purchaseApproval.create({ data: { purchaseId: rejectedPurchase.id, userId: adminUser.id, status: "REJECTED", comment: "Lote de óxido de zinc sin certificado de calidad" } });

  const wasteOpeningLines = [
    { itemId: materialByCode.get("DEMO-MP-COL-TR")!.id, quantity: 18, unitCost: 0.8 },
    { itemId: materialByCode.get("DEMO-MP-COL-EXP")!.id, quantity: 9, unitCost: 0.7 },
    { itemId: materialByCode.get("DEMO-MP-COL-RB")!.id, quantity: 12, unitCost: 0.9 },
    { itemId: materialByCode.get("DEMO-MP-MOL-EXP")!.id, quantity: 22, unitCost: 1.1 },
    { itemId: materialByCode.get("DEMO-MP-MOL-TR")!.id, quantity: 15, unitCost: 1.2 },
  ];
  const wasteAdjustment = await prisma.inventoryAdjustment.create({ data: { companyId: company.id, warehouseId: warehouse.id, number: `AJ-${businessYear}-000001`, reason: "Pesaje inicial de mermas recuperables para demostración", status: "APPROVED", lines: { create: wasteOpeningLines } } });
  for (const line of wasteOpeningLines) await postIncoming({ companyId: company.id, userId: adminUser.id, warehouseId: warehouse.id, itemId: line.itemId, quantity: line.quantity, unitCost: line.unitCost, type: "ADJUSTMENT_IN", referenceType: "INVENTORY_ADJUSTMENT", referenceId: wasteAdjustment.id, occurredAt: relativeDate(-15) });

  const press = await prisma.machine.create({ data: { companyId: company.id, code: "MAQ-000001", name: "Prensa hidráulica 01", type: "PRESS", brand: "HidraMax", model: "HM-220", serialNumber: "PR-22001", location: "Planta 1", status: "ACTIVE", purchaseDate: relativeDate(-730), notes: "Equipo principal para suelas prensadas" } });
  const injector = await prisma.machine.create({ data: { companyId: company.id, code: "MAQ-000002", name: "Inyectora EVA 01", type: "INJECTOR", brand: "TecnoMold", model: "TM-500", serialNumber: "IN-50001", location: "Planta 1", status: "ACTIVE", purchaseDate: relativeDate(-510) } });
  const cutter = await prisma.machine.create({ data: { companyId: company.id, code: "MAQ-000003", name: "Mezclador Banbury 01", type: "OTHER", brand: "MixTech", model: "BM-80", serialNumber: "BM-8001", location: "Área de mezclado", status: "MAINTENANCE", purchaseDate: relativeDate(-340) } });
  await prisma.machineMaintenanceRecord.createMany({ data: [
    { machineId: press.id, type: "PREVENTIVE", performedAt: relativeDate(-95), nextDueAt: relativeDate(-5), provider: "Servicio Técnico Industrial", description: "Cambio de aceite y revisión de presión", cost: 850, downtimeHours: 5 },
    { machineId: injector.id, type: "PREVENTIVE", performedAt: relativeDate(-35), nextDueAt: relativeDate(55), provider: "TecnoMold Perú", description: "Limpieza de boquillas y calibración", cost: 620, downtimeHours: 3 },
    { machineId: cutter.id, type: "REPAIR", performedAt: relativeDate(-2), nextDueAt: relativeDate(88), provider: "MixTech Service", description: "Cambio de rodamientos y calibración de temperatura", cost: 1280, downtimeHours: 12, notes: "Equipo aún en validación" },
  ] });

  const urbanVersionId = urbanRecipe.versions[0].id;
  const urbanRedVersionId = urbanRedRecipe.versions[0].id;
  const industrialVersionId = industrialRecipe.versions[0].id;
  const productionLinkedOrder = await createDemoSalesOrder({ companyId: company.id, number: `PED-${businessYear}-000001`, customerId: customerStore.id, requestedAt: relativeDate(-2), promisedAt: relativeDate(3), notes: "Pedido bicolor vinculado a producción; prioridad 1", lines: [
    { productVariantId: urban38Bicolor.id, quantity: 10, unitPrice: 22.5 },
    { productVariantId: urban39Bicolor.id, quantity: 10, unitPrice: 22.5 },
    { productVariantId: urban40Bicolor.id, quantity: 10, unitPrice: 22.5 },
  ] });

  const completedProduction = await createDemoProduction({
    companyId: company.id, userId: operatorUser.id, number: `OP-${businessYear}-000001`, warehouseId: warehouse.id,
    recipeVersionId: urbanVersionId, materialItemId: materialByCode.get("DEMO-MP-TR")!.id, machineId: press.id, priority: 2,
    plannedAt: relativeDate(-12), operatorName: "Carlos Rojas", processType: "PRENSA", modelLogo: "Urbana Flex / LK", brandColor: "Negro",
    pressNumber: "PR-01", pressLoad: "52 kg",
    sizeProgram: [
      { productVariantId: urban38Black.id, requestedPairs: 12 },
      { productVariantId: urban39Black.id, requestedPairs: 12 },
      { productVariantId: urban40Black.id, requestedPairs: 12 },
    ],
    productionTurns: [
      { date: relativeDate(-12).toISOString().slice(0, 10), quantities: [{ productVariantId: urban38Black.id, quantity: 8 }, { productVariantId: urban39Black.id, quantity: 8 }, { productVariantId: urban40Black.id, quantity: 6 }], observations: "Arranque y calibración de prensa" },
      { date: relativeDate(-11).toISOString().slice(0, 10), quantities: [{ productVariantId: urban38Black.id, quantity: 4 }, { productVariantId: urban39Black.id, quantity: 4 }, { productVariantId: urban40Black.id, quantity: 6 }], observations: "Curva completada sin incidencias" },
    ],
    components: [
      { itemId: materialByCode.get("DEMO-MP-VIRA")!.id, componentType: "CERCO_VIRA", quantity: 30, colorDetail: "Negro" },
      { itemId: materialByCode.get("DEMO-MP-INS-TAL")!.id, componentType: "INSERTO_TALON", quantity: 36, colorDetail: "Negro" },
    ],
  });
  await releaseDemoProduction(company.id, completedProduction.id);
  await startDemoProduction(company.id, completedProduction.id, operatorUser.id, relativeDate(-12, 8));
  await completeDemoProduction(company.id, completedProduction.id, operatorUser.id, [
    { productVariantId: urban38Black.id, quantity: 12 },
    { productVariantId: urban39Black.id, quantity: 12 },
    { productVariantId: urban40Black.id, quantity: 12 },
  ]);

  const activeProduction = await createDemoProduction({
    companyId: company.id, userId: operatorUser.id, number: `OP-${businessYear}-000002`, warehouseId: warehouse.id,
    recipeVersionId: urbanVersionId, secondaryRecipeVersionId: urbanRedVersionId, salesOrderId: productionLinkedOrder.id,
    materialItemId: materialByCode.get("DEMO-MP-TR")!.id, machineId: press.id, priority: 1,
    plannedAt: relativeDate(0), operatorName: "Carlos Rojas", processType: "PRENSA", modelLogo: "Urbana Flex Bicolor / Paso Firme", brandColor: "Negro",
    pressNumber: "PR-01", pressLoad: "46 kg C1 + 14 kg C2",
    sizeProgram: [
      { productVariantId: urban38Bicolor.id, requestedPairs: 10 },
      { productVariantId: urban39Bicolor.id, requestedPairs: 10 },
      { productVariantId: urban40Bicolor.id, requestedPairs: 10 },
    ],
    productionTurns: [{ date: relativeDate(0).toISOString().slice(0, 10), quantities: [{ productVariantId: urban38Bicolor.id, quantity: 4 }, { productVariantId: urban39Bicolor.id, quantity: 4 }, { productVariantId: urban40Bicolor.id, quantity: 2 }], observations: "Primer turno registrado; orden continúa en proceso" }],
    components: [
      { itemId: materialByCode.get("DEMO-MP-VIRA")!.id, componentType: "CERCO_VIRA", quantity: 25, colorDetail: "Negro" },
      { itemId: materialByCode.get("DEMO-MP-INS-TAL")!.id, componentType: "INSERTO_TALON", quantity: 30, colorDetail: "Rojo" },
    ],
  });
  await releaseDemoProduction(company.id, activeProduction.id);
  await startDemoProduction(company.id, activeProduction.id, operatorUser.id);

  const reservedProduction = await createDemoProduction({
    companyId: company.id, userId: operatorUser.id, number: `OP-${businessYear}-000003`, warehouseId: warehouse.id,
    recipeVersionId: industrialVersionId, materialItemId: materialByCode.get("DEMO-MP-EVA")!.id, machineId: injector.id, priority: 2,
    plannedAt: relativeDate(1), operatorName: "María Salas", processType: "INYECTORA", modelLogo: "Industrial Grip", brandColor: "Negro",
    injectorNumber: "IN-01", curve: "170 °C / 55 s",
    sizeProgram: [{ productVariantId: industrial41Black.id, requestedPairs: 6 }, { productVariantId: industrial42Black.id, requestedPairs: 6 }],
  });
  await releaseDemoProduction(company.id, reservedProduction.id);
  await createDemoProduction({
    companyId: company.id, userId: operatorUser.id, number: `OP-${businessYear}-000004`, warehouseId: warehouse.id,
    recipeVersionId: urbanVersionId, materialItemId: materialByCode.get("DEMO-MP-PVC")!.id, machineId: press.id, priority: 3,
    plannedAt: relativeDate(4), operatorName: "María Salas", processType: "PRENSA", modelLogo: "Urbana Flex", brandColor: "Negro",
    pressNumber: "PR-01", sizeProgram: [{ productVariantId: urban40Black.id, requestedPairs: 12 }],
  });

  const draftOrder = await createDemoSalesOrder({ companyId: company.id, number: `PED-${businessYear}-000002`, customerId: customerRetail.id, requestedAt: relativeDate(-1), promisedAt: relativeDate(5), notes: "Pedido de muestra pendiente de confirmación", lines: [{ productVariantId: industrial41Black.id, quantity: 4, unitPrice: 25.9 }] });
  void draftOrder;
  const pickingOrder = await createDemoSalesOrder({ companyId: company.id, number: `PED-${businessYear}-000003`, customerId: customerStore.id, requestedAt: relativeDate(-4), promisedAt: relativeDate(1), notes: "Entrega prioritaria a planta de calzado", lines: [{ productVariantId: urban38Black.id, quantity: 4, unitPrice: 18.5 }, { productVariantId: urban39Black.id, quantity: 3, unitPrice: 18.5 }] });
  await confirmDemoSalesOrder(company.id, pickingOrder.id, warehouse.id);
  const readyOrder = await createDemoSalesOrder({ companyId: company.id, number: `PED-${businessYear}-000004`, customerId: customerCorporate.id, requestedAt: relativeDate(-6), promisedAt: relativeDate(0), notes: "Recojo coordinado con cliente", lines: [{ productVariantId: urban39Black.id, quantity: 4, unitPrice: 18 }, { productVariantId: urban40Black.id, quantity: 5, unitPrice: 18 }] });
  await confirmDemoSalesOrder(company.id, readyOrder.id, warehouse.id);
  const packingOrder = await createDemoSalesOrder({ companyId: company.id, number: `PED-${businessYear}-000005`, customerId: customerRetail.id, requestedAt: relativeDate(-5), promisedAt: relativeDate(2), notes: "Pedido en etapa de empaque", lines: [{ productVariantId: urban38Black.id, quantity: 2, unitPrice: 18.7 }, { productVariantId: urban40Black.id, quantity: 2, unitPrice: 18.7 }] });
  await confirmDemoSalesOrder(company.id, packingOrder.id, warehouse.id);
  const dispatchedOrder = await createDemoSalesOrder({ companyId: company.id, number: `PED-${businessYear}-000006`, customerId: customerRetail.id, requestedAt: relativeDate(-10), promisedAt: relativeDate(-3), notes: "Pedido de suelas despachado para historial", lines: [{ productVariantId: urban38Black.id, quantity: 3, unitPrice: 18.8 }, { productVariantId: urban40Black.id, quantity: 2, unitPrice: 18.8 }] });
  await confirmDemoSalesOrder(company.id, dispatchedOrder.id, warehouse.id);

  async function createPickPack(orderId: string, number: string, status: "PICKING" | "PACKING" | "READY", progressRatio: number) {
    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
    const pickPack = await prisma.pickPackOrder.create({ data: { companyId: company.id, salesOrderId: order.id, warehouseId: warehouse.id, number, priority: number.endsWith("000001") ? "URGENT" : "NORMAL", status, startedAt: relativeDate(-1), packingStartedAt: status === "PACKING" || status === "READY" ? relativeDate(0, 8) : null, readyAt: status === "READY" ? relativeDate(0, 9) : null, carrier: "Transporte Demo Express", shippingDocument: status === "READY" ? `GR-${number.slice(-6)}` : null, notes: "Escenario temporal para presentación", lines: { create: order.lines.map((line) => { const requested = Number(line.quantity); return { salesOrderLineId: line.id, warehouseLocation: "A-01-03", requestedQuantity: line.quantity, pickedQuantity: status === "PICKING" ? Math.max(1, Math.floor(requested * progressRatio)) : requested, packedQuantity: status === "PACKING" ? Math.max(1, Math.floor(requested * progressRatio)) : status === "READY" ? requested : 0 }; }) }, packages: status === "PACKING" || status === "READY" ? { create: [{ packageNumber: 1, packageType: "Caja master", weight: 8.5, length: 60, width: 40, height: 35, notes: status === "READY" ? "Contenido verificado" : "Empaque parcial" }] } : undefined } });
    if (status === "READY") await prisma.salesOrder.update({ where: { id: order.id }, data: { status: "READY" } });
    return pickPack;
  }

  await createPickPack(pickingOrder.id, `PP-${businessYear}-000001`, "PICKING", 0.6);
  await createPickPack(packingOrder.id, `PP-${businessYear}-000002`, "PACKING", 0.5);
  await createPickPack(readyOrder.id, `PP-${businessYear}-000003`, "READY", 1);
  await createPickPack(dispatchedOrder.id, `PP-${businessYear}-000004`, "READY", 1);
  await dispatchDemoSalesOrder(company.id, dispatchedOrder.id, adminUser.id);

  await prisma.importJob.create({ data: { companyId: company.id, createdById: adminUser.id, module: "INVENTORY", fileName: "plantilla_almacen_demo.xlsx", status: "COMPLETED", totalRows: 22, successRows: 22, errorRows: 0, finishedAt: relativeDate(-16) } });
  await prisma.importJob.create({ data: { companyId: company.id, createdById: adminUser.id, module: "PURCHASES", fileName: "compras_revision_demo.xlsx", status: "FAILED", totalRows: 4, successRows: 3, errorRows: 1, finishedAt: relativeDate(-2), errors: { create: [{ rowNumber: 5, field: "Documento / guía", code: "DUPLICATE_DOCUMENT", message: "La compra ya existe y fue omitida; los demás registros nuevos sí se procesaron.", rawData: { documento: "F001-001842" } }] } } });

  await prisma.calendarEvent.createMany({ data: [
    { companyId: company.id, createdById: demoUser.id, title: "[DEMO] Reunión de planificación semanal", type: "MEETING", priority: "NORMAL", status: "PENDING", startAt: relativeDate(1, 9), endAt: relativeDate(1, 10), description: "Revisión de producción, pedidos y abastecimiento", reminderMinutes: 30 },
    { companyId: company.id, createdById: operatorUser.id, title: "[DEMO] Inventario cíclico de materias primas", type: "INVENTORY", priority: "HIGH", status: "PENDING", startAt: relativeDate(2, 8), endAt: relativeDate(2, 12), description: "Pesaje de caucho, PVC, TR, EVA, PU y aditivos", reminderMinutes: 60 },
    { companyId: company.id, createdById: adminUser.id, title: `[DEMO] Coordinar entrega PED-${businessYear}-000004`, type: "TASK", priority: "URGENT", status: "PENDING", startAt: relativeDate(0, 15), description: "Confirmar transporte y documento de salida", reminderMinutes: 30 },
    { companyId: company.id, createdById: operatorUser.id, title: `[DEMO] Cierre de orden OP-${businessYear}-000002`, type: "TASK", priority: "HIGH", status: "PENDING", startAt: relativeDate(1, 16), description: "Completar los turnos y registrar la salida por talla", reminderMinutes: 45 },
    { companyId: company.id, createdById: demoUser.id, title: "[DEMO] Capacitación de seguridad", type: "OTHER", priority: "LOW", status: "COMPLETED", startAt: relativeDate(-3, 11), endAt: relativeDate(-3, 12), description: "Actividad completada para mostrar el historial" },
  ] });
  await prisma.notification.createMany({ data: [
    { companyId: company.id, userId: demoUser.id, type: "DEMO_STOCK", title: "Stock bajo de óxido de zinc", message: "El stock disponible está por debajo del mínimo configurado.", data: { itemCode: "MP-000010" } },
    { companyId: company.id, userId: demoUser.id, type: "DEMO_MAINTENANCE", title: "Mantenimiento vencido", message: "La prensa hidráulica 01 requiere programación de mantenimiento.", data: { machineCode: "MAQ-000001" } },
    { companyId: company.id, userId: demoUser.id, type: "DEMO_ORDER", title: "Pedido próximo a entrega", message: `El pedido PED-${businessYear}-000004 debe entregarse hoy.`, data: { orderNumber: `PED-${businessYear}-000004` } },
  ] });

  await prisma.correlativeCounter.createMany({ data: [
    { companyId: company.id, scope: "SUPPLIER", year: 0, value: 3 },
    { companyId: company.id, scope: "CUSTOMER", year: 0, value: 3 },
    { companyId: company.id, scope: "INVENTORY_RAW", year: 0, value: 17 },
    { companyId: company.id, scope: "INVENTORY_WASTE", year: 0, value: 5 },
    { companyId: company.id, scope: "RECIPE", year: 0, value: 3 },
    { companyId: company.id, scope: "MACHINE", year: 0, value: 3 },
    { companyId: company.id, scope: "PRODUCT", year: businessYear, value: 2 },
    { companyId: company.id, scope: "PURCHASE", year: businessYear, value: 3 },
    { companyId: company.id, scope: "PRODUCTION", year: businessYear, value: 4 },
    { companyId: company.id, scope: "SALES_ORDER", year: businessYear, value: 6 },
    { companyId: company.id, scope: "PICK_PACK", year: businessYear, value: 4 },
  ], skipDuplicates: true });

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
