import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { knownQuotationError } from "@/modules/quotations/application/quotation-http";
import { buildQuotationPdf } from "@/modules/quotations/application/quotation-pdf";
import { effectiveQuotationStatus } from "@/modules/quotations/domain/quotation-calculations";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("quotations.print");
    const { id } = await context.params;
    const record = await prisma.quotation.findFirst({
      where: { id, companyId: user.companyId },
      include: { company: true, customer: true, currency: true, lines: { include: { productVariant: { include: { product: true, size: true, color: true, secondaryColor: true } } }, orderBy: { productVariant: { sku: "asc" } } } },
    });
    if (!record) return apiError("QUOTATION_NOT_FOUND", "La cotización no existe.", 404);
    const pdf = await buildQuotationPdf({ ...record, status: effectiveQuotationStatus(record.status, record.validUntil) });
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "quotations", entity: "Quotation", entityId: record.id, action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { number: record.number, format: "PDF" } } });
    return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="cotizacion-${record.number}.pdf"`, "cache-control": "no-store" } });
  } catch (error) {
    const response = knownQuotationError(error);
    if (response) return response;
    throw error;
  }
}
