import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const decimal = z.union([z.string().min(1), z.number()]);
const createSchema = z.object({
  code: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(150), productId: z.uuid(), yieldQuantity: decimal, notes: z.string().trim().max(500).optional(),
  ingredients: z.array(z.object({ itemId: z.uuid(), quantity: decimal, wastePercentage: decimal.default(0) })).min(1),
});

function knownError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("RECIPE_DUPLICATE", "El código de receta o una materia prima está duplicado.", 409);
  return null;
}

export async function GET() {
  try {
    const user = await requirePermission("recipes.read");
    const items = await prisma.recipe.findMany({ where: { companyId: user.companyId }, orderBy: { updatedAt: "desc" }, include: { product: { select: { code: true, name: true } }, versions: { orderBy: { version: "desc" }, include: { ingredients: { include: { item: { select: { code: true, name: true, unit: { select: { symbol: true } } } } } } } } } });
    return apiSuccess({ items });
  } catch (error) { const response = knownError(error); if (response) return response; throw error; }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "La receta contiene datos inválidos.", 400);
  const yieldQuantity = new Decimal(parsed.data.yieldQuantity);
  const itemIds = parsed.data.ingredients.map((ingredient) => ingredient.itemId);
  if (!yieldQuantity.greaterThan(0) || new Set(itemIds).size !== itemIds.length) return apiError("RECIPE_INVALID", "El rendimiento debe ser positivo y las materias primas no pueden repetirse.", 422);
  for (const ingredient of parsed.data.ingredients) {
    const quantity = new Decimal(ingredient.quantity); const waste = new Decimal(ingredient.wastePercentage);
    if (!quantity.greaterThan(0) || waste.isNegative() || waste.greaterThan(100)) return apiError("RECIPE_INVALID", "Las cantidades deben ser positivas y la merma debe estar entre 0% y 100%.", 422);
  }
  try {
    const user = await requirePermission("recipes.create");
    const recipe = await prisma.$transaction(async (tx) => {
      const [product, materials] = await Promise.all([
        tx.product.findFirst({ where: { id: parsed.data.productId, companyId: user.companyId, active: true } }),
        tx.inventoryItem.findMany({ where: { id: { in: itemIds }, companyId: user.companyId, active: true, type: "RAW_MATERIAL" } }),
      ]);
      if (!product || materials.length !== itemIds.length) throw new Error("RECIPE_INVALID_REFERENCE");
      const created = await tx.recipe.create({ data: { companyId: user.companyId, productId: product.id, code: parsed.data.code, name: parsed.data.name, status: "DRAFT", versions: { create: { version: 1, yieldQuantity, notes: parsed.data.notes, isActive: false, ingredients: { create: parsed.data.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, quantity: new Decimal(ingredient.quantity), wastePercentage: new Decimal(ingredient.wastePercentage) })) } } } } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "Recipe", entityId: created.id, action: "CREATE", afterData: { code: created.code, version: 1, ingredientCount: itemIds.length } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "recipe.created.v1", aggregateId: created.id, payload: { recipeId: created.id, code: created.code } } });
      return created;
    });
    return apiSuccess(recipe, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "RECIPE_INVALID_REFERENCE") return apiError("RECIPE_INVALID_REFERENCE", "El producto o alguna materia prima no es válida.", 422);
    const response = knownError(error); if (response) return response; throw error;
  }
}
