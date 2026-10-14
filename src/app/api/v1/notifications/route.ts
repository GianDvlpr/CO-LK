import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { notificationTypesForPermissions } from "@/modules/notifications/domain/notification-content";

export async function GET() {
  try {
    const user = await requirePermission("dashboard.read");
    const where = { companyId: user.companyId, type: { in: notificationTypesForPermissions(user.permissions) }, OR: [{ userId: null }, { userId: user.id }] };
    const [items, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return apiSuccess({ items, unreadCount });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
