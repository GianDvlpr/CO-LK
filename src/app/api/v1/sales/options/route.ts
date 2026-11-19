import { prisma } from "@/lib/database/prisma";
import { readServerEnv } from "@/lib/env/server";
import { apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownSaleError } from "@/modules/sales/application/sale-http";
import { getRemoteBillingSeries } from "@/modules/electronic-billing/application/electronic-document-service";

export async function GET() {
  try {
    const user = await requirePermission("sales.read");
    const [company, currencies, orders] = await prisma.$transaction([
      prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { igvRate: true, taxId: true } }),
      prisma.currency.findMany({ where: { companyId: user.companyId }, orderBy: [{ isBase: "desc" }, { code: "asc" }], include: { exchangeRates: { orderBy: { rateDate: "desc" }, take: 1, select: { rate: true, rateDate: true } } } }),
      prisma.salesOrder.findMany({
        where: { companyId: user.companyId, status: "DISPATCHED" }, orderBy: { requestedAt: "desc" },
        include: {
          customer: { select: { id: true, code: true, name: true } }, saleLinks: { select: { saleId: true } },
          pickPackOrder: { select: { status: true, lines: { include: { salesOrderLine: { select: { unitPrice: true, productVariantId: true, productVariant: { include: { product: { select: { code: true, name: true } }, size: { select: { name: true } }, color: { select: { name: true } }, secondaryColor: { select: { name: true } } } } } } } } } },
        },
      }),
    ]);
    const env = readServerEnv();
    const enabled = Boolean(env.SUNAT_BILLING_API_KEY && env.SUNAT_BILLING_API_SECRET && company.taxId === env.SUNAT_BILLING_COMPANY_RUC);
    let series = [] as Awaited<ReturnType<typeof getRemoteBillingSeries>>;
    let seriesError: string | null = null;
    if (enabled) {
      try {
        series = await getRemoteBillingSeries(company.taxId);
      } catch (error) {
        seriesError = error instanceof Error ? error.message : "No se pudieron sincronizar las series.";
      }
    }
    return apiSuccess({
      igvRate: company.igvRate,
      currencies,
      orders,
      electronicBilling: {
        enabled,
        series,
        seriesError,
      },
    });
  } catch (error) {
    const response = knownSaleError(error);
    if (response) return response;
    throw error;
  }
}
