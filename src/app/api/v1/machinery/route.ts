import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { nextBusinessCode } from "@/lib/database/business-code";

const schema = z.object({
  name: z.string().trim().min(1).max(150),
  type: z.enum(["PRESS", "INJECTOR", "OTHER"]),
  brand: z.string().trim().max(100).optional(), model: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(100).optional(), location: z.string().trim().max(150).optional(),
  status: z.enum(["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"]).default("ACTIVE"),
  purchaseDate: z.coerce.date().optional(), notes: z.string().trim().max(500).optional(),
});

export async function GET() {
  try {
    const user = await requirePermission("machinery.read");
    const items = await prisma.machine.findMany({
      where: { companyId: user.companyId }, orderBy: { code: "asc" },
      include: { maintenanceRecords: { orderBy: { performedAt: "desc" } }, _count: { select: { productionOrders: true } } },
    });
    return apiSuccess({ items });
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("machinery.create");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La máquina contiene datos inválidos.", 400);
    const machine = await prisma.$transaction(async (tx) => {
      const code = await nextBusinessCode(tx, user.companyId, "MACHINE");
      const created = await tx.machine.create({ data: { companyId: user.companyId, code, ...parsed.data } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "Machine", entityId: created.id, action: "CREATE", afterData: { ...parsed.data, code } } });
      return created;
    });
    return apiSuccess(machine, 201);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("MACHINE_DUPLICATE", "Ya existe una máquina con ese código.", 409);
    throw error;
  }
}
