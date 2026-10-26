import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    const user = await requirePermission("purchases.create");
    const [suppliers, warehouses, currencies, items, company] = await prisma.$transaction([
      prisma.supplier.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
      prisma.warehouse.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
      prisma.currency.findMany({ where: { companyId: user.companyId }, orderBy: [{ isBase: "desc" }, { code: "asc" }], select: { id: true, code: true, name: true, symbol: true, isBase: true } }),
      prisma.inventoryItem.findMany({
        where: { companyId: user.companyId, active: true, type: "RAW_MATERIAL" }, orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, supplierId: true, lotTrackingMode: true, supplierProductCode: true, referenceNetPrice: true, referenceTaxRate: true, unit: { select: { symbol: true } }, supplier: { select: { id: true, name: true } } },
      }),
      prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { igvRate: true } }),
    ]);
    return apiSuccess({ suppliers, warehouses, currencies, items, igvRate: company.igvRate.toString() });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
