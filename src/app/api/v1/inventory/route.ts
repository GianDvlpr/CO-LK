import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { nextBusinessCode } from "@/lib/database/business-code";
import { normalizeReferenceCost, type ReferenceCostValues } from "@/modules/inventory/domain/reference-cost";
import { normalizeDefaultPresentation, type DefaultPresentationValues } from "@/modules/inventory/domain/default-presentation";

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  abbreviation: z.string().trim().max(30).optional().or(z.literal("")),
  type: z.enum(["RAW_MATERIAL", "INTERMEDIATE", "WASTE", "FINISHED_PRODUCT"]),
  unitId: z.uuid(),
  supplierId: z.uuid().nullable().optional(),
  currencyId: z.uuid().nullable().optional(),
  minimumStock: z.union([z.string(), z.number()]),
  lotTrackingMode: z.enum(["NONE", "OPTIONAL", "REQUIRED"]),
  supplierProductCode: z.string().trim().max(100).nullable().optional(),
  referenceNetPrice: z.union([z.string(), z.number()]).nullable().optional(),
  referenceTaxRate: z.union([z.string(), z.number()]).nullable().optional(),
  defaultPresentationType: z.string().trim().max(50).nullable().optional(),
  defaultPresentationContent: z.union([z.string(), z.number()]).nullable().optional(),
  defaultWarehouseId: z.uuid().nullable().optional(),
});

function knownError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("INVENTORY_DUPLICATE_CODE", "Ya existe un ítem con ese código.", 409);
  return null;
}

export async function GET() {
  try {
    const user = await requirePermission("inventory.read");
    const items = await prisma.inventoryItem.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: "asc" },
      include: { unit: { select: { code: true, symbol: true } }, supplier: { select: { id: true, code: true, name: true } }, currency: { select: { id: true, code: true, name: true, symbol: true } }, defaultWarehouse: { select: { code: true, name: true } }, images: { orderBy: { sortOrder: "asc" }, select: { id: true, secureUrl: true, fileName: true, sortOrder: true } }, balances: { where: { lotId: null }, select: { warehouseId: true, onHandQuantity: true, reservedQuantity: true, averageUnitCost: true, inventoryValue: true } } },
    });
    return apiSuccess({ items });
  } catch (error) { const response = knownError(error); if (response) return response; throw error; }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "El ítem contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("inventory.create_item");
    const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { igvRate: true } });
    let reference: ReferenceCostValues;
    let presentation: DefaultPresentationValues;
    try { reference = normalizeReferenceCost(parsed.data.referenceNetPrice, parsed.data.referenceTaxRate, company.igvRate.toString()); }
    catch { return apiError("INVENTORY_INVALID_REFERENCE_COST", "El precio neto o el IGV del ítem no son válidos.", 422); }
    try { presentation = normalizeDefaultPresentation(parsed.data.defaultPresentationType, parsed.data.defaultPresentationContent); }
    catch (error) { return apiError("INVENTORY_INVALID_PRESENTATION", error instanceof Error ? error.message : "La presentación no es válida.", 422); }
    const [unit, supplier, currency, warehouse] = await Promise.all([
      prisma.unitOfMeasure.findFirst({ where: { id: parsed.data.unitId, companyId: user.companyId } }),
      parsed.data.supplierId ? prisma.supplier.findFirst({ where: { id: parsed.data.supplierId, companyId: user.companyId, active: true } }) : null,
      parsed.data.currencyId ? prisma.currency.findFirst({ where: { id: parsed.data.currencyId, companyId: user.companyId } }) : null,
      parsed.data.defaultWarehouseId ? prisma.warehouse.findFirst({ where: { id: parsed.data.defaultWarehouseId, companyId: user.companyId, active: true } }) : null,
    ]);
    if (!unit) return apiError("INVENTORY_INVALID_UNIT", "La unidad de medida no es válida.", 422);
    if (parsed.data.defaultWarehouseId && !warehouse) return apiError("INVENTORY_INVALID_WAREHOUSE", "El sector no existe.", 422);
    if (parsed.data.type === "RAW_MATERIAL" && !parsed.data.defaultWarehouseId) return apiError("INVENTORY_SECTOR_REQUIRED", "Selecciona el sector para la materia prima.", 422);
    if (parsed.data.type !== "INTERMEDIATE" && !supplier) return apiError("INVENTORY_INVALID_SUPPLIER", "Selecciona un proveedor activo.", 422);
    if (parsed.data.type !== "INTERMEDIATE" && !currency) return apiError("INVENTORY_INVALID_CURRENCY", "Selecciona una moneda registrada.", 422);
    if (parsed.data.supplierId && !supplier) return apiError("INVENTORY_INVALID_SUPPLIER", "El proveedor no existe o está inactivo.", 422);
    if (parsed.data.currencyId && !currency) return apiError("INVENTORY_INVALID_CURRENCY", "La moneda no está registrada.", 422);
    const item = await prisma.$transaction(async (tx) => {
      const codeKind = parsed.data.type === "RAW_MATERIAL" ? "INVENTORY_RAW" : parsed.data.type === "INTERMEDIATE" ? "INVENTORY_INTERMEDIATE" : parsed.data.type === "WASTE" ? "INVENTORY_WASTE" : "INVENTORY_FINISHED";
      const code = await nextBusinessCode(tx, user.companyId, codeKind);
      const values = { ...parsed.data, supplierId: supplier?.id ?? null, currencyId: currency?.id ?? null, abbreviation: parsed.data.abbreviation || null, supplierProductCode: parsed.data.supplierProductCode || null, defaultWarehouseId: parsed.data.defaultWarehouseId || null, ...reference, ...presentation };
      const created = await tx.inventoryItem.create({ data: { ...values, code, minimumStock: parsed.data.minimumStock, companyId: user.companyId } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "InventoryItem", entityId: created.id, action: "CREATE", afterData: { code: created.code, name: created.name, supplierId: created.supplierId, currencyId: created.currencyId, supplierProductCode: created.supplierProductCode, referenceNetPrice: created.referenceNetPrice?.toString() ?? null, referenceTaxRate: created.referenceTaxRate?.toString() ?? null, defaultPresentationType: created.defaultPresentationType, defaultPresentationContent: created.defaultPresentationContent?.toString() ?? null, defaultWarehouseId: created.defaultWarehouseId } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "inventory.item-created.v1", aggregateId: created.id, payload: { itemId: created.id, code: created.code } } });
      return created;
    });
    return apiSuccess(item, 201);
  } catch (error) { const response = knownError(error); if (response) return response; throw error; }
}
