import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { createProductionOrder, ProductionError } from "@/modules/production/application/production-service";
import { productionSheetSchema, serializeProductionSheet } from "@/modules/production/domain/production-sheet";

const schema = productionSheetSchema.extend({
  number: z.string().trim().min(1).max(50),
  warehouseId: z.uuid(),
  productVariantId: z.uuid(),
  recipeVersionId: z.uuid(),
  machineId: z.uuid().optional(),
  recipeRuns: z.union([z.string(), z.number()]),
  plannedAt: z.coerce.date().optional(),
});

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof ProductionError) return apiError(error.code, error.message, error.code === "PRODUCTION_NOT_FOUND" ? 404 : 422);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("PRODUCTION_DUPLICATE", "El número de orden ya existe.", 409);
  return null;
}

export async function GET() {
  try {
    const user = await requirePermission("production.read");
    const items = await prisma.productionOrder.findMany({
      where: { companyId: user.companyId }, orderBy: { createdAt: "desc" },
      include: {
        warehouse: { select: { code: true, name: true } },
        productVariant: { include: { product: { select: { code: true, name: true } }, size: { select: { name: true } }, color: { select: { name: true } } } },
        recipeVersion: { include: { recipe: { select: { code: true, name: true } } } },
        machine: { select: { id: true, code: true, name: true, type: true, status: true } },
        materials: { include: { item: { select: { code: true, name: true, unit: { select: { symbol: true } } } } } },
      },
    });
    return apiSuccess({ items });
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La orden contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("production.create");
    const sheet = serializeProductionSheet(parsed.data);
    return apiSuccess(await createProductionOrder(prisma, { ...parsed.data, ...sheet, companyId: user.companyId, userId: user.id }), 201);
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}
