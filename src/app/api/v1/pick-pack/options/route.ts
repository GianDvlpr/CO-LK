import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    const user = await requirePermission("pick_pack.read");
    const [orders, users] = await prisma.$transaction([
      prisma.salesOrder.findMany({ where: { companyId: user.companyId, status: "CONFIRMED", pickPackOrder: null }, orderBy: { requestedAt: "asc" }, include: { customer: { select: { code: true, name: true } }, lines: { select: { quantity: true } } } }),
      prisma.user.findMany({ where: { companyId: user.companyId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true } }),
    ]);
    return apiSuccess({ orders, users });
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
