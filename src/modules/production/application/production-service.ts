import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@prisma/client";
import { calculateMovingAverage } from "@/modules/inventory/domain/calculate-moving-average";
import { validateProductionSheetTotals } from "@/modules/production/domain/production-sheet";
import { nextBusinessCode } from "@/lib/database/business-code";
import { productVariantColorLabel } from "@/modules/products/domain/product-sku";

export class ProductionError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = "ProductionError"; } }
async function sequence(tx: Prisma.TransactionClient, companyId: string) { const value = await tx.correlativeCounter.upsert({ where: { companyId_scope_year: { companyId, scope: "INVENTORY_POSTING", year: 0 } }, update: { value: { increment: 1 } }, create: { companyId, scope: "INVENTORY_POSTING", year: 0, value: 1 }, select: { value: true } }); return BigInt(value.value); }
async function lock(tx: Prisma.TransactionClient, warehouseId: string, itemId: string, lotId: string | null) { const key = `${warehouseId}:${itemId}:${lotId ?? "GLOBAL"}`; await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`; }
async function event(tx: Prisma.TransactionClient, companyId: string, userId: string, orderId: string, action: string, status: string) { await tx.auditLog.create({ data: { companyId, userId, entity: "ProductionOrder", entityId: orderId, action, afterData: { status } } }); await tx.outboxEvent.create({ data: { companyId, topic: `private-company-${companyId}`, eventName: `production.${action.toLowerCase()}.v1`, aggregateId: orderId, payload: { productionOrderId: orderId, status } } }); }

type ProductionProgramEntry = { productVariantId: string; sku?: string; size: string; color?: string; requestedPairs: number; producedPairs?: number };
type ProductionDailyEntry = { date: string; productVariantId?: string; sku?: string; size: string; color?: string; quantity: number; observations?: string };
type ProductionTurn = { date: string; quantities: { productVariantId: string; sku?: string; size: string; quantity: number }[]; observations?: string };
type ProductionComponentInput = { itemId: string; componentType: "CERCO_VIRA" | "INSERTO_PUNTA" | "INSERTO_TALON" | "OTRO"; quantity: Decimal.Value; colorDetail?: string };
type ProductionOutput = { productVariantId: string; quantity: Decimal.Value };
type ProductionWaste = { productionMaterialId: string; quantity: Decimal.Value };

export async function createProductionOrder(database: PrismaClient, command: {
  companyId: string; userId: string; number?: string; warehouseId: string; productVariantId?: string;
  recipeVersionId: string; secondaryRecipeVersionId?: string; salesOrderIds?: string[]; materialItemId?: string;
  machineId?: string; recipeRuns?: Decimal.Value; priority?: number; plannedAt?: Date; operatorName?: string;
  sizeProgram?: ProductionProgramEntry[]; productionTurns?: ProductionTurn[]; components?: ProductionComponentInput[];
  machineEquipment?: string; modelLogo?: string; materialLoad?: string; seriesLot?: string;
  processType?: "PRENSA" | "INYECTORA" | "AMBOS" | "NINGUNO"; mold?: string; brandColor?: string;
  pressNumber?: string; pressLoad?: string; injectorNumber?: string; curve?: string; dailyProduction?: ProductionDailyEntry[];
}) {
  return database.$transaction(async (tx) => {
    const componentIds = Array.from(new Set((command.components ?? []).map((item) => item.itemId)));
    const salesOrderIds = Array.from(new Set(command.salesOrderIds ?? []));
    const [warehouse, version, secondaryVersion, machine, salesOrders, materialItem, componentItems] = await Promise.all([
      tx.warehouse.findFirst({ where: { id: command.warehouseId, companyId: command.companyId, active: true } }),
      tx.recipeVersion.findFirst({ where: { id: command.recipeVersionId, isActive: true, recipe: { companyId: command.companyId, status: "ACTIVE" } }, include: { recipe: true, ingredients: true } }),
      command.secondaryRecipeVersionId ? tx.recipeVersion.findFirst({ where: { id: command.secondaryRecipeVersionId, isActive: true, recipe: { companyId: command.companyId, status: "ACTIVE" } }, include: { recipe: true, ingredients: true } }) : null,
      command.machineId ? tx.machine.findFirst({ where: { id: command.machineId, companyId: command.companyId, status: { not: "OUT_OF_SERVICE" } } }) : null,
      salesOrderIds.length ? tx.salesOrder.findMany({ where: { id: { in: salesOrderIds }, companyId: command.companyId, status: { not: "CANCELLED" } }, include: { lines: { where: { productionOrderId: null } } } }) : [],
      command.materialItemId ? tx.inventoryItem.findFirst({ where: { id: command.materialItemId, companyId: command.companyId, active: true } }) : null,
      tx.inventoryItem.findMany({ where: { id: { in: componentIds }, companyId: command.companyId, active: true } }),
    ]);
    if (!warehouse || !version || (command.secondaryRecipeVersionId && !secondaryVersion) || (command.machineId && !machine) || salesOrders.length !== salesOrderIds.length || (command.materialItemId && !materialItem) || componentItems.length !== componentIds.length) throw new ProductionError("PRODUCTION_INVALID_REFERENCE", "El almacén, formulación, pedido, material, componente o máquina no es válido para esta orden.");
    if (secondaryVersion && secondaryVersion.recipe.productId !== version.recipe.productId) throw new ProductionError("PRODUCTION_INVALID_RECIPE_PAIR", "Las formulaciones C1 y C2 deben pertenecer al mismo producto.");
    const variantIds = Array.from(new Set([command.productVariantId, ...(command.sizeProgram ?? []).map((item) => item.productVariantId), ...(command.productionTurns ?? []).flatMap((turn) => turn.quantities.map((item) => item.productVariantId)), ...(command.dailyProduction ?? []).map((item) => item.productVariantId)].filter((value): value is string => Boolean(value))));
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds }, active: true, product: { companyId: command.companyId } },
      include: { product: true, size: true, color: true, secondaryColor: true },
    });
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    if (variantIds.length === 0 || variants.length !== variantIds.length || variants.some((variant) => variant.productId !== version.recipe.productId)) throw new ProductionError("PRODUCTION_INVALID_REFERENCE", "Todas las tallas y colores deben ser variantes activas del producto de la receta.");
    let normalizedProgram = (command.sizeProgram ?? []).map((item) => {
      const variant = variantById.get(item.productVariantId)!;
      return { ...item, sku: variant.sku, size: variant.size.name, color: productVariantColorLabel(variant.color.name, variant.secondaryColor?.name) };
    });
    const normalizedDaily = (command.dailyProduction ?? []).map((entry) => {
      if (!entry.productVariantId) return entry;
      const variant = variantById.get(entry.productVariantId)!;
      return { ...entry, sku: variant.sku, size: variant.size.name, color: productVariantColorLabel(variant.color.name, variant.secondaryColor?.name) };
    });
    const normalizedTurns = (command.productionTurns ?? []).map((turn) => ({ ...turn, quantities: turn.quantities.map((entry) => { const variant = variantById.get(entry.productVariantId)!; return { ...entry, sku: variant.sku, size: variant.size.name }; }) }));
    const primaryVariantId = normalizedProgram.find((item) => item.productVariantId)?.productVariantId ?? command.productVariantId;
    const variant = primaryVariantId ? variantById.get(primaryVariantId) : undefined;
    if (!variant) throw new ProductionError("PRODUCTION_INVALID_REFERENCE", "Agrega al menos una combinación de talla y color.");
    if (normalizedProgram.length === 0 && command.recipeRuns !== undefined) {
      const legacyPlanned = new Decimal(version.yieldQuantity.toString()).mul(command.recipeRuns).toDecimalPlaces(6);
      normalizedProgram = [{ productVariantId: variant.id, sku: variant.sku, size: variant.size.name, color: productVariantColorLabel(variant.color.name, variant.secondaryColor?.name), requestedPairs: legacyPlanned.toNumber() }];
    }
    if (variants.some((item) => item.colorId !== variant.colorId || (item.secondaryColorId ?? null) !== (variant.secondaryColorId ?? null))) throw new ProductionError("PRODUCTION_INVALID_COLOR_PAIR", "Todas las tallas de la orden deben usar la misma combinación C1/C2.");
    if (Boolean(variant.secondaryColorId) !== Boolean(secondaryVersion)) throw new ProductionError("PRODUCTION_INVALID_RECIPE_PAIR", variant.secondaryColorId ? "Una suela bicolor requiere la formulación C2." : "Una suela monocolor no debe incluir formulación C2.");
    if (salesOrders.length) {
      const orderedQuantities = new Map<string, Decimal>();
      const programmedIds = new Set(normalizedProgram.map((item) => item.productVariantId));
      for (const salesOrder of salesOrders) {
        if (!salesOrder.lines.some((line) => programmedIds.has(line.productVariantId))) throw new ProductionError("PRODUCTION_INVALID_SALES_ORDER", `El pedido ${salesOrder.number} no contiene tallas disponibles para esta orden.`);
        for (const line of salesOrder.lines) orderedQuantities.set(line.productVariantId, (orderedQuantities.get(line.productVariantId) ?? new Decimal(0)).add(line.quantity.toString()));
      }
      if (normalizedProgram.some((item) => !orderedQuantities.has(item.productVariantId))) throw new ProductionError("PRODUCTION_INVALID_SALES_ORDER", "Los pedidos seleccionados no contienen todas las tallas programadas.");
      if (normalizedProgram.some((item) => new Decimal(item.requestedPairs).greaterThan(orderedQuantities.get(item.productVariantId)!.toString()))) throw new ProductionError("PRODUCTION_EXCEEDS_SALES_ORDER", "La programación no puede superar la suma de pares disponibles en los pedidos seleccionados.");
    }
    const plannedQuantity = normalizedProgram.reduce((total, item) => total.add(item.requestedPairs), new Decimal(0)).toDecimalPlaces(6);
    if (!plannedQuantity.greaterThan(0)) throw new ProductionError("PRODUCTION_INVALID_QUANTITY", "La cantidad planificada debe ser mayor que cero.");
    const primaryYield = new Decimal(version.yieldQuantity.toString());
    const secondaryYield = secondaryVersion ? new Decimal(secondaryVersion.yieldQuantity.toString()) : null;
    if (!primaryYield.greaterThan(0) || (secondaryYield && !secondaryYield.greaterThan(0))) throw new ProductionError("PRODUCTION_INVALID_RECIPE_YIELD", "El rendimiento de cada formulación debe ser mayor que cero.");
    const runs = plannedQuantity.div(primaryYield).toDecimalPlaces(6);
    const secondaryRuns = secondaryYield ? plannedQuantity.div(secondaryYield).toDecimalPlaces(6) : null;
    const sheetIssue = validateProductionSheetTotals({ sizeProgram: normalizedProgram, productionTurns: normalizedTurns.map((turn) => ({ ...turn, date: new Date(turn.date) })), components: (command.components ?? []).map((item) => ({ ...item, quantity: Number(item.quantity), colorDetail: item.colorDetail ?? "" })) }, plannedQuantity);
    if (sheetIssue) throw new ProductionError("PRODUCTION_SHEET_INVALID", sheetIssue);
    const number = command.number ?? await nextBusinessCode(tx, command.companyId, "PRODUCTION", command.plannedAt);
    const plannedMaterials = new Map<string, Decimal>();
    const addMaterial = (itemId: string, quantity: Decimal) => plannedMaterials.set(itemId, (plannedMaterials.get(itemId) ?? new Decimal(0)).add(quantity).toDecimalPlaces(6));
    for (const ingredient of version.ingredients) addMaterial(ingredient.itemId, new Decimal(ingredient.quantity.toString()).mul(runs));
    if (secondaryVersion && secondaryRuns) for (const ingredient of secondaryVersion.ingredients) addMaterial(ingredient.itemId, new Decimal(ingredient.quantity.toString()).mul(secondaryRuns));
    for (const component of command.components ?? []) addMaterial(component.itemId, new Decimal(component.quantity));
    const processType = command.processType ?? (machine?.type === "PRESS" ? "PRENSA" : machine?.type === "INJECTOR" ? "INYECTORA" : "NINGUNO");
    const order = await tx.productionOrder.create({ data: {
      companyId: command.companyId, warehouseId: command.warehouseId, productVariantId: variant.id,
      recipeVersionId: command.recipeVersionId, secondaryRecipeVersionId: command.secondaryRecipeVersionId || null,
      materialItemId: command.materialItemId || null, machineId: command.machineId || null,
      number, recipeRuns: runs, secondaryRecipeRuns: secondaryRuns, plannedQuantity, priority: command.priority ?? 2, plannedAt: command.plannedAt,
      machineEquipment: machine ? `${machine.code} · ${machine.name}` : command.machineEquipment || null,
      operatorName: command.operatorName || null, modelLogo: command.modelLogo || null,
      materialLoad: materialItem ? `${materialItem.code} · ${materialItem.name}` : command.materialLoad || null,
      seriesLot: normalizedProgram.map((item) => item.size).join(", "), processType, mold: variant.product.matrixCode,
      brandColor: command.brandColor || null, pressNumber: command.pressNumber || null, pressLoad: command.pressLoad || null,
      injectorNumber: command.injectorNumber || null, curve: command.curve || null,
      sizeProgram: normalizedProgram as Prisma.InputJsonValue, dailyProduction: normalizedDaily as Prisma.InputJsonValue,
      productionTurns: normalizedTurns as Prisma.InputJsonValue,
      salesOrders: salesOrderIds.length ? { create: salesOrderIds.map((salesOrderId) => ({ salesOrderId })) } : undefined,
      materials: { create: Array.from(plannedMaterials, ([itemId, plannedQuantity]) => ({ itemId, plannedQuantity })) },
      components: { create: (command.components ?? []).map((component) => ({ itemId: component.itemId, componentType: component.componentType, quantity: new Decimal(component.quantity), colorDetail: component.colorDetail || null })) },
    } });
    if (salesOrderIds.length) await tx.salesOrderLine.updateMany({ where: { salesOrderId: { in: salesOrderIds }, productVariantId: { in: normalizedProgram.map((item) => item.productVariantId) }, productionOrderId: null }, data: { productionOrderId: order.id } });
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
    await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${command.orderId}::uuid FOR UPDATE`; const order = await tx.productionOrder.findFirst({ where: { id: command.orderId, companyId: command.companyId }, include: { materials: true, salesOrders: { select: { salesOrderId: true } } } });
    if (!order) throw new ProductionError("PRODUCTION_NOT_FOUND", "La orden no existe."); if (order.status !== "RELEASED") throw new ProductionError("PRODUCTION_INVALID_STATE", "Solo puede iniciarse una orden liberada.");
    for (const material of order.materials) await consumeMaterial(tx, command.companyId, command.userId, order, material);
    await tx.stockReservation.updateMany({ where: { referenceType: "PRODUCTION_ORDER", referenceId: order.id, active: true }, data: { active: false } });
    const result = await tx.productionOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
    if (order.salesOrders.length) await tx.salesOrder.updateMany({ where: { id: { in: order.salesOrders.map((link) => link.salesOrderId) } }, data: { status: "IN_PRODUCTION" } });
    await event(tx, command.companyId, command.userId, order.id, "START", "IN_PROGRESS"); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function completeProductionOrder(database: PrismaClient, command: { companyId: string; userId: string; orderId: string; producedQuantity?: Decimal.Value; outputs?: ProductionOutput[]; waste?: ProductionWaste[] }) {
  const rawOutputs = command.outputs?.map((output) => ({ productVariantId: output.productVariantId, quantity: new Decimal(output.quantity) })) ?? [];
  if (rawOutputs.some((output) => output.quantity.lessThan(0))) throw new ProductionError("PRODUCTION_INVALID_QUANTITY", "Las cantidades producidas no pueden ser negativas.");
  if (new Set(rawOutputs.map((output) => output.productVariantId)).size !== rawOutputs.length) throw new ProductionError("PRODUCTION_DUPLICATE_VARIANT", "Cada combinación de talla y color debe aparecer una sola vez.");
  const requestedOutputs = rawOutputs.filter((output) => output.quantity.greaterThan(0));
  if (rawOutputs.length > 0 && requestedOutputs.length === 0) throw new ProductionError("PRODUCTION_INVALID_QUANTITY", "Registra una cantidad producida mayor que cero en al menos una talla y color.");
  const rawWaste = command.waste?.map((entry) => ({ productionMaterialId: entry.productionMaterialId, quantity: new Decimal(entry.quantity) })) ?? [];
  if (rawWaste.some((entry) => entry.quantity.isNegative())) throw new ProductionError("PRODUCTION_INVALID_WASTE", "La merma real no puede ser negativa.");
  if (new Set(rawWaste.map((entry) => entry.productionMaterialId)).size !== rawWaste.length) throw new ProductionError("PRODUCTION_INVALID_WASTE", "Cada material debe aparecer una sola vez en la merma real.");
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM production_orders WHERE id = ${command.orderId}::uuid FOR UPDATE`; const order = await tx.productionOrder.findFirst({ where: { id: command.orderId, companyId: command.companyId }, include: { productVariant: true, materials: true, salesOrders: { select: { salesOrderId: true } } } });
    if (!order) throw new ProductionError("PRODUCTION_NOT_FOUND", "La orden no existe."); if (order.status !== "IN_PROGRESS") throw new ProductionError("PRODUCTION_INVALID_STATE", "Solo puede completarse una orden en proceso.");
    const programmed = Array.isArray(order.sizeProgram) ? order.sizeProgram.filter((item): item is ProductionProgramEntry => Boolean(item && typeof item === "object" && "size" in item && "requestedPairs" in item)) : [];
    const scheduledByVariant = new Map(programmed.filter((item) => item.productVariantId).map((item) => [item.productVariantId!, new Decimal(item.requestedPairs)]));
    const outputs = requestedOutputs.length > 0
      ? requestedOutputs
      : [{ productVariantId: order.productVariantId, quantity: new Decimal(command.producedQuantity ?? 0) }];
    if (outputs.some((output) => !output.quantity.greaterThan(0))) throw new ProductionError("PRODUCTION_INVALID_QUANTITY", "La cantidad producida debe ser mayor que cero.");
    if (scheduledByVariant.size > 0) {
      for (const output of outputs) {
        const limit = scheduledByVariant.get(output.productVariantId);
        if (!limit) throw new ProductionError("PRODUCTION_INVALID_VARIANT", "La talla y color producidos no forman parte de la programación.");
        if (output.quantity.greaterThan(limit)) throw new ProductionError("PRODUCTION_INVALID_QUANTITY", "La cantidad producida no puede superar la curva programada para esa talla y color.");
      }
    } else if (outputs.some((output) => output.productVariantId !== order.productVariantId)) {
      throw new ProductionError("PRODUCTION_INVALID_VARIANT", "Esta orden antigua solo puede ingresar stock a su variante principal.");
    }
    const produced = outputs.reduce((total, output) => total.add(output.quantity), new Decimal(0));
    if (produced.greaterThan(order.plannedQuantity.toString())) throw new ProductionError("PRODUCTION_INVALID_QUANTITY", "La producción total no puede superar la cantidad planificada.");
    const variants = await tx.productVariant.findMany({ where: { id: { in: outputs.map((output) => output.productVariantId) }, active: true, productId: order.productVariant.productId, product: { companyId: command.companyId } } });
    if (variants.length !== outputs.length) throw new ProductionError("PRODUCTION_INVALID_VARIANT", "Una de las tallas o colores ya no es una variante activa del producto.");
    const materialById = new Map(order.materials.map((material) => [material.id, material]));
    for (const waste of rawWaste) {
      const material = materialById.get(waste.productionMaterialId);
      if (!material) throw new ProductionError("PRODUCTION_INVALID_WASTE", "Uno de los materiales informados no pertenece a esta orden.");
      if (waste.quantity.greaterThan(material.consumedQuantity.toString())) throw new ProductionError("PRODUCTION_INVALID_WASTE", "La merma real no puede superar la cantidad consumida del material.");
    }
    for (const material of order.materials) {
      const quantity = rawWaste.find((entry) => entry.productionMaterialId === material.id)?.quantity ?? new Decimal(0);
      await tx.productionMaterial.update({ where: { id: material.id }, data: { actualWasteQuantity: quantity } });
    }
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const consumed = await tx.stockMovement.aggregate({ where: { referenceType: "PRODUCTION_ORDER", referenceId: order.id, type: "PRODUCTION_CONSUMPTION" }, _sum: { movementValue: true } }); const totalCost = new Decimal(consumed._sum.movementValue?.toString() ?? 0).abs(); const unitCost = totalCost.div(produced).toDecimalPlaces(6);
    let postedValue = new Decimal(0);
    for (const [index, output] of outputs.entries()) {
      const variant = variantById.get(output.productVariantId)!;
      await lock(tx, order.warehouseId, variant.inventoryItemId, null);
      const current = await tx.stockBalance.findFirst({ where: { warehouseId: order.warehouseId, itemId: variant.inventoryItemId, lotId: null } });
      const next = calculateMovingAverage({ currentQuantity: current?.onHandQuantity.toString() ?? 0, currentValue: current?.inventoryValue.toString() ?? 0, incomingQuantity: output.quantity, incomingUnitCost: unitCost });
      const balanceData = { onHandQuantity: next.onHandQuantity, inventoryValue: next.inventoryValue, averageUnitCost: next.averageUnitCost };
      if (current) await tx.stockBalance.update({ where: { id: current.id }, data: balanceData }); else await tx.stockBalance.create({ data: { warehouseId: order.warehouseId, itemId: variant.inventoryItemId, lotId: null, ...balanceData } });
      const movementValue = index === outputs.length - 1 ? totalCost.sub(postedValue).toDecimalPlaces(4) : output.quantity.mul(unitCost).toDecimalPlaces(4);
      postedValue = postedValue.add(movementValue);
      await tx.stockMovement.create({ data: { itemId: variant.inventoryItemId, warehouseId: order.warehouseId, type: "PRODUCTION_OUTPUT", quantity: output.quantity, unitCost, movementValue, balanceAfter: next.onHandQuantity, valueAfter: next.inventoryValue, averageCostAfter: next.averageUnitCost, referenceType: "PRODUCTION_ORDER", referenceId: order.id, postingSequence: await sequence(tx, command.companyId), createdById: command.userId } });
    }
    const producedByVariant = new Map(outputs.map((output) => [output.productVariantId, output.quantity.toNumber()]));
    const completedProgram = programmed.map((item) => ({ ...item, producedPairs: item.productVariantId ? producedByVariant.get(item.productVariantId) ?? 0 : item.producedPairs }));
    const result = await tx.productionOrder.update({ where: { id: order.id }, data: { status: "COMPLETED", producedQuantity: produced, sizeProgram: completedProgram as Prisma.InputJsonValue, completedAt: new Date() } });
    for (const link of order.salesOrders) {
      const remaining = await tx.salesOrderLine.count({ where: { salesOrderId: link.salesOrderId, OR: [{ productionOrderId: null }, { productionOrder: { status: { not: "COMPLETED" } } }] } });
      if (remaining === 0) await tx.salesOrder.update({ where: { id: link.salesOrderId }, data: { status: "READY" } });
    }
    await event(tx, command.companyId, command.userId, order.id, "COMPLETE", "COMPLETED"); return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
