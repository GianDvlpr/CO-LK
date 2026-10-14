import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    const user = await requirePermission("purchases.create");
    const [suppliers, warehouses, currencies, items] = await prisma.$transaction([
      prisma.supplier.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
      prisma.warehouse.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
      prisma.currency.findMany({ where: { companyId: user.companyId }, orderBy: [{ isBase: "desc" }, { code: "asc" }], select: { id: true, code: true, name: true, isBase: true } }),
      prisma.inventoryItem.findMany({
        where: { companyId: user.companyId, active: true, type: "RAW_MATERIAL" }, orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, lotTrackingMode: true, unit: { select: { symbol: true } } },
      }),
    ]);
    return apiSuccess({ suppliers, warehouses, currencies, items });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
