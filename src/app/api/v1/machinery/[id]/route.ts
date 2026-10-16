import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const schema = z.object({
  name: z.string().trim().min(1).max(150),
  type: z.enum(["PRESS", "INJECTOR", "OTHER"]),
  brand: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(100).optional(),
  location: z.string().trim().max(150).optional(),
  status: z.enum(["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"]),
  purchaseDate: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("machinery.create");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La máquina contiene datos inválidos.", 400);
    const { id } = await context.params;
    const machine = await prisma.$transaction(async (tx) => {
      const current = await tx.machine.findFirst({ where: { id, companyId: user.companyId }, select: { id: true, code: true } });
      if (!current) return null;
      const updated = await tx.machine.update({ where: { id }, data: parsed.data });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          entity: "Machine",
          entityId: id,
          action: "UPDATE",
          afterData: { ...parsed.data, code: current.code },
        },
      });
      return updated;
    });
    if (!machine) return apiError("MACHINE_NOT_FOUND", "La máquina no existe.", 404);
    return apiSuccess(machine);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
