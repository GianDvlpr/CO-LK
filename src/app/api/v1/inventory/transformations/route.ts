import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { createInventoryTransformation, InventoryTransformationError } from "@/modules/inventory/application/inventory-transformation-service";

const schema = z.object({ warehouseId: z.uuid(), formulaVersionId: z.uuid(), plannedOutputQuantity: z.union([z.string(), z.number()]), outputLotCode: z.string().trim().max(100).optional(), notes: z.string().trim().max(500).optional() });
function failure(error: unknown) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); if (error instanceof InventoryTransformationError) return apiError(error.code, error.message, 422); return null; }

export async function GET() {
  try {
    const user = await requirePermission("inventory.read");
    const items = await prisma.inventoryTransformation.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "desc" }, include: { warehouse: true, formulaVersion: { include: { formula: { include: { outputItem: { include: { unit: true } } } } } }, materials: { include: { item: { include: { unit: true } } }, orderBy: { item: { code: "asc" } } } } });
    return apiSuccess({ items });
  } catch (error) { const response = failure(error); if (response) return response; throw error; }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request); const user = await requirePermission("inventory.create_item"); const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La orden contiene datos inválidos.", 400);
    const item = await createInventoryTransformation(prisma, { companyId: user.companyId, userId: user.id, ...parsed.data });
    return apiSuccess(item, 201);
  } catch (error) { const response = failure(error); if (response) return response; throw error; }
}
