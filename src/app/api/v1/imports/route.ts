import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    const user = await requirePermission("imports.read");
    const items = await prisma.importJob.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "desc" }, take: 50, include: { createdBy: { select: { name: true } }, errors: { orderBy: { rowNumber: "asc" }, take: 20 } } });
    return apiSuccess({ items });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
