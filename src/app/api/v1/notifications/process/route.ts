import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { processCompanyOutbox } from "@/modules/notifications/application/process-outbox";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("dashboard.read");
    return apiSuccess(await processCompanyOutbox(prisma, user.companyId));
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
