import { prisma } from "@/lib/database/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { refreshElectronicDocument } from "@/modules/electronic-billing/application/electronic-document-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownElectronicBillingError(error); if (response) return response; throw error; }
  try {
    const user = await requirePermission("sales.read");
    const { id } = await context.params;
    return apiSuccess(await refreshElectronicDocument(prisma, user.companyId, id));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
