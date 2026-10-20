import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { completeInventoryTransformation, InventoryTransformationError } from "@/modules/inventory/application/inventory-transformation-service";

const schema = z.object({ actualOutputQuantity: z.union([z.string(), z.number()]), actualWasteQuantity: z.union([z.string(), z.number()]).optional() });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); const user = await requirePermission("inventory.create_item"); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("VALIDATION_ERROR", "Las cantidades no son válidas.", 400); const { id } = await context.params; return apiSuccess(await completeInventoryTransformation(prisma, { companyId: user.companyId, userId: user.id, id, ...parsed.data })); }
  catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); if (error instanceof InventoryTransformationError) return apiError(error.code, error.message, 422); throw error; }
}
