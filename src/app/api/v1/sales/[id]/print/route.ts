import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { knownSaleError } from "@/modules/sales/application/sale-http";
import { buildSalePdf } from "@/modules/sales/application/sale-pdf";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("sales.print");
    const { id } = await context.params;
    const record = await prisma.sale.findFirst({ where: { id, companyId: user.companyId }, include: {
      company: true, customer: true, currency: true,
      salesOrders: { include: { salesOrder: { select: { number: true } } }, orderBy: { salesOrder: { number: "asc" } } },
      lines: { include: { productVariant: { include: { product: true, size: true, color: true, secondaryColor: true } } }, orderBy: { productVariant: { sku: "asc" } } },
      payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }] },
    } });
    if (!record) return apiError("SALE_NOT_FOUND", "La venta no existe.", 404);
    const pdf = await buildSalePdf(record);
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "sales", entity: "Sale", entityId: record.id, action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { number: record.number, format: "PDF" } } });
    return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="venta-${record.number}.pdf"`, "cache-control": "no-store" } });
  } catch (error) {
    const response = knownSaleError(error);
    if (response) return response;
    throw error;
  }
}
