import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const schema = z.object({ name: z.string().trim().min(1).max(150), unitId: z.uuid(), minimumStock: z.union([z.string(), z.number()]), lotTrackingMode: z.enum(["NONE", "OPTIONAL", "REQUIRED"]), active: z.boolean().default(true) });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request); const user = await requirePermission("inventory.create_item"); const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "El ítem contiene datos inválidos.", 400);
    const { id } = await context.params; const [item, unit] = await Promise.all([prisma.inventoryItem.findFirst({ where: { id, companyId: user.companyId } }), prisma.unitOfMeasure.findFirst({ where: { id: parsed.data.unitId, companyId: user.companyId } })]);
    if (!item) return apiError("INVENTORY_NOT_FOUND", "El ítem no existe.", 404); if (!unit) return apiError("INVENTORY_INVALID_UNIT", "La unidad no es válida.", 422);
    const hasMovements = await prisma.stockMovement.count({ where: { itemId: id } });
    if (hasMovements && (item.unitId !== parsed.data.unitId || item.lotTrackingMode !== parsed.data.lotTrackingMode)) return apiError("INVENTORY_IMMUTABLE_STOCK_FIELDS", "No puedes cambiar la unidad o el control de lotes porque el ítem ya tiene movimientos.", 422);
    const updated = await prisma.$transaction(async (tx) => { const value = await tx.inventoryItem.update({ where: { id }, data: parsed.data }); await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "InventoryItem", entityId: id, action: "UPDATE", beforeData: { name: item.name, unitId: item.unitId, minimumStock: item.minimumStock.toString(), lotTrackingMode: item.lotTrackingMode, active: item.active }, afterData: parsed.data } }); return value; });
    return apiSuccess(updated);
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
