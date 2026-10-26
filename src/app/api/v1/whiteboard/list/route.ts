import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    const user = await requirePermission("whiteboard.read");
    const boards = await prisma.whiteboard.findMany({
      where: { companyId: user.companyId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        revision: true,
        createdAt: true,
        updatedAt: true,
        updatedBy: { select: { name: true, username: true } },
      },
    });
    return apiSuccess(boards);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
