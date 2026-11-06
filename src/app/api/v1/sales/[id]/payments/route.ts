import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { knownSaleError, paymentInputSchema } from "@/modules/sales/application/sale-http";
import { addSalePayment } from "@/modules/sales/application/sale-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownSaleError(error); if (response) return response; throw error; }
  const parsed = paymentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "El pago contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("sales.payment");
    const { id } = await context.params;
    return apiSuccess(await addSalePayment(prisma, { ...parsed.data, saleId: id, companyId: user.companyId, userId: user.id }), 201);
  } catch (error) {
    const response = knownSaleError(error);
    if (response) return response;
    throw error;
  }
}
