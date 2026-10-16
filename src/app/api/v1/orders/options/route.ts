import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    const user = await requirePermission("orders.read");
    const [customers, variants] = await prisma.$transaction([
      prisma.customer.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, taxId: true } }),
      prisma.productVariant.findMany({ where: { active: true, product: { companyId: user.companyId, active: true } }, orderBy: { sku: "asc" }, include: { product: { select: { code: true, name: true } }, size: { select: { name: true } }, color: { select: { name: true } }, inventoryItem: { select: { unit: { select: { symbol: true } } } } } }),
    ]);
    return apiSuccess({ customers, variants });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
