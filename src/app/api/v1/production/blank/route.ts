import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { buildBlankProductionOrderPdf } from "@/modules/production/application/production-order-pdf";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("production.read");
    const pdf = await buildBlankProductionOrderPdf();
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "production", entity: "ProductionOrder", entityId: "blank", action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { format: "PDF_BLANK" } } });
    return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="formato-orden-produccion-en-blanco.pdf"`, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
