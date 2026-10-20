import { Prisma, type PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";
import { nextBusinessCode } from "@/lib/database/business-code";
import { calculateMovingAverage } from "@/modules/inventory/domain/calculate-moving-average";
import { createsInventoryFormulaCycle } from "@/modules/inventory/domain/inventory-formula-cycle";

export class InventoryTransformationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "InventoryTransformationError"; }
}

async function sequence(tx: Prisma.TransactionClient, companyId: string) {
  const value = await tx.correlativeCounter.upsert({ where: { companyId_scope_year: { companyId, scope: "INVENTORY_POSTING", year: 0 } }, update: { value: { increment: 1 } }, create: { companyId, scope: "INVENTORY_POSTING", year: 0, value: 1 }, select: { value: true } });
  return BigInt(value.value);
}

async function lock(tx: Prisma.TransactionClient, warehouseId: string, itemId: string, lotId: string | null = null) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${warehouseId}:${itemId}:${lotId ?? "GLOBAL"}`}, 0))`;
}

async function log(tx: Prisma.TransactionClient, companyId: string, userId: string, id: string, action: string, data: Record<string, unknown>) {
  await tx.auditLog.create({ data: { companyId, userId, module: "inventory", entity: "InventoryTransformation", entityId: id, action, afterData: data as Prisma.InputJsonValue } });
  await tx.outboxEvent.create({ data: { companyId, topic: `private-company-${companyId}`, eventName: `inventory.transformation-${action.toLowerCase()}.v1`, aggregateId: id, payload: data as Prisma.InputJsonValue } });
}

export async function createInventoryFormula(database: PrismaClient, command: { companyId: string; userId: string; code?: string; name: string; outputItemId: string; yieldQuantity: Decimal.Value; notes?: string; ingredients: { itemId: string; quantity: Decimal.Value }[] }) {
  const yieldQuantity = new Decimal(command.yieldQuantity);
  if (!yieldQuantity.greaterThan(0)) throw new InventoryTransformationError("INVALID_YIELD", "El rendimiento debe ser mayor que cero.");
  if (!command.ingredients.length) throw new InventoryTransformationError("EMPTY_FORMULA", "Agrega al menos un componente.");
  if (new Set(command.ingredients.map((item) => item.itemId)).size !== command.ingredients.length) throw new InventoryTransformationError("DUPLICATE_INGREDIENT", "Cada componente debe aparecer una sola vez.");
  if (command.ingredients.some((item) => item.itemId === command.outputItemId)) throw new InventoryTransformationError("CYCLIC_FORMULA", "El insumo resultante no puede ser también un componente.");
  const normalized = command.ingredients.map((item) => ({ itemId: item.itemId, quantity: new Decimal(item.quantity) }));
  if (normalized.some((item) => !item.quantity.greaterThan(0))) throw new InventoryTransformationError("INVALID_QUANTITY", "Las cantidades de los componentes deben ser mayores que cero.");
  return database.$transaction(async (tx) => {
    const itemIds = [command.outputItemId, ...normalized.map((item) => item.itemId)];
    const items = await tx.inventoryItem.findMany({ where: { id: { in: itemIds }, companyId: command.companyId, active: true } });
    if (items.length !== new Set(itemIds).size) throw new InventoryTransformationError("INVALID_ITEM", "Uno de los insumos no existe o está inactivo.");
    const output = items.find((item) => item.id === command.outputItemId)!;
    if (output.type !== "INTERMEDIATE") throw new InventoryTransformationError("INVALID_OUTPUT_TYPE", "El resultado debe estar registrado como Insumo elaborado.");
    const activeFormulas = await tx.inventoryFormula.findMany({ where: { companyId: command.companyId, active: true, ...(command.code ? { code: { not: command.code } } : {}) }, include: { versions: { where: { isActive: true }, include: { ingredients: true } } } });
    const edges = activeFormulas.flatMap((formula) => formula.versions.map((version) => ({ outputItemId: formula.outputItemId, ingredientItemIds: version.ingredients.map((ingredient) => ingredient.itemId) })));
    if (createsInventoryFormulaCycle(edges, command.outputItemId, normalized.map((item) => item.itemId))) throw new InventoryTransformationError("CYCLIC_FORMULA", "La fórmula generaría un ciclo entre insumos elaborados.");
    const existing = command.code ? await tx.inventoryFormula.findUnique({ where: { companyId_code: { companyId: command.companyId, code: command.code } }, include: { versions: { orderBy: { version: "desc" } } } }) : null;
    if (command.code && !existing) throw new InventoryTransformationError("FORMULA_NOT_FOUND", "La fórmula indicada no existe.");
    if (existing && existing.outputItemId !== command.outputItemId) throw new InventoryTransformationError("IMMUTABLE_OUTPUT", "No se puede cambiar el insumo resultante de una fórmula existente. Crea una fórmula nueva.");
    const code = existing?.code ?? await nextBusinessCode(tx, command.companyId, "INVENTORY_FORMULA");
    const version = (existing?.versions[0]?.version ?? 0) + 1;
    if (existing) await tx.inventoryFormulaVersion.updateMany({ where: { formulaId: existing.id, isActive: true }, data: { isActive: false } });
    const formula = existing
      ? await tx.inventoryFormula.update({ where: { id: existing.id }, data: { name: command.name, outputItemId: command.outputItemId, active: true } })
      : await tx.inventoryFormula.create({ data: { companyId: command.companyId, code, name: command.name, outputItemId: command.outputItemId } });
    await tx.inventoryFormulaVersion.create({ data: { formulaId: formula.id, version, yieldQuantity, notes: command.notes || null, ingredients: { create: normalized } } });
    await tx.auditLog.create({ data: { companyId: command.companyId, userId: command.userId, module: "inventory", entity: "InventoryFormula", entityId: formula.id, action: existing ? "VERSION_CREATE" : "CREATE", afterData: { code, version, outputItemId: command.outputItemId } } });
    return formula;
  });
}

export async function createInventoryTransformation(database: PrismaClient, command: { companyId: string; userId: string; warehouseId: string; formulaVersionId?: string; recipeVersionId?: string; plannedOutputQuantity: Decimal.Value; outputLotCode?: string; notes?: string }) {
  const planned = new Decimal(command.plannedOutputQuantity);
  if (!planned.greaterThan(0)) throw new InventoryTransformationError("INVALID_QUANTITY", "La cantidad a elaborar debe ser mayor que cero.");
  if (Boolean(command.formulaVersionId) === Boolean(command.recipeVersionId)) throw new InventoryTransformationError("INVALID_SOURCE", "Selecciona una única receta para elaborar el insumo.");
  return database.$transaction(async (tx) => {
    const [warehouse, formulaVersion, recipeVersion] = await Promise.all([
      tx.warehouse.findFirst({ where: { id: command.warehouseId, companyId: command.companyId, active: true } }),
      command.formulaVersionId ? tx.inventoryFormulaVersion.findFirst({ where: { id: command.formulaVersionId, isActive: true, formula: { companyId: command.companyId, active: true } }, include: { formula: { include: { outputItem: true } }, ingredients: true } }) : null,
      command.recipeVersionId ? tx.recipeVersion.findFirst({ where: { id: command.recipeVersionId, isActive: true, recipe: { companyId: command.companyId, status: "ACTIVE", outputItemId: { not: null } } }, include: { recipe: { include: { outputItem: true } }, ingredients: true } }) : null,
    ]);
    const version = recipeVersion ?? formulaVersion;
    const outputItem = recipeVersion?.recipe.outputItem ?? formulaVersion?.formula.outputItem;
    if (!warehouse || !version || !outputItem) throw new InventoryTransformationError("INVALID_REFERENCE", "El almacén o la receta activa no es válido.");
    if (outputItem.lotTrackingMode === "REQUIRED" && !command.outputLotCode?.trim()) throw new InventoryTransformationError("LOT_REQUIRED", "El insumo resultante requiere un lote de salida.");
    const factor = planned.div(version.yieldQuantity.toString());
    const number = await nextBusinessCode(tx, command.companyId, "INVENTORY_TRANSFORMATION");
    const result = await tx.inventoryTransformation.create({ data: { companyId: command.companyId, warehouseId: command.warehouseId, formulaVersionId: formulaVersion?.id, recipeVersionId: recipeVersion?.id, number, plannedOutputQuantity: planned, outputLotCode: command.outputLotCode?.trim() || null, notes: command.notes || null, createdById: command.userId, materials: { create: version.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, plannedQuantity: new Decimal(ingredient.quantity.toString()).mul(factor).toDecimalPlaces(6) })) } } });
    await log(tx, command.companyId, command.userId, result.id, "CREATE", { number, status: result.status });
    return result;
  });
}

async function consume(tx: Prisma.TransactionClient, command: { companyId: string; userId: string; transformationId: string; warehouseId: string }, material: { id: string; itemId: string; plannedQuantity: Prisma.Decimal }) {
  const required = new Decimal(material.plannedQuantity.toString());
  await lock(tx, command.warehouseId, material.itemId);
  const [global, item] = await Promise.all([tx.stockBalance.findFirst({ where: { warehouseId: command.warehouseId, itemId: material.itemId, lotId: null } }), tx.inventoryItem.findUnique({ where: { id: material.itemId } })]);
  if (!global || !item || new Decimal(global.onHandQuantity.toString()).lessThan(required)) throw new InventoryTransformationError("INSUFFICIENT_STOCK", `No hay stock suficiente para elaborar el insumo (${item?.code ?? material.itemId}).`);
  const unitCost = new Decimal(global.averageUnitCost.toString());
  const nextQty = new Decimal(global.onHandQuantity.toString()).sub(required);
  const movementValue = required.mul(unitCost).toDecimalPlaces(4);
  const nextValue = nextQty.isZero() ? new Decimal(0) : new Decimal(global.inventoryValue.toString()).sub(movementValue).toDecimalPlaces(4);
  await tx.stockBalance.update({ where: { id: global.id }, data: { onHandQuantity: nextQty, inventoryValue: nextValue, averageUnitCost: nextQty.isZero() ? 0 : unitCost } });
  const segments: { lotId: string | null; quantity: Decimal }[] = [];
  if (item.lotTrackingMode === "NONE") segments.push({ lotId: null, quantity: required });
  else {
    const balances = await tx.stockBalance.findMany({ where: { warehouseId: command.warehouseId, itemId: material.itemId, lotId: { not: null }, onHandQuantity: { gt: 0 } }, include: { lot: true } });
    balances.sort((a, b) => (a.lot?.receivedAt?.getTime() ?? 0) - (b.lot?.receivedAt?.getTime() ?? 0));
    let remaining = required;
    for (const balance of balances) {
      if (!remaining.greaterThan(0)) break;
      const take = Decimal.min(remaining, balance.onHandQuantity.toString());
      const lotQty = new Decimal(balance.onHandQuantity.toString()).sub(take);
      const lotValue = lotQty.isZero() ? new Decimal(0) : new Decimal(balance.inventoryValue.toString()).sub(take.mul(balance.averageUnitCost.toString())).toDecimalPlaces(4);
      await tx.stockBalance.update({ where: { id: balance.id }, data: { onHandQuantity: lotQty, inventoryValue: lotValue, averageUnitCost: lotQty.isZero() ? 0 : balance.averageUnitCost } });
      segments.push({ lotId: balance.lotId, quantity: take }); remaining = remaining.sub(take);
    }
    if (remaining.greaterThan(0)) { if (item.lotTrackingMode === "REQUIRED") throw new InventoryTransformationError("INSUFFICIENT_LOT_STOCK", `No hay stock por lote suficiente para ${item.code}.`); segments.push({ lotId: null, quantity: remaining }); }
  }
  for (const segment of segments) await tx.stockMovement.create({ data: { itemId: material.itemId, warehouseId: command.warehouseId, lotId: segment.lotId, type: "TRANSFORMATION_CONSUMPTION", quantity: segment.quantity.neg(), unitCost, movementValue: segment.quantity.mul(unitCost).toDecimalPlaces(4).neg(), balanceAfter: nextQty, valueAfter: nextValue, averageCostAfter: nextQty.isZero() ? 0 : unitCost, referenceType: "INVENTORY_TRANSFORMATION", referenceId: command.transformationId, postingSequence: await sequence(tx, command.companyId), createdById: command.userId } });
  await tx.inventoryTransformationMaterial.update({ where: { id: material.id }, data: { consumedQuantity: required, unitCost } });
}

export async function startInventoryTransformation(database: PrismaClient, command: { companyId: string; userId: string; id: string }) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM inventory_transformations WHERE id = ${command.id}::uuid FOR UPDATE`;
    const transformation = await tx.inventoryTransformation.findFirst({ where: { id: command.id, companyId: command.companyId }, include: { materials: true } });
    if (!transformation) throw new InventoryTransformationError("NOT_FOUND", "La orden de transformación no existe.");
    if (transformation.status !== "DRAFT") throw new InventoryTransformationError("INVALID_STATE", "Solo puede iniciarse una orden en borrador.");
    for (const material of transformation.materials) await consume(tx, { ...command, transformationId: transformation.id, warehouseId: transformation.warehouseId }, material);
    const result = await tx.inventoryTransformation.update({ where: { id: transformation.id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
    await log(tx, command.companyId, command.userId, result.id, "START", { number: result.number, status: result.status });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function completeInventoryTransformation(database: PrismaClient, command: { companyId: string; userId: string; id: string; actualOutputQuantity: Decimal.Value; actualWasteQuantity?: Decimal.Value }) {
  const outputQuantity = new Decimal(command.actualOutputQuantity);
  const waste = new Decimal(command.actualWasteQuantity ?? 0);
  if (!outputQuantity.greaterThan(0) || waste.isNegative()) throw new InventoryTransformationError("INVALID_QUANTITY", "La salida debe ser mayor que cero y la merma no puede ser negativa.");
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM inventory_transformations WHERE id = ${command.id}::uuid FOR UPDATE`;
    const transformation = await tx.inventoryTransformation.findFirst({ where: { id: command.id, companyId: command.companyId }, include: { materials: true, formulaVersion: { include: { formula: { include: { outputItem: true } } } }, recipeVersion: { include: { recipe: { include: { outputItem: true } } } } } });
    if (!transformation) throw new InventoryTransformationError("NOT_FOUND", "La orden de transformación no existe.");
    if (transformation.status !== "IN_PROGRESS") throw new InventoryTransformationError("INVALID_STATE", "Solo puede completarse una orden en curso.");
    if (outputQuantity.add(waste).greaterThan(transformation.plannedOutputQuantity.toString())) throw new InventoryTransformationError("INVALID_QUANTITY", "La salida y la merma no pueden superar la cantidad planificada.");
    const item = transformation.recipeVersion?.recipe.outputItem ?? transformation.formulaVersion?.formula.outputItem;
    if (!item) throw new InventoryTransformationError("INVALID_SOURCE", "La orden no tiene un insumo resultante válido.");
    const totalCost = transformation.materials.reduce((sum, material) => sum.add(new Decimal(material.consumedQuantity.toString()).mul(material.unitCost.toString())), new Decimal(0)).toDecimalPlaces(4);
    const unitCost = totalCost.div(outputQuantity).toDecimalPlaces(6);
    await lock(tx, transformation.warehouseId, item.id);
    const current = await tx.stockBalance.findFirst({ where: { warehouseId: transformation.warehouseId, itemId: item.id, lotId: null } });
    const next = calculateMovingAverage({ currentQuantity: current?.onHandQuantity.toString() ?? 0, currentValue: current?.inventoryValue.toString() ?? 0, incomingQuantity: outputQuantity, incomingUnitCost: unitCost });
    if (current) await tx.stockBalance.update({ where: { id: current.id }, data: { onHandQuantity: next.onHandQuantity, inventoryValue: next.inventoryValue, averageUnitCost: next.averageUnitCost } });
    else await tx.stockBalance.create({ data: { warehouseId: transformation.warehouseId, itemId: item.id, lotId: null, onHandQuantity: next.onHandQuantity, inventoryValue: next.inventoryValue, averageUnitCost: next.averageUnitCost } });
    let lotId: string | null = null;
    if (transformation.outputLotCode) {
      const lot = await tx.inventoryLot.upsert({ where: { warehouseId_itemId_lotCode: { warehouseId: transformation.warehouseId, itemId: item.id, lotCode: transformation.outputLotCode } }, update: {}, create: { warehouseId: transformation.warehouseId, itemId: item.id, lotCode: transformation.outputLotCode, receivedAt: new Date() } });
      lotId = lot.id; await lock(tx, transformation.warehouseId, item.id, lotId);
      const lotBalance = await tx.stockBalance.findFirst({ where: { warehouseId: transformation.warehouseId, itemId: item.id, lotId } });
      const lotNext = calculateMovingAverage({ currentQuantity: lotBalance?.onHandQuantity.toString() ?? 0, currentValue: lotBalance?.inventoryValue.toString() ?? 0, incomingQuantity: outputQuantity, incomingUnitCost: unitCost });
      if (lotBalance) await tx.stockBalance.update({ where: { id: lotBalance.id }, data: { onHandQuantity: lotNext.onHandQuantity, inventoryValue: lotNext.inventoryValue, averageUnitCost: lotNext.averageUnitCost } });
      else await tx.stockBalance.create({ data: { warehouseId: transformation.warehouseId, itemId: item.id, lotId, onHandQuantity: lotNext.onHandQuantity, inventoryValue: lotNext.inventoryValue, averageUnitCost: lotNext.averageUnitCost } });
    }
    await tx.stockMovement.create({ data: { itemId: item.id, warehouseId: transformation.warehouseId, lotId, type: "TRANSFORMATION_OUTPUT", quantity: outputQuantity, unitCost, movementValue: totalCost, balanceAfter: next.onHandQuantity, valueAfter: next.inventoryValue, averageCostAfter: next.averageUnitCost, referenceType: "INVENTORY_TRANSFORMATION", referenceId: transformation.id, postingSequence: await sequence(tx, command.companyId), createdById: command.userId } });
    const result = await tx.inventoryTransformation.update({ where: { id: transformation.id }, data: { status: "COMPLETED", actualOutputQuantity: outputQuantity, actualWasteQuantity: waste, completedAt: new Date() } });
    await log(tx, command.companyId, command.userId, result.id, "COMPLETE", { number: result.number, status: result.status, outputQuantity: outputQuantity.toString(), waste: waste.toString(), unitCost: unitCost.toString() });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
