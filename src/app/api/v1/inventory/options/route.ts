import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    const user = await requirePermission("inventory.read");
    const [units, warehouses, items, suppliers, currencies, company] = await prisma.$transaction([
      prisma.unitOfMeasure.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, symbol: true } }),
      prisma.warehouse.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
      prisma.inventoryItem.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, type: true, lotTrackingMode: true, defaultWarehouseId: true, unit: { select: { symbol: true } } } }),
      prisma.supplier.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
      prisma.currency.findMany({ where: { companyId: user.companyId }, orderBy: [{ isBase: "desc" }, { code: "asc" }], select: { id: true, code: true, name: true, symbol: true, isBase: true } }),
      prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { igvRate: true } }),
    ]);
    return apiSuccess({ units, warehouses, items, suppliers, currencies, igvRate: company.igvRate.toString() });
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
