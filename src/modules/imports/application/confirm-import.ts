import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { calculateMovingAverage } from "@/modules/inventory/domain/calculate-moving-average";
import { calculatePurchaseLine } from "@/modules/purchases/domain/calculate-purchase-line";
import { nextBusinessCode } from "@/lib/database/business-code";
import type { ImportModule, ParsedWorkbookRow } from "./workbook";

type ImportData = Record<string, ParsedWorkbookRow[]>;
export type ImportMode = "CREATE_UPDATE" | "ONLY_NEW";
export type ImportResult = { createdRecords: number; skippedRecords: number };

export class ImportApplicationError extends Error {
  constructor(public readonly code: string, message: string, public readonly rowNumber = 1, public readonly field?: string) {
    super(message);
    this.name = "ImportApplicationError";
  }
}

const text = (row: ParsedWorkbookRow, field: string) => row.values[field]?.trim() ?? "";
function number(row: ParsedWorkbookRow, field: string, fallback?: number) {
  const raw = text(row, field);
  const value = raw === "" && fallback !== undefined ? new Decimal(fallback) : new Decimal(raw || Number.NaN);
  if (!value.isFinite()) throw new ImportApplicationError("INVALID_NUMBER", `${field} debe ser numérico.`, row.rowNumber, field);
  return value;
}
function positive(row: ParsedWorkbookRow, field: string, fallback?: number) {
  const value = number(row, field, fallback);
  if (!value.greaterThan(0)) throw new ImportApplicationError("INVALID_NUMBER", `${field} debe ser mayor que cero.`, row.rowNumber, field);
  return value;
}
function date(row: ParsedWorkbookRow, field: string): Date;
function date(row: ParsedWorkbookRow, field: string, optional: true): Date | undefined;
function date(row: ParsedWorkbookRow, field: string, optional = false) {
  const raw = text(row, field);
  if (!raw && optional) return undefined;
  const value = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
  if (!raw || Number.isNaN(value.getTime())) throw new ImportApplicationError("INVALID_DATE", `${field} debe contener una fecha válida.`, row.rowNumber, field);
  return value;
}
function boolean(row: ParsedWorkbookRow, field: string, fallback = true) {
  const raw = text(row, field).toUpperCase();
  if (!raw) return fallback;
  if (["SI", "SÍ", "TRUE", "1", "ACTIVO"].includes(raw)) return true;
  if (["NO", "FALSE", "0", "INACTIVO"].includes(raw)) return false;
  throw new ImportApplicationError("INVALID_BOOLEAN", `${field} debe ser SI o NO.`, row.rowNumber, field);
}
function inferredAction(code: string, mode: ImportMode) {
  return mode === "ONLY_NEW" || !code ? "CREAR" : "ACTUALIZAR";
}
function rows(data: ImportData, sheet: string) { return data[sheet] ?? []; }
function groupedRows(items: ParsedWorkbookRow[], key: (row: ParsedWorkbookRow) => string) {
  const groups = new Map<string, ParsedWorkbookRow[]>();
  for (const row of items) {
    const value = key(row);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return [...groups.values()];
}
function unique<T>(items: T[], message: string, rowNumber: number) { if (new Set(items).size !== items.length) throw new ImportApplicationError("DUPLICATE_ROW", message, rowNumber); }
function created(result: ImportResult) { result.createdRecords += 1; }
function skipped(result: ImportResult) { result.skippedRecords += 1; }

async function nextSequence(tx: Prisma.TransactionClient, companyId: string) {
  const result = await tx.correlativeCounter.upsert({ where: { companyId_scope_year: { companyId, scope: "INVENTORY_POSTING", year: 0 } }, update: { value: { increment: 1 } }, create: { companyId, scope: "INVENTORY_POSTING", year: 0, value: 1 }, select: { value: true } });
  return BigInt(result.value);
}

async function addBalance(tx: Prisma.TransactionClient, warehouseId: string, itemId: string, lotId: string | null, quantity: Decimal, unitCost: Decimal) {
  const key = `${warehouseId}:${itemId}:${lotId ?? "GLOBAL"}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const current = await tx.stockBalance.findFirst({ where: { warehouseId, itemId, lotId } });
  const next = calculateMovingAverage({ currentQuantity: current?.onHandQuantity.toString() ?? 0, currentValue: current?.inventoryValue.toString() ?? 0, incomingQuantity: quantity, incomingUnitCost: unitCost });
  const balanceData = { onHandQuantity: next.onHandQuantity, inventoryValue: next.inventoryValue, averageUnitCost: next.averageUnitCost };
  if (current) await tx.stockBalance.update({ where: { id: current.id }, data: balanceData });
  else await tx.stockBalance.create({ data: { warehouseId, itemId, lotId, ...balanceData } });
  return next;
}

async function importInventory(tx: Prisma.TransactionClient, data: ImportData, companyId: string, userId: string, jobId: string, mode: ImportMode, result: ImportResult) {
  const openingItems = new Set<string>();
  for (const row of rows(data, "Almacén")) {
    const suppliedCode = text(row, "codigo").toUpperCase();
    const legacyCode = text(row, "codigo_anterior").toUpperCase() || null;
    const existing = suppliedCode
      ? await tx.inventoryItem.findUnique({ where: { companyId_code: { companyId, code: suppliedCode } } })
      : legacyCode
        ? await tx.inventoryItem.findUnique({ where: { companyId_legacyCode: { companyId, legacyCode } } })
        : null;
    if (mode === "ONLY_NEW" && existing) { skipped(result); continue; }
    if (mode === "ONLY_NEW" && suppliedCode && !existing) throw new ImportApplicationError("NOT_FOUND", `El código ${suppliedCode} no existe; deja la celda vacía para crear un ítem.`, row.rowNumber, "codigo");
    const unit = await tx.unitOfMeasure.findUnique({ where: { companyId_code: { companyId, code: text(row, "unidad_base").toUpperCase() } } });
    if (!unit) throw new ImportApplicationError("INVALID_REFERENCE", `No existe la unidad ${text(row, "unidad_base")}.`, row.rowNumber, "unidad_base");
    const rawType = text(row, "tipo_item").toUpperCase();
    const type = rawType === "MATERIA_PRIMA" ? "RAW_MATERIAL" : rawType === "PRODUCTO_TERMINADO" ? "FINISHED_PRODUCT" : rawType;
    if (!( ["RAW_MATERIAL", "FINISHED_PRODUCT"] as string[]).includes(type)) throw new ImportApplicationError("INVALID_TYPE", "tipo_item no es válido.", row.rowNumber, "tipo_item");
    const modeLot = (text(row, "modo_lote") || "NONE").toUpperCase();
    if (!( ["NONE", "OPTIONAL", "REQUIRED"] as string[]).includes(modeLot)) throw new ImportApplicationError("INVALID_LOT_MODE", "modo_lote no es válido.", row.rowNumber, "modo_lote");
    const op = inferredAction(suppliedCode, mode);
    if (op === "CREAR" && existing) throw new ImportApplicationError("DUPLICATE_CODE", `El ítem ${suppliedCode} ya existe.`, row.rowNumber, "codigo");
    if (op === "ACTUALIZAR" && !existing) throw new ImportApplicationError("NOT_FOUND", `El ítem ${suppliedCode} no existe.`, row.rowNumber, "codigo");
    const code = suppliedCode || await nextBusinessCode(tx, companyId, type === "RAW_MATERIAL" ? "INVENTORY_RAW" : "INVENTORY_FINISHED");
    const values = { name: text(row, "nombre"), legacyCode, abbreviation: text(row, "sigla") || null, legacySecondaryCode: text(row, "codigo_material_seg") || null, type: type as "RAW_MATERIAL" | "FINISHED_PRODUCT", unitId: unit.id, lotTrackingMode: modeLot as "NONE" | "OPTIONAL" | "REQUIRED", minimumStock: number(row, "stock_minimo", 0).toString(), active: boolean(row, "activo") };
    const item = existing
      ? await tx.inventoryItem.update({ where: { id: existing.id }, data: values })
      : await tx.inventoryItem.create({ data: { companyId, code, ...values } });
    created(result);

    const initialStockText = text(row, "stock_inicial");
    if (!initialStockText || new Decimal(initialStockText).isZero()) continue;
    const quantity = positive(row, "stock_inicial");
    const unitCost = number(row, "costo_unitario_pen");
    if (unitCost.isNegative()) throw new ImportApplicationError("INVALID_NUMBER", "El costo no puede ser negativo.", row.rowNumber, "costo_unitario_pen");
    const occurredAt = date(row, "fecha_inicial");
    const warehouseCode = (text(row, "almacen_codigo") || "PRINCIPAL").toUpperCase();
    const warehouse = await (warehouseCode === "PRINCIPAL"
        ? tx.warehouse.upsert({
            where: { companyId_code: { companyId, code: "PRINCIPAL" } },
            update: { active: true },
            create: { companyId, code: "PRINCIPAL", name: "Almacén principal" },
          })
        : tx.warehouse.findUnique({ where: { companyId_code: { companyId, code: warehouseCode } } }));
    if (!warehouse) throw new ImportApplicationError("INVALID_REFERENCE", "El almacén no existe.", row.rowNumber, "almacen_codigo");
    if (!openingItems.has(item.id)) {
      const movementCount = await tx.stockMovement.count({ where: { itemId: item.id } });
      if (movementCount && mode === "ONLY_NEW") { skipped(result); continue; }
      if (movementCount) throw new ImportApplicationError("OPENING_ALREADY_EXISTS", `El ítem ${item.code} ya tiene movimientos y no admite otra apertura.`, row.rowNumber, "item_codigo");
      openingItems.add(item.id);
    }
    const lotCode = text(row, "lote") || undefined;
    if (item.lotTrackingMode === "REQUIRED" && !lotCode) throw new ImportApplicationError("LOT_REQUIRED", `El ítem ${item.code} requiere lote.`, row.rowNumber, "lote");
    if (item.lotTrackingMode === "NONE" && lotCode) throw new ImportApplicationError("LOT_NOT_ALLOWED", `El ítem ${item.code} no admite lote.`, row.rowNumber, "lote");
    const adjustment = await tx.inventoryAdjustment.create({ data: { companyId, warehouseId: warehouse.id, number: `IMP-${jobId.slice(0, 8)}-${row.rowNumber}`, reason: text(row, "observaciones") || "Stock inicial importado", status: "APPROVED", lines: { create: { itemId: item.id, quantity: quantity.toString(), unitCost: unitCost.toString() } } } });
    const lot = lotCode ? await tx.inventoryLot.upsert({ where: { warehouseId_itemId_lotCode: { warehouseId: warehouse.id, itemId: item.id, lotCode } }, update: {}, create: { warehouseId: warehouse.id, itemId: item.id, lotCode, receivedAt: occurredAt } }) : null;
    const global = await addBalance(tx, warehouse.id, item.id, null, quantity, unitCost);
    if (lot) await addBalance(tx, warehouse.id, item.id, lot.id, quantity, unitCost);
    await tx.stockMovement.create({ data: { itemId: item.id, warehouseId: warehouse.id, lotId: lot?.id, type: "ADJUSTMENT_IN", quantity: quantity.toString(), unitCost: unitCost.toString(), movementValue: quantity.mul(unitCost).toDecimalPlaces(4).toString(), balanceAfter: global.onHandQuantity, valueAfter: global.inventoryValue, averageCostAfter: global.averageUnitCost, referenceType: "INVENTORY_OPENING_IMPORT", referenceId: adjustment.id, occurredAt, postingSequence: await nextSequence(tx, companyId), createdById: userId } });
    created(result);
  }
}

async function importProducts(tx: Prisma.TransactionClient, data: ImportData, companyId: string, mode: ImportMode, result: ImportResult) {
  const groups = groupedRows(rows(data, "Productos"), (row) => text(row, "producto_codigo").toUpperCase() || text(row, "referencia_carga").toUpperCase());
  for (const productRows of groups) {
    const row = productRows[0];
    const suppliedCode = text(row, "producto_codigo").toUpperCase();
    const existing = suppliedCode ? await tx.product.findUnique({ where: { companyId_code: { companyId, code: suppliedCode } } }) : null;
    if (mode === "ONLY_NEW" && existing) { skipped(result); continue; }
    if (mode === "ONLY_NEW" && suppliedCode && !existing) throw new ImportApplicationError("NOT_FOUND", `El código ${suppliedCode} no existe; deja la celda vacía para crear un producto.`, row.rowNumber, "producto_codigo");
    const op = inferredAction(suppliedCode, mode);
    if (op === "CREAR" && existing) throw new ImportApplicationError("DUPLICATE_CODE", `El producto ${suppliedCode} ya existe.`, row.rowNumber);
    if (op === "ACTUALIZAR" && !existing) throw new ImportApplicationError("NOT_FOUND", `El producto ${suppliedCode} no existe.`, row.rowNumber);
    const code = suppliedCode || await nextBusinessCode(tx, companyId, "PRODUCT");
    const values = { name: text(row, "nombre"), description: text(row, "descripcion") || null, active: boolean(row, "producto_activo") };
    const product = existing
      ? await tx.product.update({ where: { id: existing.id }, data: values })
      : await tx.product.create({ data: { companyId, code, ...values } });
    created(result);
    for (const variantRow of productRows.filter((item) => text(item, "sku"))) {
      const [size, color, unit] = await Promise.all([
        tx.size.findUnique({ where: { companyId_code: { companyId, code: text(variantRow, "talla") } } }),
        tx.color.findUnique({ where: { companyId_code: { companyId, code: text(variantRow, "color") } } }),
        tx.unitOfMeasure.findUnique({ where: { companyId_code: { companyId, code: text(variantRow, "unidad").toUpperCase() } } }),
      ]);
      if (!size || !color || !unit) throw new ImportApplicationError("INVALID_REFERENCE", "Talla, color o unidad inexistente.", variantRow.rowNumber);
      const sku = text(variantRow, "sku");
      const existingVariant = await tx.productVariant.findUnique({ where: { sku }, include: { inventoryItem: true } });
      if (mode === "ONLY_NEW" && existingVariant) { skipped(result); continue; }
      const active = boolean(variantRow, "variante_activa");
      const minimumStock = number(variantRow, "stock_minimo", 0).toString();
      if (existingVariant) {
        if (existingVariant.inventoryItem.companyId !== companyId) throw new ImportApplicationError("FORBIDDEN", "El SKU pertenece a otra empresa.", variantRow.rowNumber);
        await tx.inventoryItem.update({ where: { id: existingVariant.inventoryItemId }, data: { name: `${product.name} · ${size.name} · ${color.name}`, unitId: unit.id, minimumStock, active } });
        await tx.productVariant.update({ where: { id: existingVariant.id }, data: { productId: product.id, sizeId: size.id, colorId: color.id, active } });
      } else {
        const item = await tx.inventoryItem.create({ data: { companyId, code: sku, name: `${product.name} · ${size.name} · ${color.name}`, type: "FINISHED_PRODUCT", unitId: unit.id, minimumStock, lotTrackingMode: "NONE", active } });
        await tx.productVariant.create({ data: { productId: product.id, sizeId: size.id, colorId: color.id, inventoryItemId: item.id, sku, active } });
      }
      created(result);
    }
  }
}

async function importRecipes(tx: Prisma.TransactionClient, data: ImportData, companyId: string, mode: ImportMode, result: ImportResult) {
  const groups = groupedRows(rows(data, "Recetas"), (row) => `${text(row, "receta_codigo").toUpperCase() || text(row, "referencia_carga").toUpperCase()}|${text(row, "version") || "1"}`);
  for (const ingredientRows of groups) {
    const row = ingredientRows[0];
    const suppliedCode = text(row, "receta_codigo").toUpperCase();
    const requestedVersion = number(row, "version", 1).toNumber();
    const [product, existing] = await Promise.all([
      tx.product.findUnique({ where: { companyId_code: { companyId, code: text(row, "producto_codigo") } } }),
      suppliedCode ? tx.recipe.findUnique({ where: { companyId_code: { companyId, code: suppliedCode } }, include: { versions: { orderBy: { version: "desc" } } } }) : null,
    ]);
    if (!product) throw new ImportApplicationError("INVALID_REFERENCE", "El producto de la receta no existe.", row.rowNumber, "producto_codigo");
    if (mode === "ONLY_NEW" && existing?.versions.some((version) => version.version === requestedVersion)) { skipped(result); continue; }
    if (mode === "ONLY_NEW" && suppliedCode && !existing) throw new ImportApplicationError("NOT_FOUND", `La receta ${suppliedCode} no existe; deja la celda vacía para crear una receta.`, row.rowNumber, "receta_codigo");
    const op = inferredAction(suppliedCode, mode);
    if (op === "CREAR" && existing && mode !== "ONLY_NEW") throw new ImportApplicationError("DUPLICATE_CODE", `La receta ${suppliedCode} ya existe.`, row.rowNumber);
    if (op === "ACTUALIZAR" && !existing) throw new ImportApplicationError("NOT_FOUND", `La receta ${suppliedCode} no existe.`, row.rowNumber);
    const code = suppliedCode || await nextBusinessCode(tx, companyId, "RECIPE");
    const version = mode === "ONLY_NEW" ? requestedVersion : existing ? (existing.versions[0]?.version ?? 0) + 1 : requestedVersion;
    if (!ingredientRows.length) throw new ImportApplicationError("RECIPE_EMPTY", `La receta ${code} no tiene ingredientes.`, row.rowNumber);
    unique(ingredientRows.map((item) => text(item, "material_codigo")), `La receta ${code} contiene materias primas repetidas.`, row.rowNumber);
    const ingredients = [];
    for (const ingredientRow of ingredientRows) {
      const item = await tx.inventoryItem.findUnique({ where: { companyId_code: { companyId, code: text(ingredientRow, "material_codigo") } } });
      if (!item || item.type !== "RAW_MATERIAL") throw new ImportApplicationError("INVALID_REFERENCE", "La materia prima no existe o no es válida.", ingredientRow.rowNumber, "material_codigo");
      const waste = number(ingredientRow, "merma_porcentaje", 0);
      if (waste.isNegative() || waste.greaterThan(100)) throw new ImportApplicationError("INVALID_NUMBER", "La merma debe estar entre 0 y 100.", ingredientRow.rowNumber, "merma_porcentaje");
      ingredients.push({ itemId: item.id, quantity: positive(ingredientRow, "cantidad").toString(), wastePercentage: waste.toString() });
    }
    const recipe = existing
      ? await tx.recipe.update({ where: { id: existing.id }, data: { productId: product.id, name: code, status: "DRAFT" } })
      : await tx.recipe.create({ data: { companyId, productId: product.id, code, name: code, status: "DRAFT" } });
    await tx.recipeVersion.create({ data: { recipeId: recipe.id, version, yieldQuantity: positive(row, "rendimiento").toString(), notes: `Importación de versión ${requestedVersion}`, ingredients: { create: ingredients } } });
    created(result);
  }
}

async function importPurchases(tx: Prisma.TransactionClient, data: ImportData, companyId: string, userId: string, mode: ImportMode, result: ImportResult) {
  const warehouse = await tx.warehouse.findFirst({ where: { companyId, active: true }, orderBy: { code: "asc" } });
  if (!warehouse) throw new ImportApplicationError("INVALID_REFERENCE", "No existe un almacén activo para registrar compras.");
  const groups = groupedRows(rows(data, "Compras"), (row) => text(row, "codigo_compra").toUpperCase() || [text(row, "proveedor_codigo"), text(row, "tipo_documento"), text(row, "serie_documento"), text(row, "numero_documento"), text(row, "secuencia_recepcion") || "1"].map((value) => value.toUpperCase()).join("|"));
  for (const detailRows of groups) {
    const row = detailRows[0];
    const suppliedCode = text(row, "codigo_compra").toUpperCase();
    const requestedStatus = text(row, "estado").toUpperCase();
    if (!["PENDIENTE", "PENDING"].includes(requestedStatus)) throw new ImportApplicationError("INVALID_STATUS", "Las compras nuevas deben importarse con estado PENDIENTE.", row.rowNumber, "estado");
    const existingCode = suppliedCode ? await tx.purchase.findUnique({ where: { companyId_code: { companyId, code: suppliedCode } } }) : null;
    if (existingCode) { if (mode === "ONLY_NEW") { skipped(result); continue; } throw new ImportApplicationError("DUPLICATE_CODE", `La compra ${suppliedCode} ya existe.`, row.rowNumber); }
    if (suppliedCode) throw new ImportApplicationError("NOT_FOUND", `La compra ${suppliedCode} no existe; deja la celda vacía para crear una compra.`, row.rowNumber, "codigo_compra");
    const receptionDate = date(row, "fecha_recepcion");
    const code = suppliedCode || await nextBusinessCode(tx, companyId, "PURCHASE", receptionDate);
    const [supplier, currency] = await Promise.all([
      tx.supplier.findUnique({ where: { companyId_code: { companyId, code: text(row, "proveedor_codigo") } } }),
      tx.currency.findUnique({ where: { companyId_code: { companyId, code: text(row, "moneda").toUpperCase() } } }),
    ]);
    if (!supplier || !supplier.active || !currency) throw new ImportApplicationError("INVALID_REFERENCE", "Proveedor o moneda inexistente/inactivo.", row.rowNumber);
    const documentNumber = [text(row, "tipo_documento"), text(row, "serie_documento"), text(row, "numero_documento")].filter(Boolean).join("-");
    const receiptSequence = number(row, "secuencia_recepcion", 1).toNumber();
    const duplicateDocument = await tx.purchase.findUnique({ where: { companyId_supplierId_documentNumber_receiptSequence: { companyId, supplierId: supplier.id, documentNumber, receiptSequence } } });
    if (duplicateDocument) { if (mode === "ONLY_NEW") { skipped(result); continue; } throw new ImportApplicationError("DUPLICATE_DOCUMENT", "El documento del proveedor ya fue registrado.", row.rowNumber); }
    if (!detailRows.length) throw new ImportApplicationError("PURCHASE_EMPTY", `La compra ${code} no tiene detalle.`, row.rowNumber);
    const lineNumbers = [...new Set(detailRows.map((item) => number(item, "linea_numero").toNumber()))];
    const calculatedLines = [];
    for (const lineNumber of lineNumbers) {
      const lotRows = detailRows.filter((item) => number(item, "linea_numero").equals(lineNumber));
      const first = lotRows[0];
      const item = await tx.inventoryItem.findUnique({ where: { companyId_code: { companyId, code: text(first, "material_codigo") } } });
      if (!item) throw new ImportApplicationError("INVALID_REFERENCE", "La materia prima de la compra no existe.", first.rowNumber, "material_codigo");
      const presentationQuantity = positive(first, "cantidad_presentaciones");
      const presentationType = text(first, "tipo_presentacion").trim().toUpperCase();
      if (!presentationType) throw new ImportApplicationError("REQUIRED_FIELD", "El tipo de presentación es obligatorio.", first.rowNumber, "tipo_presentacion");
      const unitContent = text(first, "unidad_contenido").trim().toUpperCase();
      const unit = await tx.unitOfMeasure.findUnique({ where: { companyId_code: { companyId, code: unitContent } } });
      if (!unit || unit.id !== item.unitId) throw new ImportApplicationError("INVALID_REFERENCE", `La unidad ${unitContent} no coincide con la unidad base del ítem ${item.code}.`, first.rowNumber, "unidad_contenido");
      const contentPerUnit = positive(first, "contenido_por_presentacion");
      const pricePerBaseUnit = positive(first, "precio_neto_unidad_base");
      const taxRate = number(first, "tasa_igv", 18);
      const amounts = calculatePurchaseLine({ presentationQuantity, contentPerUnit, pricePerBaseUnit, taxRate });
      const lots = lotRows.filter((lotRow) => text(lotRow, "lote_proveedor")).map((lotRow, index) => ({ row: lotRow, lineNumber: number(lotRow, "lote_linea_numero", index + 1).toNumber(), lotCode: text(lotRow, "lote_proveedor"), quantity: lotRows.length === 1 ? amounts.receivedQuantity : positive(lotRow, "cantidad_base") }));
      if (item.lotTrackingMode === "REQUIRED" && !lots.length) throw new ImportApplicationError("LOT_REQUIRED", `El ítem ${item.code} requiere lote.`, first.rowNumber);
      if (item.lotTrackingMode === "NONE" && lots.length) throw new ImportApplicationError("LOT_NOT_ALLOWED", `El ítem ${item.code} no admite lote.`, first.rowNumber);
      if (lots.length && !lots.reduce((sum, lot) => sum.add(lot.quantity), new Decimal(0)).equals(amounts.receivedQuantity)) throw new ImportApplicationError("INVALID_LOT_QUANTITY", `La suma de lotes no coincide en ${item.code}.`, first.rowNumber);
      calculatedLines.push({ item, lineNumber, presentationType, presentationQuantity, contentPerUnit, pricePerBaseUnit, taxRate, amounts, lots });
    }
    const subtotal = calculatedLines.reduce((sum, line) => sum.add(line.amounts.subtotal), new Decimal(0));
    const taxAmount = calculatedLines.reduce((sum, line) => sum.add(line.amounts.taxAmount), new Decimal(0));
    const purchase = await tx.purchase.create({ data: { companyId, supplierId: supplier.id, warehouseId: warehouse.id, currencyId: currency.id, code, receptionDate, documentNumber, sourceOrderReference: text(row, "referencia_orden_origen") || null, receiptSequence, exchangeRate: positive(row, "tipo_cambio_pen", 1).toString(), subtotal: subtotal.toString(), taxAmount: taxAmount.toString(), total: subtotal.add(taxAmount).toString(), status: "PENDING" } });
    for (const line of calculatedLines) {
      const purchaseLine = await tx.purchaseLine.create({ data: { purchaseId: purchase.id, itemId: line.item.id, lineNumber: line.lineNumber, presentationType: line.presentationType, presentationQty: line.presentationQuantity.toString(), contentPerUnit: line.contentPerUnit.toString(), receivedQuantity: line.amounts.receivedQuantity.toString(), pricePerBaseUnit: line.pricePerBaseUnit.toString(), taxRate: line.taxRate.toString(), subtotal: line.amounts.subtotal.toString(), taxAmount: line.amounts.taxAmount.toString(), total: line.amounts.total.toString() } });
      for (const lotInput of line.lots) {
        const lot = await tx.inventoryLot.upsert({ where: { warehouseId_itemId_lotCode: { warehouseId: warehouse.id, itemId: line.item.id, lotCode: lotInput.lotCode } }, update: { supplierLot: lotInput.lotCode, expiresAt: date(lotInput.row, "fecha_vencimiento", true) }, create: { warehouseId: warehouse.id, itemId: line.item.id, lotCode: lotInput.lotCode, supplierLot: lotInput.lotCode, receivedAt: receptionDate, expiresAt: date(lotInput.row, "fecha_vencimiento", true) } });
        await tx.purchaseLineLot.create({ data: { purchaseLineId: purchaseLine.id, lotId: lot.id, lineNumber: lotInput.lineNumber, quantity: lotInput.quantity.toString() } });
      }
    }
    await tx.auditLog.create({ data: { companyId, userId, entity: "Purchase", entityId: purchase.id, action: "CREATE", afterData: { code, source: "EXCEL_IMPORT" } } });
    created(result);
  }
}

async function importOrders(tx: Prisma.TransactionClient, data: ImportData, companyId: string, mode: ImportMode, result: ImportResult) {
  const groups = groupedRows(rows(data, "Pedidos"), (row) => text(row, "numero_pedido").toUpperCase() || text(row, "referencia_carga").toUpperCase());
  for (const detailRows of groups) {
    const row = detailRows[0];
    const suppliedNumber = text(row, "numero_pedido").toUpperCase();
    const existing = suppliedNumber ? await tx.salesOrder.findUnique({ where: { companyId_number: { companyId, number: suppliedNumber } } }) : null;
    if (existing) { if (mode === "ONLY_NEW") { skipped(result); continue; } throw new ImportApplicationError("DUPLICATE_CODE", `El pedido ${suppliedNumber} ya existe.`, row.rowNumber); }
    if (suppliedNumber) throw new ImportApplicationError("NOT_FOUND", `El pedido ${suppliedNumber} no existe; deja la celda vacía para crear un pedido.`, row.rowNumber, "numero_pedido");
    const requestedAt = date(row, "fecha");
    const orderNumber = suppliedNumber || await nextBusinessCode(tx, companyId, "SALES_ORDER", requestedAt);
    const customer = await tx.customer.findUnique({ where: { companyId_code: { companyId, code: text(row, "cliente_codigo") } } });
    if (!customer || !customer.active) throw new ImportApplicationError("INVALID_REFERENCE", "El cliente no existe o está inactivo.", row.rowNumber, "cliente_codigo");
    if (!detailRows.length) throw new ImportApplicationError("ORDER_EMPTY", `El pedido ${orderNumber} no tiene detalle.`, row.rowNumber);
    unique(detailRows.map((item) => text(item, "sku")), `El pedido ${orderNumber} contiene SKU repetidos.`, row.rowNumber);
    const lines = [];
    for (const detail of detailRows) {
      const variant = await tx.productVariant.findUnique({ where: { sku: text(detail, "sku") }, include: { inventoryItem: true } });
      if (!variant || variant.inventoryItem.companyId !== companyId) throw new ImportApplicationError("INVALID_REFERENCE", "El SKU no existe.", detail.rowNumber, "sku");
      lines.push({ productVariantId: variant.id, quantity: positive(detail, "cantidad").toString(), unitPrice: positive(detail, "precio_neto_unitario").toString() });
    }
    await tx.salesOrder.create({ data: { companyId, customerId: customer.id, number: orderNumber, status: "DRAFT", requestedAt, promisedAt: date(row, "fecha_requerida", true), notes: text(row, "observaciones") || null, lines: { create: lines } } });
    created(result);
  }
}

export async function applyImport(tx: Prisma.TransactionClient, module: ImportModule, data: ImportData, companyId: string, userId: string, jobId: string, mode: ImportMode = "CREATE_UPDATE"): Promise<ImportResult> {
  const result: ImportResult = { createdRecords: 0, skippedRecords: 0 };
  if (module === "inventory") await importInventory(tx, data, companyId, userId, jobId, mode, result);
  else if (module === "products") await importProducts(tx, data, companyId, mode, result);
  else if (module === "recipes") await importRecipes(tx, data, companyId, mode, result);
  else if (module === "purchases") await importPurchases(tx, data, companyId, userId, mode, result);
  else if (module === "orders") await importOrders(tx, data, companyId, mode, result);
  return result;
}
