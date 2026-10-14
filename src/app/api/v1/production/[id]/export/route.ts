import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { buildProductionOrderWorkbook } from "@/modules/production/application/production-order-workbook";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("production.read");
    const { id } = await context.params;
    const order = await prisma.productionOrder.findFirst({
      where: { id, companyId: user.companyId },
      include: { productVariant: { include: { product: { select: { name: true } }, size: { select: { name: true } }, color: { select: { name: true } } } } },
    });
    if (!order) return apiError("PRODUCTION_NOT_FOUND", "La orden no existe.", 404);
    const workbook = await buildProductionOrderWorkbook(order);
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `orden-produccion-${order.number.replace(/[^a-zA-Z0-9-_]/g, "-")}.xlsx`;
    return new Response(buffer, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
