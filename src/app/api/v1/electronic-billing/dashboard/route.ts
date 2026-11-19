import { prisma } from "@/lib/database/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { getFiscalDashboard } from "@/modules/electronic-billing/application/electronic-document-service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("sales.read");
    const month = new URL(request.url).searchParams.get("month") ?? undefined;
    return apiSuccess(await getFiscalDashboard(prisma, user.companyId, month));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
