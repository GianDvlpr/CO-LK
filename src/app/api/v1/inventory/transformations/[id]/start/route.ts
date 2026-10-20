import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { InventoryTransformationError, startInventoryTransformation } from "@/modules/inventory/application/inventory-transformation-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); const user = await requirePermission("inventory.create_item"); const { id } = await context.params; return apiSuccess(await startInventoryTransformation(prisma, { companyId: user.companyId, userId: user.id, id })); }
  catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); if (error instanceof InventoryTransformationError) return apiError(error.code, error.message, 422); throw error; }
}
