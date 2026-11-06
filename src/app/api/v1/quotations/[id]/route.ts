import { apiError, apiSuccess } from "@/lib/http/api-response";
import { prisma } from "@/lib/database/prisma";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { knownQuotationError, quotationInputSchema } from "@/modules/quotations/application/quotation-http";
import { updateQuotation } from "@/modules/quotations/application/quotation-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownQuotationError(error); if (response) return response; throw error; }
  const parsed = quotationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "La cotización contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("quotations.update");
    const { id } = await context.params;
    return apiSuccess(await updateQuotation(prisma, { ...parsed.data, quotationId: id, companyId: user.companyId, userId: user.id }));
  } catch (error) {
    const response = knownQuotationError(error);
    if (response) return response;
    throw error;
  }
}
