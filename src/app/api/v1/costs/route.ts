import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { calculateProductCost } from "@/modules/costs/domain/product-cost";

const amount = z.union([z.string().min(1), z.number()]);
const schema = z.object({
  recipeVersionId: z.uuid(),
  laborTariff: amount,
  energyTariff: amount,
  waterTariff: amount,
  machineryCost: amount,
  notes: z.string().trim().max(500).nullable().optional(),
});

function serializeRecipe(recipe: {
  id: string;
  code: string;
  name: string;
  status: string;
  product: { code: string; name: string } | null;
  outputItem: { code: string; name: string; unit: { symbol: string } } | null;
  versions: Array<{
    id: string;
    version: number;
    yieldQuantity: Decimal;
    calculatedCost: Decimal | null;
    isActive: boolean;
    costStructure: {
      laborTariff: Decimal;
      energyTariff: Decimal;
      waterTariff: Decimal;
      machineryCost: Decimal;
      notes: string | null;
      updatedAt: Date;
    } | null;
  }>;
}) {
  const version = recipe.versions[0];
  if (!version) return null;
  const structure = version.costStructure;
  const result = calculateProductCost({
    materialCost: version.calculatedCost ?? 0,
    laborTariff: structure?.laborTariff ?? 0,
    energyTariff: structure?.energyTariff ?? 0,
    waterTariff: structure?.waterTariff ?? 0,
    machineryCost: structure?.machineryCost ?? 0,
    yieldQuantity: version.yieldQuantity,
  });
  return {
    recipeId: recipe.id,
    recipeVersionId: version.id,
    recipeCode: recipe.code,
    recipeName: recipe.name,
    recipeStatus: recipe.status,
    version: version.version,
    isActive: version.isActive,
    destinationCode: recipe.product?.code ?? recipe.outputItem?.code ?? "—",
    destinationName: recipe.product?.name ?? recipe.outputItem?.name ?? "Sin destino",
    yieldQuantity: version.yieldQuantity.toString(),
    yieldUnit: recipe.product ? "par" : (recipe.outputItem?.unit.symbol ?? "und"),
    materialCost: result.materialCost.toString(),
    laborTariff: (structure?.laborTariff ?? new Decimal(0)).toString(),
    energyTariff: (structure?.energyTariff ?? new Decimal(0)).toString(),
    waterTariff: (structure?.waterTariff ?? new Decimal(0)).toString(),
    machineryCost: (structure?.machineryCost ?? new Decimal(0)).toString(),
    directCost: result.directCost.toString(),
    batchCost: result.batchCost.toString(),
    unitCost: result.unitCost.toString(),
    notes: structure?.notes ?? null,
    updatedAt: structure?.updatedAt.toISOString() ?? null,
  };
}

export async function GET() {
  try {
    const user = await requirePermission("costs.read");
    const recipes = await prisma.recipe.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        product: { select: { code: true, name: true } },
        outputItem: { select: { code: true, name: true, unit: { select: { symbol: true } } } },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            yieldQuantity: true,
            calculatedCost: true,
            isActive: true,
            costStructure: { select: { laborTariff: true, energyTariff: true, waterTariff: true, machineryCost: true, notes: true, updatedAt: true } },
          },
        },
      },
    });
    return apiSuccess({ items: recipes.map(serializeRecipe).filter(Boolean) });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}

export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("costs.manage");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "La estructura de costos contiene datos inválidos.", 400);

    const values = {
      laborTariff: new Decimal(parsed.data.laborTariff),
      energyTariff: new Decimal(parsed.data.energyTariff),
      waterTariff: new Decimal(parsed.data.waterTariff),
      machineryCost: new Decimal(parsed.data.machineryCost),
    };
    if (Object.values(values).some((value) => !value.isFinite() || value.isNegative())) {
      return apiError("COST_INVALID_AMOUNT", "Las tarifas deben ser importes iguales o mayores que cero.", 422);
    }

    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.recipeVersion.findFirst({
        where: { id: parsed.data.recipeVersionId, recipe: { companyId: user.companyId } },
        select: { id: true, recipeId: true, yieldQuantity: true, calculatedCost: true },
      });
      if (!version) throw new Error("COST_RECIPE_NOT_FOUND");

      const previous = await tx.productCostStructure.findUnique({ where: { recipeVersionId: version.id } });
      const structure = await tx.productCostStructure.upsert({
        where: { recipeVersionId: version.id },
        update: { ...values, notes: parsed.data.notes || null },
        create: { companyId: user.companyId, recipeVersionId: version.id, createdById: user.id, ...values, notes: parsed.data.notes || null },
      });
      const totals = calculateProductCost({ materialCost: version.calculatedCost ?? 0, yieldQuantity: version.yieldQuantity, ...values });
      await tx.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          entity: "ProductCostStructure",
          entityId: structure.id,
          action: previous ? "UPDATE" : "CREATE",
          beforeData: previous ? { laborTariff: previous.laborTariff.toString(), energyTariff: previous.energyTariff.toString(), waterTariff: previous.waterTariff.toString(), machineryCost: previous.machineryCost.toString() } : undefined,
          afterData: { laborTariff: values.laborTariff.toString(), energyTariff: values.energyTariff.toString(), waterTariff: values.waterTariff.toString(), machineryCost: values.machineryCost.toString(), batchCost: totals.batchCost.toString(), unitCost: totals.unitCost.toString() },
        },
      });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "cost-structure.updated.v1", aggregateId: structure.id, payload: { recipeId: version.recipeId, recipeVersionId: version.id } } });
      return structure;
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Error && error.message === "COST_RECIPE_NOT_FOUND") return apiError("COST_RECIPE_NOT_FOUND", "La versión de receta no existe.", 404);
    throw error;
  }
}
