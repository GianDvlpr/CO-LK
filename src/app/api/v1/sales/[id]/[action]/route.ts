import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { knownSaleError } from "@/modules/sales/application/sale-http";
import { issueSale, voidSale } from "@/modules/sales/application/sale-service";
import { z } from "zod";

const permissions = { issue: "sales.issue", void: "sales.void" } as const;

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownSaleError(error); if (response) return response; throw error; }
  const { id, action } = await context.params;
  if (!(action in permissions)) return apiError("SALE_ACTION_NOT_FOUND", "La acción solicitada no existe.", 404);
  const typed = action as keyof typeof permissions;
  try {
    const user = await requirePermission(permissions[typed]);
    if (typed === "issue") return apiSuccess(await issueSale(prisma, { companyId: user.companyId, userId: user.id, saleId: id }));
    const body = z.object({ reason: z.string().trim().min(3).max(500).optional() }).safeParse(await request.json().catch(() => ({})));
    if (!body.success) return apiError("VALIDATION_ERROR", "El motivo de anulación no es válido.", 400);
    return apiSuccess(await voidSale(prisma, { companyId: user.companyId, userId: user.id, saleId: id, reason: body.data.reason }));
  } catch (error) {
    const response = knownSaleError(error);
    if (response) return response;
    throw error;
  }
}
