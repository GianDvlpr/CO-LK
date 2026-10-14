import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { notificationTypesForPermissions } from "@/modules/notifications/domain/notification-content";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("dashboard.read");
    const { id } = await context.params;
    const result = await prisma.notification.updateMany({ where: { id, companyId: user.companyId, type: { in: notificationTypesForPermissions(user.permissions) }, OR: [{ userId: null }, { userId: user.id }] }, data: { readAt: new Date() } });
    if (!result.count) return apiError("NOTIFICATION_NOT_FOUND", "La notificación no existe.", 404);
    return apiSuccess({ id });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
