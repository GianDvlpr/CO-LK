import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { notificationTypesForPermissions } from "@/modules/notifications/domain/notification-content";

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("dashboard.read");
    const result = await prisma.notification.updateMany({ where: { companyId: user.companyId, type: { in: notificationTypesForPermissions(user.permissions) }, OR: [{ userId: null }, { userId: user.id }], readAt: null }, data: { readAt: new Date() } });
    return apiSuccess({ updated: result.count });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
