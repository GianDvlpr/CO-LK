import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Selecciona un color válido.");
const createSchema = z.object({
  code: z.string().trim().min(1).max(50).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(300).optional(),
  layoutWidth: z.coerce.number().int().min(1).max(3).default(1),
  layoutColor: color.default("#1677ff"),
});
const updateSchema = z.object({
  sectors: z.array(z.object({
    id: z.uuid(),
    layoutOrder: z.coerce.number().int().min(0).optional(),
    layoutX: z.coerce.number().int().min(-50000).max(50000).optional(),
    layoutY: z.coerce.number().int().min(-50000).max(50000).optional(),
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    layoutWidth: z.coerce.number().int().min(1).max(3).optional(),
    layoutColor: color.optional(),
  })).min(1).max(100),
});

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("SECTOR_DUPLICATE", "Ya existe un sector con ese código.", 409);
  return null;
}

export async function GET() {
  try {
    const user = await requirePermission("inventory.read");
    const sectors = await prisma.warehouse.findMany({
      where: { companyId: user.companyId, active: true },
      orderBy: [{ layoutOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, code: true, name: true, description: true, layoutOrder: true, layoutX: true, layoutY: true, layoutWidth: true, layoutColor: true,
        _count: { select: { defaultInventoryItems: true, balances: true } },
      },
    });
    return apiSuccess({ sectors });
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = known(error); if (response) return response; throw error; }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Los datos del sector no son válidos.", 400);
  try {
    const user = await requirePermission("catalogs.manage");
    const sector = await prisma.$transaction(async (tx) => {
      const last = await tx.warehouse.aggregate({ where: { companyId: user.companyId }, _max: { layoutOrder: true } });
      const layoutOrder = (last._max.layoutOrder ?? -1) + 1;
      const created = await tx.warehouse.create({ data: { companyId: user.companyId, ...parsed.data, description: parsed.data.description || null, layoutOrder, layoutX: (layoutOrder % 3) * 260, layoutY: Math.floor(layoutOrder / 3) * 220 } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "WarehouseLayout", entityId: created.id, action: "CREATE", afterData: { code: created.code, name: created.name, layoutOrder: created.layoutOrder, layoutWidth: created.layoutWidth, layoutColor: created.layoutColor } } });
      return created;
    });
    return apiSuccess(sector, 201);
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}

export async function PATCH(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = known(error); if (response) return response; throw error; }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La distribución no es válida.", 400);
  try {
    const user = await requirePermission("catalogs.manage");
    const ids = parsed.data.sectors.map((sector) => sector.id);
    const owned = await prisma.warehouse.count({ where: { id: { in: ids }, companyId: user.companyId } });
    if (owned !== new Set(ids).size) return apiError("SECTOR_NOT_FOUND", "Uno de los sectores ya no existe.", 404);
    await prisma.$transaction(async (tx) => {
      for (const sector of parsed.data.sectors) {
        const { id, ...data } = sector;
        await tx.warehouse.update({ where: { id }, data: { ...data, description: data.description === "" ? null : data.description } });
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "WarehouseLayout", entityId: ids[0], action: "UPDATE", afterData: JSON.parse(JSON.stringify({ sectors: parsed.data.sectors })) as Prisma.InputJsonValue } });
    });
    return apiSuccess({ updated: parsed.data.sectors.length });
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}
