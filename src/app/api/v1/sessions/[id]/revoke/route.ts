import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const actor = await requirePermission("sessions.revoke");
    const { id } = await context.params;
    if (id === actor.sessionId) return apiError("SESSION_SELF_REVOKE", "Usa la opción Cerrar sesión para finalizar tu propia sesión.", 422);

    const target = await prisma.session.findFirst({
      where: { id, user: { companyId: actor.companyId } },
      select: { id: true, userId: true, endedAt: true, expiresAt: true, user: { select: { username: true } } },
    });
    if (!target) return apiError("SESSION_NOT_FOUND", "La sesión no existe.", 404);
    if (target.endedAt || target.expiresAt <= new Date()) return apiError("SESSION_ALREADY_CLOSED", "La sesión ya está cerrada.", 409);

    const endedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        where: { id: target.id, endedAt: null, expiresAt: { gt: endedAt } },
        data: { endedAt, endReason: "REVOKED", endedById: actor.id },
      });
      if (!updated.count) throw new Error("SESSION_ALREADY_CLOSED");
      await tx.auditLog.create({
        data: {
          companyId: actor.companyId,
          userId: actor.id,
          entity: "Session",
          entityId: target.id,
          action: "REVOKE",
          beforeData: { userId: target.userId, username: target.user.username, active: true },
          afterData: { active: false, endedAt },
        },
      });
    });

    return apiSuccess({ id: target.id, endedAt, endReason: "REVOKED" });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_ALREADY_CLOSED") return apiError("SESSION_ALREADY_CLOSED", "La sesión ya está cerrada.", 409);
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
