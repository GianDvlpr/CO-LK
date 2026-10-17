import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { nextBusinessCode } from "@/lib/database/business-code";

const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  abbreviation: z.string().trim().max(30).optional().or(z.literal("")),
  type: z.enum(["RAW_MATERIAL", "WASTE", "FINISHED_PRODUCT"]),
  unitId: z.uuid(),
  minimumStock: z.union([z.string(), z.number()]),
  lotTrackingMode: z.enum(["NONE", "OPTIONAL", "REQUIRED"]),
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
      include: { unit: { select: { code: true, symbol: true } }, balances: { where: { lotId: null }, select: { warehouseId: true, onHandQuantity: true, reservedQuantity: true, averageUnitCost: true, inventoryValue: true } } },
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
    const unit = await prisma.unitOfMeasure.findFirst({ where: { id: parsed.data.unitId, companyId: user.companyId } });
    if (!unit) return apiError("INVENTORY_INVALID_UNIT", "La unidad de medida no es válida.", 422);
    const item = await prisma.$transaction(async (tx) => {
      const codeKind = parsed.data.type === "RAW_MATERIAL" ? "INVENTORY_RAW" : parsed.data.type === "WASTE" ? "INVENTORY_WASTE" : "INVENTORY_FINISHED";
      const code = await nextBusinessCode(tx, user.companyId, codeKind);
      const created = await tx.inventoryItem.create({ data: { ...parsed.data, abbreviation: parsed.data.abbreviation || null, code, minimumStock: parsed.data.minimumStock, companyId: user.companyId } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "InventoryItem", entityId: created.id, action: "CREATE", afterData: { code: created.code, name: created.name } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "inventory.item-created.v1", aggregateId: created.id, payload: { itemId: created.id, code: created.code } } });
      return created;
    });
    return apiSuccess(item, 201);
  } catch (error) { const response = knownError(error); if (response) return response; throw error; }
}
