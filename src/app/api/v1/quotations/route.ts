import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { createQuotation } from "@/modules/quotations/application/quotation-service";
import { knownQuotationError, quotationInputSchema } from "@/modules/quotations/application/quotation-http";
import { effectiveQuotationStatus } from "@/modules/quotations/domain/quotation-calculations";

const include = {
  customer: { select: { id: true, code: true, name: true, taxId: true, fiscalAddress: true } },
  currency: { select: { id: true, code: true, name: true, symbol: true, isBase: true } },
  salesOrder: { select: { id: true, number: true } },
  lines: {
    include: {
      productVariant: {
        include: {
          product: { select: { code: true, name: true } },
          size: { select: { name: true } },
          color: { select: { name: true } },
          secondaryColor: { select: { name: true } },
        },
      },
    },
  },
} as const;

export async function GET() {
  try {
    const user = await requirePermission("quotations.read");
    const records = await prisma.quotation.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "desc" }, include });
    return apiSuccess({ items: records.map((record) => ({ ...record, status: effectiveQuotationStatus(record.status, record.validUntil) })) });
  } catch (error) {
    const response = knownQuotationError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = knownQuotationError(error); if (response) return response; throw error; }
  const parsed = quotationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "La cotización contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("quotations.create");
    return apiSuccess(await createQuotation(prisma, { ...parsed.data, companyId: user.companyId, userId: user.id }), 201);
  } catch (error) {
    const response = knownQuotationError(error);
    if (response) return response;
    throw error;
  }
}
