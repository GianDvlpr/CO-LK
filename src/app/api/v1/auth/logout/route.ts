import { apiError, apiSuccess } from "@/lib/http/api-response";
import { prisma } from "@/lib/database/prisma";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { deleteCurrentSession, requireUser } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "sessions", entity: "Session", entityId: user.sessionId, action: "LOGOUT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: "/api/v1/auth/logout" } });
    await deleteCurrentSession();
    return apiSuccess({ loggedOut: true });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
