import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { buildBlankProductionOrderPdf } from "@/modules/production/application/production-order-pdf";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("production.read");
    const url = new URL(request.url);
    const layout = url.searchParams.get("layout") === "a4-2up" ? "a4-2up" : "a5";
    const pdf = await buildBlankProductionOrderPdf(layout);
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "production", entity: "ProductionOrder", entityId: "blank", action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: url.pathname, afterData: { format: layout === "a4-2up" ? "PDF_BLANK_A4_2UP" : "PDF_BLANK_A5" } } });
    const filename = layout === "a4-2up" ? "formato-orden-produccion-2-en-a4.pdf" : "formato-orden-produccion-a5.pdf";
    return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
