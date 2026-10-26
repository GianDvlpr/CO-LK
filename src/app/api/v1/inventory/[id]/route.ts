import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { normalizeReferenceCost, type ReferenceCostValues } from "@/modules/inventory/domain/reference-cost";
import { normalizeDefaultPresentation, type DefaultPresentationValues } from "@/modules/inventory/domain/default-presentation";
import { itemTypeChangeIssue } from "@/modules/inventory/domain/item-type-change";
import { destroyInventoryImage } from "@/lib/cloudinary/server";

const schema = z.object({ type: z.enum(["RAW_MATERIAL", "INTERMEDIATE", "WASTE", "FINISHED_PRODUCT"]), name: z.string().trim().min(1).max(150), abbreviation: z.string().trim().max(30).optional().or(z.literal("")), unitId: z.uuid(), supplierId: z.uuid().nullable().optional(), currencyId: z.uuid().nullable().optional(), minimumStock: z.union([z.string(), z.number()]), lotTrackingMode: z.enum(["NONE", "OPTIONAL", "REQUIRED"]), active: z.boolean().default(true), supplierProductCode: z.string().trim().max(100).nullable().optional(), referenceNetPrice: z.union([z.string(), z.number()]).nullable().optional(), referenceTaxRate: z.union([z.string(), z.number()]).nullable().optional(), defaultPresentationType: z.string().trim().max(50).nullable().optional(), defaultPresentationContent: z.union([z.string(), z.number()]).nullable().optional(), defaultWarehouseId: z.uuid().nullable().optional() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request); const user = await requirePermission("inventory.create_item"); const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "El ítem contiene datos inválidos.", 400);
    const { id } = await context.params;
    const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { igvRate: true } });
    let reference: ReferenceCostValues;
    let presentation: DefaultPresentationValues;
    try { reference = normalizeReferenceCost(parsed.data.referenceNetPrice, parsed.data.referenceTaxRate, company.igvRate.toString()); }
    catch { return apiError("INVENTORY_INVALID_REFERENCE_COST", "El precio neto o el IGV del ítem no son válidos.", 422); }
    try { presentation = normalizeDefaultPresentation(parsed.data.defaultPresentationType, parsed.data.defaultPresentationContent); }
    catch (error) { return apiError("INVENTORY_INVALID_PRESENTATION", error instanceof Error ? error.message : "La presentación no es válida.", 422); }
    const [item, unit, supplier, currency, warehouse] = await Promise.all([prisma.inventoryItem.findFirst({ where: { id, companyId: user.companyId } }), prisma.unitOfMeasure.findFirst({ where: { id: parsed.data.unitId, companyId: user.companyId } }), parsed.data.supplierId ? prisma.supplier.findFirst({ where: { id: parsed.data.supplierId, companyId: user.companyId, active: true } }) : null, parsed.data.currencyId ? prisma.currency.findFirst({ where: { id: parsed.data.currencyId, companyId: user.companyId } }) : null, parsed.data.defaultWarehouseId ? prisma.warehouse.findFirst({ where: { id: parsed.data.defaultWarehouseId, companyId: user.companyId, active: true } }) : null]);
    if (!item) return apiError("INVENTORY_NOT_FOUND", "El ítem no existe.", 404);
    const typeIssue = itemTypeChangeIssue(item.type, parsed.data.type);
    if (typeIssue) return apiError(typeIssue.code, typeIssue.message, 422);
    if (!unit) return apiError("INVENTORY_INVALID_UNIT", "La unidad no es válida.", 422); if (parsed.data.type !== "INTERMEDIATE" && !supplier) return apiError("INVENTORY_INVALID_SUPPLIER", "Selecciona un proveedor activo.", 422); if (parsed.data.type !== "INTERMEDIATE" && !currency) return apiError("INVENTORY_INVALID_CURRENCY", "Selecciona una moneda registrada.", 422); if (parsed.data.supplierId && !supplier) return apiError("INVENTORY_INVALID_SUPPLIER", "El proveedor no existe o está inactivo.", 422); if (parsed.data.currencyId && !currency) return apiError("INVENTORY_INVALID_CURRENCY", "La moneda no está registrada.", 422); if (parsed.data.defaultWarehouseId && !warehouse) return apiError("INVENTORY_INVALID_WAREHOUSE", "El sector no existe.", 422); if (parsed.data.type === "RAW_MATERIAL" && !parsed.data.defaultWarehouseId) return apiError("INVENTORY_SECTOR_REQUIRED", "Selecciona el sector para la materia prima.", 422);
    const [hasMovements, linkedProductCount] = await Promise.all([
      prisma.stockMovement.count({ where: { itemId: id } }),
      prisma.productVariant.count({ where: { inventoryItemId: id } }),
    ]);
    if (linkedProductCount && (item.type !== parsed.data.type || item.unitId !== parsed.data.unitId)) return apiError("INVENTORY_PRODUCT_LINK_LOCKED", "No puedes cambiar el tipo ni la unidad porque este ítem está publicado como producto.", 422);
    if (hasMovements && (item.unitId !== parsed.data.unitId || item.lotTrackingMode !== parsed.data.lotTrackingMode)) return apiError("INVENTORY_IMMUTABLE_STOCK_FIELDS", "No puedes cambiar la unidad o el control de lotes porque el ítem ya tiene movimientos.", 422);
    const values = { ...parsed.data, supplierId: supplier?.id ?? null, currencyId: currency?.id ?? null, abbreviation: parsed.data.abbreviation || null, supplierProductCode: parsed.data.supplierProductCode || null, defaultWarehouseId: parsed.data.defaultWarehouseId || null, ...reference, ...presentation };
    const updated = await prisma.$transaction(async (tx) => { const value = await tx.inventoryItem.update({ where: { id }, data: values }); await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "InventoryItem", entityId: id, action: "UPDATE", beforeData: { type: item.type, name: item.name, abbreviation: item.abbreviation, unitId: item.unitId, supplierId: item.supplierId, currencyId: item.currencyId, minimumStock: item.minimumStock.toString(), lotTrackingMode: item.lotTrackingMode, active: item.active, supplierProductCode: item.supplierProductCode, referenceNetPrice: item.referenceNetPrice?.toString() ?? null, referenceTaxRate: item.referenceTaxRate?.toString() ?? null, defaultPresentationType: item.defaultPresentationType, defaultPresentationContent: item.defaultPresentationContent?.toString() ?? null, defaultWarehouseId: item.defaultWarehouseId }, afterData: { ...values, minimumStock: String(values.minimumStock), referenceNetPrice: values.referenceNetPrice, referenceTaxRate: values.referenceTaxRate, defaultPresentationContent: values.defaultPresentationContent } } }); return value; });
    return apiSuccess(updated);
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("INVENTORY_DUPLICATE_CODE", "Ya existe un ítem con ese código.", 409); throw error; }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  try {
    const user = await requirePermission("inventory.delete");
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return apiError("INVENTORY_NOT_FOUND", "El ítem no existe.", 404);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM inventory_items WHERE id = ${id}::uuid FOR UPDATE`;
      const item = await tx.inventoryItem.findFirst({ where: { id, companyId: user.companyId }, select: { id: true, code: true, name: true, type: true, images: { select: { publicId: true } } } });
      if (!item) return "missing" as const;
      const references = await Promise.all([
        tx.stockBalance.count({ where: { itemId: id } }),
        tx.stockMovement.count({ where: { itemId: id } }),
        tx.stockReservation.count({ where: { itemId: id } }),
        tx.inventoryLot.count({ where: { itemId: id } }),
        tx.inventoryAdjustmentLine.count({ where: { itemId: id } }),
        tx.purchaseLine.count({ where: { itemId: id } }),
        tx.productVariant.count({ where: { inventoryItemId: id } }),
        tx.recipeIngredient.count({ where: { itemId: id } }),
        tx.recipe.count({ where: { outputItemId: id } }),
        tx.productionMaterial.count({ where: { itemId: id } }),
        tx.productionOrder.count({ where: { materialItemId: id } }),
        tx.productionComponent.count({ where: { itemId: id } }),
        tx.inventoryFormula.count({ where: { outputItemId: id } }),
        tx.inventoryFormulaIngredient.count({ where: { itemId: id } }),
        tx.inventoryTransformationMaterial.count({ where: { itemId: id } }),
      ]);
      if (references.some((count) => count > 0)) return "in-use" as const;
      await tx.inventoryItem.delete({ where: { id } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "inventory", entity: "InventoryItem", entityId: id, action: "DELETE", beforeData: { code: item.code, name: item.name, type: item.type } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "inventory.item-deleted.v1", aggregateId: id, payload: { itemId: id, code: item.code } } });
      return { kind: "deleted" as const, images: item.images };
    });
    if (result === "missing") return apiError("INVENTORY_NOT_FOUND", "El ítem no existe.", 404);
    if (result === "in-use") return apiError("INVENTORY_ITEM_IN_USE", "El ítem ya se usó; desactívalo en lugar de eliminarlo.", 409);
    await Promise.all(result.images.map((image) => destroyInventoryImage(image.publicId).catch(() => undefined)));
    return apiSuccess({ id });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return apiError("INVENTORY_ITEM_IN_USE", "El ítem ya se usó; desactívalo en lugar de eliminarlo.", 409);
    throw error;
  }
}
