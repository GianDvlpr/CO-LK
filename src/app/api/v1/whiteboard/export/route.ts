import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("whiteboard.read");
    const board = await prisma.whiteboard.findUnique({ where: { companyId: user.companyId }, select: { id: true, revision: true } });
    await prisma.auditLog.create({ data: {
      companyId: user.companyId,
      userId: user.id,
      module: "whiteboard",
      entity: "Whiteboard",
      entityId: board?.id ?? user.companyId,
      action: "EXPORT",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      requestPath: new URL(request.url).pathname,
      afterData: { format: "PNG", revision: board?.revision ?? 0 },
    } });
    return apiSuccess({ recorded: true }, 201);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
