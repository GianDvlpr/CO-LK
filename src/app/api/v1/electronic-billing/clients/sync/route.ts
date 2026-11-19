import { prisma } from "@/lib/database/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { syncRemoteClients } from "@/modules/electronic-billing/application/electronic-document-service";

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = knownElectronicBillingError(error); if (response) return response; throw error; }
  try {
    const user = await requirePermission("catalogs.manage");
    return apiSuccess(await syncRemoteClients(prisma, { companyId: user.companyId, userId: user.id }));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
