import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { completeInventoryTransformation, createInventoryTransformation, InventoryTransformationError, startInventoryTransformation } from "@/modules/inventory/application/inventory-transformation-service";

const decimal = z.union([z.string().min(1), z.number()]);
const schema = z.object({
  warehouseId: z.uuid(),
  outputQuantity: decimal,
  wasteQuantity: decimal.optional(),
  outputLotCode: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

function knownError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof InventoryTransformationError) return apiError(error.code, error.message, 422);
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownError(error); if (response) return response; throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Los datos para elaborar e ingresar el insumo no son válidos.", 400);
  try {
    const user = await requirePermission("recipes.create");
    await requirePermission("inventory.create_item");
    const { id } = await context.params;
    const recipe = await prisma.recipe.findFirst({
      where: { id, companyId: user.companyId, status: "ACTIVE", outputItemId: { not: null } },
      include: { versions: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1 } },
    });
    const version = recipe?.versions[0];
    if (!recipe || !version) return apiError("RECIPE_NOT_READY", "Activa la receta de insumo antes de enviarla al almacén.", 422);
    const output = new Decimal(parsed.data.outputQuantity);
    const waste = new Decimal(parsed.data.wasteQuantity ?? 0);
    if (!output.greaterThan(0) || waste.isNegative()) return apiError("INVALID_QUANTITY", "La cantidad obtenida debe ser mayor que cero y la merma no puede ser negativa.", 422);
    const transformation = await createInventoryTransformation(prisma, {
      companyId: user.companyId,
      userId: user.id,
      warehouseId: parsed.data.warehouseId,
      recipeVersionId: version.id,
      plannedOutputQuantity: output.add(waste),
      outputLotCode: parsed.data.outputLotCode,
      notes: parsed.data.notes,
    });
    await startInventoryTransformation(prisma, { companyId: user.companyId, userId: user.id, id: transformation.id });
    const completed = await completeInventoryTransformation(prisma, { companyId: user.companyId, userId: user.id, id: transformation.id, actualOutputQuantity: output, actualWasteQuantity: waste });
    return apiSuccess(completed, 201);
  } catch (error) { const response = knownError(error); if (response) return response; throw error; }
}
