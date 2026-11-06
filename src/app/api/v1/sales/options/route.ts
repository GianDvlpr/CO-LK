import { prisma } from "@/lib/database/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownSaleError } from "@/modules/sales/application/sale-http";

export async function GET() {
  try {
    const user = await requirePermission("sales.read");
    const [company, currencies, orders] = await prisma.$transaction([
      prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { igvRate: true } }),
      prisma.currency.findMany({ where: { companyId: user.companyId }, orderBy: [{ isBase: "desc" }, { code: "asc" }], include: { exchangeRates: { orderBy: { rateDate: "desc" }, take: 1, select: { rate: true, rateDate: true } } } }),
      prisma.salesOrder.findMany({
        where: { companyId: user.companyId, status: "DISPATCHED" }, orderBy: { requestedAt: "desc" },
        include: {
          customer: { select: { id: true, code: true, name: true } }, saleLinks: { select: { saleId: true } },
          pickPackOrder: { select: { status: true, lines: { include: { salesOrderLine: { select: { unitPrice: true, productVariantId: true, productVariant: { include: { product: { select: { code: true, name: true } }, size: { select: { name: true } }, color: { select: { name: true } }, secondaryColor: { select: { name: true } } } } } } } } } },
        },
      }),
    ]);
    return apiSuccess({ igvRate: company.igvRate, currencies, orders });
  } catch (error) {
    const response = knownSaleError(error);
    if (response) return response;
    throw error;
  }
}
