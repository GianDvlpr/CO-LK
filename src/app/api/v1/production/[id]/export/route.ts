import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { buildProductionOrderPdf } from "@/modules/production/application/production-order-pdf";
import { buildProductionOrderWorkbook } from "@/modules/production/application/production-order-workbook";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("production.read");
    const { id } = await context.params;
    const order = await prisma.productionOrder.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        machine: { select: { code: true, name: true } },
        salesOrders: { select: { salesOrder: { select: { number: true } } }, orderBy: { salesOrder: { number: "asc" } } },
        materialItem: { select: { code: true, name: true } },
        recipeVersion: { select: { recipe: { select: { code: true, name: true } } } },
        secondaryRecipeVersion: { select: { recipe: { select: { code: true, name: true } } } },
        productVariant: { include: { product: { select: { code: true, matrixCode: true, name: true } }, size: { select: { name: true } }, color: { select: { code: true, name: true } }, secondaryColor: { select: { code: true, name: true } } } },
        components: { include: { item: { select: { code: true, name: true, unit: { select: { symbol: true } } } } } },
      },
    });
    if (!order) return apiError("PRODUCTION_NOT_FOUND", "La orden no existe.", 404);
    if (order.targetType !== "PRODUCT" || !order.productVariant) return apiError("PRODUCTION_FORMAT_UNAVAILABLE", "El formato A5 por talla solo aplica a productos terminados.", 422);
    const documentOrder = { ...order, productVariant: order.productVariant };
    const baseName = `orden-produccion-${order.number.replace(/[^a-zA-Z0-9-_]/g, "-")}`;
    const format = new URL(request.url).searchParams.get("format")?.toLowerCase();
    if (format === "pdf") {
      const pdf = await buildProductionOrderPdf(documentOrder);
      await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "production", entity: "ProductionOrder", entityId: order.id, action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { number: order.number, format: "PDF" } } });
      return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${baseName}.pdf"`, "cache-control": "no-store" } });
    }
    const workbook = await buildProductionOrderWorkbook(documentOrder);
    const buffer = await workbook.xlsx.writeBuffer();
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "production", entity: "ProductionOrder", entityId: order.id, action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { number: order.number, format: "XLSX" } } });
    return new Response(buffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${baseName}.xlsx"`, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
