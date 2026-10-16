import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { lookupRuc, RucLookupError } from "@/modules/catalogs/application/ruc-lookup";

const schema = z.object({ ruc: z.string().trim().length(11) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("catalogs.manage");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("INVALID_RUC", "Ingresa un RUC peruano válido de 11 dígitos.", 400);
    const result = await lookupRuc(parsed.data.ruc);
    await prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "TaxpayerLookup",
        entityId: result.ruc,
        action: "LOOKUP",
        afterData: { source: result.source, status: result.status, condition: result.condition, consultedAt: result.consultedAt },
      },
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof RucLookupError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
