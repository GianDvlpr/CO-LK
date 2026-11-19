import { prisma } from "@/lib/database/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { getSunatServiceMonitor } from "@/modules/electronic-billing/application/electronic-document-service";

export async function GET() {
  try {
    const user = await requirePermission("sales.read");
    return apiSuccess(await getSunatServiceMonitor(prisma, user.companyId));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
