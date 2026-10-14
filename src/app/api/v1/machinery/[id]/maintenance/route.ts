import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const decimal = z.union([z.string().min(1), z.number()]);
const schema = z.object({
  type: z.enum(["PREVENTIVE", "CORRECTIVE", "REPAIR"]), performedAt: z.coerce.date(), nextDueAt: z.coerce.date().optional(),
  provider: z.string().trim().max(150).optional(), description: z.string().trim().min(1).max(500),
  cost: decimal, downtimeHours: decimal, notes: z.string().trim().max(500).optional(),
  machineStatus: z.enum(["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"]).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("machinery.maintenance");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "El mantenimiento contiene datos inválidos.", 400);
    const { id } = await context.params;
    const machine = await prisma.machine.findFirst({ where: { id, companyId: user.companyId }, select: { id: true, status: true } });
    if (!machine) return apiError("MACHINE_NOT_FOUND", "La máquina no existe.", 404);
    const { machineStatus, ...recordData } = parsed.data;
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.machineMaintenanceRecord.create({ data: { machineId: id, ...recordData } });
      if (machineStatus) await tx.machine.update({ where: { id }, data: { status: machineStatus } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "MachineMaintenance", entityId: created.id, action: "CREATE", afterData: { ...recordData, machineStatus } } });
      return created;
    });
    return apiSuccess(record, 201);
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
