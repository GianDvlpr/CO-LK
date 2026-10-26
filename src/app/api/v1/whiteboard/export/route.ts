import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { exportWhiteboardSchema } from "@/modules/whiteboard/domain/whiteboard-schema";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("whiteboard.read");
    const parsed = exportWhiteboardSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La pizarra seleccionada no es válida.", 400);
    const board = await prisma.whiteboard.findFirst({ where: { id: parsed.data.id, companyId: user.companyId }, select: { id: true, revision: true, title: true } });
    if (!board) return apiError("WHITEBOARD_NOT_FOUND", "La pizarra ya no existe.", 404);
    await prisma.auditLog.create({ data: {
      companyId: user.companyId,
      userId: user.id,
      module: "whiteboard",
      entity: "Whiteboard",
      entityId: board.id,
      action: "EXPORT",
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      requestPath: new URL(request.url).pathname,
      afterData: { format: "PNG", revision: board.revision, title: board.title },
    } });
    return apiSuccess({ recorded: true }, 201);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
