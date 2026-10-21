import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { buildPickPackPdf } from "@/modules/pick-pack/application/pick-pack-pdf";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("pick_pack.print");
    const { id } = await context.params;
    const record = await prisma.pickPackOrder.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        company: true,
        warehouse: true,
        salesOrder: { include: { customer: true } },
        lines: {
          include: { salesOrderLine: { include: { productVariant: { include: { product: true, size: true, color: true, inventoryItem: { include: { unit: true } } } } } } },
          orderBy: { salesOrderLine: { productVariant: { sku: "asc" } } },
        },
        packages: { orderBy: { packageNumber: "asc" } },
      },
    });
    if (!record) return apiError("PICK_PACK_NOT_FOUND", "La orden de preparación no existe.", 404);
    const pdf = await buildPickPackPdf(record);
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "pick_pack", entity: "PickPackOrder", entityId: record.id, action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { number: record.number, format: "PDF" } } });
    const baseName = `pick-pack-${record.number.replace(/[^a-zA-Z0-9-_]/g, "-")}`;
    return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${baseName}.pdf"`, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
