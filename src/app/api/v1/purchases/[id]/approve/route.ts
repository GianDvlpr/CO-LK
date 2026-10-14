import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { approvePurchase } from "@/modules/purchases/application/approve-purchase";
import { PurchaseApplicationError } from "@/modules/purchases/application/purchase-errors";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ comment: z.string().trim().max(500).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!params.success || !body.success) return apiError("VALIDATION_ERROR", "Solicitud de aprobación inválida.", 400);
  try {
    const user = await requirePermission("purchases.approve");
    const purchase = await approvePurchase(prisma, {
      companyId: user.companyId, purchaseId: params.data.id, approvedById: user.id, comment: body.data.comment,
    });
    return apiSuccess(purchase);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof PurchaseApplicationError) {
      return apiError(error.code, error.message, error.code === "PURCHASE_NOT_FOUND" ? 404 : 422);
    }
    throw error;
  }
}
