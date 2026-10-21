import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";

const optionalText = (max: number) => z.string().trim().max(max).optional();
const parameterSchema = z.object({
  scope: z.enum(["GENERAL", "STATION", "INJECTOR", "TEMPERATURE"]),
  station: optionalText(50),
  channel: optionalText(50),
  groupName: z.string().trim().min(1).max(100),
  parameter: z.string().trim().min(1).max(150),
  value: z.string().trim().min(1).max(100),
  unit: optionalText(30),
  notes: optionalText(300),
});
const createSchema = z.object({
  name: z.string().trim().min(1).max(150),
  configurationType: z.enum(["STATIC_INJECTOR", "ROTARY_INJECTOR", "CUSTOM"]),
  application: optionalText(150),
  material: optionalText(150),
  notes: optionalText(500),
  parameters: z.array(parameterSchema).min(1, "Agrega al menos un parámetro.").max(250),
});

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("MACHINE_SHEET_CONFLICT", "No se pudo asignar la revisión. Intenta nuevamente.", 409);
  return null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("machinery.read");
    const { id } = await context.params;
    const machine = await prisma.machine.findFirst({ where: { id, companyId: user.companyId }, select: { id: true } });
    if (!machine) return apiError("MACHINE_NOT_FOUND", "La máquina no existe.", 404);
    const items = await prisma.machineParameterSheet.findMany({
      where: { machineId: id },
      orderBy: { revision: "desc" },
      include: { createdBy: { select: { name: true, username: true } }, parameters: { orderBy: { sortOrder: "asc" } }, _count: { select: { parameters: true } } },
    });
    return apiSuccess({ items });
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = known(error); if (response) return response; throw error; }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La ficha contiene datos no válidos.", 400);
  try {
    const user = await requirePermission("machinery.create");
    const { id } = await context.params;
    const sheet = await prisma.$transaction(async (tx) => {
      const machine = await tx.machine.findFirst({ where: { id, companyId: user.companyId }, select: { id: true, code: true } });
      if (!machine) return null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${user.companyId}:MACHINE_SHEET:${id}`}, 0))`;
      const latest = await tx.machineParameterSheet.aggregate({ where: { machineId: id }, _max: { revision: true } });
      const revision = (latest._max.revision ?? 0) + 1;
      const created = await tx.machineParameterSheet.create({ data: {
        machineId: id,
        revision,
        name: parsed.data.name,
        configurationType: parsed.data.configurationType,
        application: parsed.data.application || null,
        material: parsed.data.material || null,
        notes: parsed.data.notes || null,
        createdById: user.id,
        parameters: { create: parsed.data.parameters.map((parameter, sortOrder) => ({ ...parameter, station: parameter.station || null, channel: parameter.channel || null, unit: parameter.unit || null, notes: parameter.notes || null, sortOrder })) },
      } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "machinery", entity: "MachineParameterSheet", entityId: created.id, action: "CREATE", afterData: { machineId: id, machineCode: machine.code, revision, name: created.name, parameterCount: parsed.data.parameters.length } } });
      return created;
    });
    if (!sheet) return apiError("MACHINE_NOT_FOUND", "La máquina no existe.", 404);
    return apiSuccess(sheet, 201);
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}
