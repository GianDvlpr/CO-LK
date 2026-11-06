import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { createSale } from "@/modules/sales/application/sale-service";
import { knownSaleError, saleInputSchema } from "@/modules/sales/application/sale-http";

const include = {
  customer: { select: { id: true, code: true, name: true, taxId: true, fiscalAddress: true } },
  currency: { select: { id: true, code: true, name: true, symbol: true, isBase: true } },
  salesOrders: { include: { salesOrder: { select: { id: true, number: true } } }, orderBy: { salesOrder: { number: "asc" } } },
  lines: { include: { productVariant: { include: { product: { select: { code: true, name: true } }, size: { select: { name: true } }, color: { select: { name: true } }, secondaryColor: { select: { name: true } } } } } },
  payments: { include: { createdBy: { select: { name: true, username: true } } }, orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.SaleInclude;

export async function GET(request: Request) {
  try {
    const user = await requirePermission("sales.read");
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const issueDate = from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}) } : undefined;
    const items = await prisma.sale.findMany({ where: { companyId: user.companyId, issueDate }, orderBy: { createdAt: "desc" }, include });
    return apiSuccess({ items });
  } catch (error) {
    const response = knownSaleError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = knownSaleError(error); if (response) return response; throw error; }
  const parsed = saleInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "La venta contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("sales.create");
    return apiSuccess(await createSale(prisma, { ...parsed.data, companyId: user.companyId, userId: user.id }), 201);
  } catch (error) {
    const response = knownSaleError(error);
    if (response) return response;
    throw error;
  }
}
