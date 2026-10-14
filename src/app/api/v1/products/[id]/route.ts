import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const schema = z.object({ name: z.string().trim().min(1).max(150), description: z.string().trim().max(500).optional(), active: z.boolean() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); const user = await requirePermission("products.update"); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("VALIDATION_ERROR", "El producto contiene datos inválidos.", 400); const { id } = await context.params; const product = await prisma.product.findFirst({ where: { id, companyId: user.companyId } }); if (!product) return apiError("PRODUCT_NOT_FOUND", "El producto no existe.", 404); const updated = await prisma.$transaction(async (tx) => { const value = await tx.product.update({ where: { id }, data: { ...parsed.data, description: parsed.data.description || null } }); await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "Product", entityId: id, action: "UPDATE", beforeData: { name: product.name, description: product.description, active: product.active }, afterData: parsed.data } }); return value; }); return apiSuccess(updated); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
