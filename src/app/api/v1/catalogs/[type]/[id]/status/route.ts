import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";

const schema = z.object({ active: z.boolean() });
const supported = ["SUPPLIER", "CUSTOMER"] as const;

export async function PATCH(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("catalogs.manage");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "El estado indicado no es válido.", 400);

    const params = await context.params;
    const type = params.type.toUpperCase() as typeof supported[number];
    if (!supported.includes(type)) return apiError("CATALOG_STATUS_UNSUPPORTED", "Este catálogo no admite esta acción.", 400);

    const result = await prisma.$transaction(async (tx) => {
      const current = type === "SUPPLIER"
        ? await tx.supplier.findFirst({ where: { id: params.id, companyId: user.companyId }, select: { id: true, code: true, name: true, active: true } })
        : await tx.customer.findFirst({ where: { id: params.id, companyId: user.companyId }, select: { id: true, code: true, name: true, active: true } });
      if (!current) return null;

      if (type === "SUPPLIER") await tx.supplier.update({ where: { id: current.id }, data: { active: parsed.data.active } });
      else await tx.customer.update({ where: { id: current.id }, data: { active: parsed.data.active } });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          entity: `Catalog:${type}`,
          entityId: current.id,
          action: parsed.data.active ? "ACTIVATE" : "DEACTIVATE",
          beforeData: { active: current.active, code: current.code, name: current.name },
          afterData: { active: parsed.data.active, code: current.code, name: current.name },
        },
      });
      await tx.outboxEvent.create({
        data: {
          companyId: user.companyId,
          topic: `private-company-${user.companyId}`,
          eventName: "catalog.status_changed.v1",
          aggregateId: current.id,
          payload: { catalogType: type, id: current.id, active: parsed.data.active },
        },
      });
      return { id: current.id, active: parsed.data.active };
    });

    if (!result) return apiError("CATALOG_NOT_FOUND", "El registro no existe.", 404);
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
