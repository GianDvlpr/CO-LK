import { prisma } from "@/lib/database/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { getElectronicDocumentDetail } from "@/modules/electronic-billing/application/electronic-document-service";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("sales.read");
    const { id } = await context.params;
    return apiSuccess(await getElectronicDocumentDetail(prisma, user.companyId, id));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
