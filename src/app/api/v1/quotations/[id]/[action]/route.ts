import { apiError, apiSuccess } from "@/lib/http/api-response";
import { prisma } from "@/lib/database/prisma";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { knownQuotationError } from "@/modules/quotations/application/quotation-http";
import { convertQuotationToOrder, transitionQuotation } from "@/modules/quotations/application/quotation-service";

const permissions = {
  send: "quotations.send",
  approve: "quotations.approve",
  reject: "quotations.reject",
  convert: "quotations.convert",
} as const;

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownQuotationError(error); if (response) return response; throw error; }
  const { id, action } = await context.params;
  if (!(action in permissions)) return apiError("QUOTATION_ACTION_NOT_FOUND", "La acción solicitada no existe.", 404);
  const typedAction = action as keyof typeof permissions;
  try {
    const user = await requirePermission(permissions[typedAction]);
    if (typedAction === "convert") return apiSuccess(await convertQuotationToOrder(prisma, { companyId: user.companyId, userId: user.id, quotationId: id }));
    return apiSuccess(await transitionQuotation(prisma, { companyId: user.companyId, userId: user.id, quotationId: id, transition: typedAction }));
  } catch (error) {
    const response = knownQuotationError(error);
    if (response) return response;
    throw error;
  }
}
