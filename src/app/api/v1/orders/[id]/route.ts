import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { OrderError, updateSalesOrder } from "@/modules/orders/application/order-service";

const decimal = z.union([z.string().min(1), z.number()]);
const schema = z.object({ number: z.string().trim().min(1).max(50), customerId: z.uuid(), requestedAt: z.coerce.date(), promisedAt: z.coerce.date().optional(), notes: z.string().trim().max(500).optional(), lines: z.array(z.object({ productVariantId: z.uuid(), quantity: decimal, unitPrice: decimal })).min(1) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "El pedido contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("orders.update");
    const { id } = await context.params;
    return apiSuccess(await updateSalesOrder(prisma, { ...parsed.data, orderId: id, companyId: user.companyId, userId: user.id }));
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof OrderError) return apiError(error.code, error.message, error.code === "ORDER_NOT_FOUND" ? 404 : 422);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("ORDER_DUPLICATE", "El número de pedido ya existe.", 409);
    throw error;
  }
}
