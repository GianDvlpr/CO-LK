import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { deleteElectronicDocumentPayment } from "@/modules/electronic-billing/application/electronic-document-service";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; paymentId: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownElectronicBillingError(error); if (response) return response; throw error; }
  try {
    const user = await requirePermission("sales.payment");
    const { id, paymentId } = await context.params;
    const numericId = Number(paymentId);
    if (!Number.isInteger(numericId) || numericId <= 0) return apiError("VALIDATION_ERROR", "El identificador del pago no es válido.", 400);
    return apiSuccess(await deleteElectronicDocumentPayment(prisma, { companyId: user.companyId, userId: user.id, documentId: id, paymentId: numericId }));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
