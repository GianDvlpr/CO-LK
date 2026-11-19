import { prisma } from "@/lib/database/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { resendElectronicDocument } from "@/modules/electronic-billing/application/electronic-document-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownElectronicBillingError(error); if (response) return response; throw error; }
  try {
    const user = await requirePermission("sales.issue");
    const { id } = await context.params;
    return apiSuccess(await resendElectronicDocument(prisma, { companyId: user.companyId, userId: user.id, documentId: id }));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
