import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const updateSchema = z.object({ igvRate: z.union([z.string(), z.number()]) });

export async function GET() {
  try {
    const user = await requirePermission("catalogs.read");
    const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { igvRate: true } });
    return apiSuccess({ igvRate: company.igvRate.toString() });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}

export async function PATCH(request: Request) {
  try { requireSameOrigin(request); } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "La configuración contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("catalogs.manage");
    const igvRate = new Decimal(parsed.data.igvRate);
    if (!igvRate.isFinite() || igvRate.isNegative() || igvRate.greaterThan(100)) return apiError("INVALID_IGV_RATE", "El IGV debe estar entre 0 y 100.", 422);
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { igvRate: true } });
      const company = await tx.company.update({ where: { id: user.companyId }, data: { igvRate: igvRate.toString() }, select: { igvRate: true } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "Company", entityId: user.companyId, action: "UPDATE", beforeData: { igvRate: before.igvRate.toString() }, afterData: { igvRate: company.igvRate.toString() } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "company.settings-updated.v1", aggregateId: user.companyId, payload: { igvRate: company.igvRate.toString() } } });
      return company;
    });
    return apiSuccess({ igvRate: updated.igvRate.toString() });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
