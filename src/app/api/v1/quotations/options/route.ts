import { prisma } from "@/lib/database/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownQuotationError } from "@/modules/quotations/application/quotation-http";

export async function GET() {
  try {
    const user = await requirePermission("quotations.read");
    const [company, customers, currencies, variants] = await prisma.$transaction([
      prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { igvRate: true } }),
      prisma.customer.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, taxId: true } }),
      prisma.currency.findMany({ where: { companyId: user.companyId }, orderBy: [{ isBase: "desc" }, { code: "asc" }], include: { exchangeRates: { orderBy: { rateDate: "desc" }, take: 1, select: { rate: true, rateDate: true } } } }),
      prisma.productVariant.findMany({ where: { active: true, product: { companyId: user.companyId, active: true } }, orderBy: { sku: "asc" }, include: { product: { select: { code: true, name: true } }, size: { select: { name: true } }, color: { select: { name: true } }, secondaryColor: { select: { name: true } }, inventoryItem: { select: { unit: { select: { symbol: true } } } } } }),
    ]);
    return apiSuccess({ igvRate: company.igvRate, customers, currencies, variants });
  } catch (error) {
    const response = knownQuotationError(error);
    if (response) return response;
    throw error;
  }
}
