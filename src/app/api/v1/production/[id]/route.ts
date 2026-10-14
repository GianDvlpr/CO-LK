import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { productionSheetSchema, serializeProductionSheet, validateProductionSheetTotals } from "@/modules/production/domain/production-sheet";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("production.create");
    const parsed = productionSheetSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La ficha contiene datos inválidos.", 400);
    const { id } = await context.params;
    const existing = await prisma.productionOrder.findFirst({ where: { id, companyId: user.companyId }, select: { id: true, plannedQuantity: true } });
    if (!existing) return apiError("PRODUCTION_NOT_FOUND", "La orden no existe.", 404);
    const sheetIssue = validateProductionSheetTotals(parsed.data, existing.plannedQuantity.toString());
    if (sheetIssue) return apiError("PRODUCTION_SHEET_INVALID", sheetIssue, 422);
    const values = serializeProductionSheet(parsed.data);
    const result = await prisma.productionOrder.update({
      where: { id },
      data: { ...values, sizeProgram: values.sizeProgram as Prisma.InputJsonValue, dailyProduction: values.dailyProduction as Prisma.InputJsonValue },
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
