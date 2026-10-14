import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("inventory.read");
    const url = new URL(request.url);
    const itemId = url.searchParams.get("itemId") || undefined;
    const warehouseId = url.searchParams.get("warehouseId") || undefined;
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 30)));
    const where = { item: { companyId: user.companyId }, itemId, warehouseId };
    const [items, total] = await prisma.$transaction([
      prisma.stockMovement.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ postedAt: "desc" }, { postingSequence: "desc" }], include: { item: { select: { code: true, name: true, unit: { select: { symbol: true } } } }, warehouse: { select: { code: true, name: true } }, lot: { select: { lotCode: true } } } }),
      prisma.stockMovement.count({ where }),
    ]);
    return apiSuccess({ items: items.map((item) => ({ ...item, postingSequence: item.postingSequence.toString() })), page, pageSize, total });
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
