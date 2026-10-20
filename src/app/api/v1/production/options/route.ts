import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    const user = await requirePermission("production.read");
    const [warehouses, variants, recipes, machines, materials, salesOrders] = await prisma.$transaction([
      prisma.warehouse.findMany({ where: { companyId: user.companyId, active: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      prisma.productVariant.findMany({ where: { active: true, product: { companyId: user.companyId, active: true } }, include: { product: { select: { id: true, code: true, matrixCode: true, name: true } }, size: { select: { id: true, code: true, name: true, sortOrder: true } }, color: { select: { id: true, code: true, name: true } }, secondaryColor: { select: { id: true, code: true, name: true } } }, orderBy: { sku: "asc" } }),
      prisma.recipe.findMany({ where: { companyId: user.companyId, status: "ACTIVE", productId: { not: null } }, include: { product: { select: { id: true, code: true, name: true } }, versions: { where: { isActive: true }, select: { id: true, version: true, yieldQuantity: true, ingredients: { select: { quantity: true, item: { select: { id: true, code: true, name: true, unit: { select: { symbol: true } } } } } } }, take: 1 } }, orderBy: { name: "asc" } }),
      prisma.machine.findMany({ where: { companyId: user.companyId, status: { not: "OUT_OF_SERVICE" } }, select: { id: true, code: true, name: true, type: true, status: true }, orderBy: { code: "asc" } }),
      prisma.inventoryItem.findMany({ where: { companyId: user.companyId, active: true, type: { not: "FINISHED_PRODUCT" } }, select: { id: true, code: true, name: true, type: true, unit: { select: { symbol: true } } }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
      prisma.salesOrder.findMany({ where: { companyId: user.companyId, status: { in: ["CONFIRMED", "IN_PRODUCTION"] } }, select: { id: true, number: true, customer: { select: { name: true } }, promisedAt: true, lines: { where: { productionOrderId: null }, select: { id: true, productVariantId: true, quantity: true } } }, orderBy: { requestedAt: "desc" } }),
    ]);
    return apiSuccess({ warehouses, variants, recipes, machines, materials, salesOrders });
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
