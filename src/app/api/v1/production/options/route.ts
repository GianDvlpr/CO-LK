import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    const user = await requirePermission("production.read");
    const [warehouses, variants, recipes, machines] = await prisma.$transaction([
      prisma.warehouse.findMany({ where: { companyId: user.companyId, active: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      prisma.productVariant.findMany({ where: { active: true, product: { companyId: user.companyId, active: true } }, include: { product: { select: { id: true, code: true, name: true } }, size: { select: { name: true } }, color: { select: { name: true } } }, orderBy: { sku: "asc" } }),
      prisma.recipe.findMany({ where: { companyId: user.companyId, status: "ACTIVE" }, include: { product: { select: { id: true, code: true, name: true } }, versions: { where: { isActive: true }, select: { id: true, version: true, yieldQuantity: true }, take: 1 } }, orderBy: { name: "asc" } }),
      prisma.machine.findMany({ where: { companyId: user.companyId, status: { not: "OUT_OF_SERVICE" } }, select: { id: true, code: true, name: true, type: true, status: true }, orderBy: { code: "asc" } }),
    ]);
    return apiSuccess({ warehouses, variants, recipes, machines });
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
