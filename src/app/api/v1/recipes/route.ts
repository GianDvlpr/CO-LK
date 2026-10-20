import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { nextBusinessCode } from "@/lib/database/business-code";
import { createsInventoryFormulaCycle } from "@/modules/inventory/domain/inventory-formula-cycle";

const decimal = z.union([z.string().min(1), z.number()]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(150), productId: z.uuid().optional(), outputItemId: z.uuid().optional(), yieldQuantity: decimal, notes: z.string().trim().max(500).optional(),
  ingredients: z.array(z.object({ itemId: z.uuid(), quantity: decimal })).min(1),
}).refine((value) => Boolean(value.productId) !== Boolean(value.outputItemId), { message: "Selecciona un producto final o un insumo resultante, no ambos." });

function knownError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("RECIPE_DUPLICATE", "El código de receta o una materia prima está duplicado.", 409);
  return null;
}

export async function GET() {
  try {
    const user = await requirePermission("recipes.read");
    const items = await prisma.recipe.findMany({ where: { companyId: user.companyId }, orderBy: { updatedAt: "desc" }, include: { product: { select: { code: true, name: true } }, outputItem: { select: { id: true, code: true, name: true, type: true, lotTrackingMode: true, unit: { select: { symbol: true } } } }, versions: { orderBy: { version: "desc" }, include: { ingredients: { include: { item: { select: { code: true, name: true, unit: { select: { symbol: true } } } } } } } } } });
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
    const quantity = new Decimal(ingredient.quantity);
    if (!quantity.greaterThan(0)) return apiError("RECIPE_INVALID", "Las cantidades de la receta deben ser positivas.", 422);
  }
  try {
    const user = await requirePermission("recipes.create");
    const recipe = await prisma.$transaction(async (tx) => {
      const [product, outputItem, materials] = await Promise.all([
        parsed.data.productId ? tx.product.findFirst({ where: { id: parsed.data.productId, companyId: user.companyId, active: true } }) : null,
        parsed.data.outputItemId ? tx.inventoryItem.findFirst({ where: { id: parsed.data.outputItemId, companyId: user.companyId, active: true, type: "INTERMEDIATE" } }) : null,
        tx.inventoryItem.findMany({ where: { id: { in: itemIds }, companyId: user.companyId, active: true, type: { in: ["RAW_MATERIAL", "INTERMEDIATE", "WASTE"] } } }),
      ]);
      if ((parsed.data.productId && !product) || (parsed.data.outputItemId && !outputItem) || materials.length !== itemIds.length) throw new Error("RECIPE_INVALID_REFERENCE");
      if (outputItem) {
        if (itemIds.includes(outputItem.id)) throw new Error("RECIPE_CYCLE");
        const existing = await tx.recipe.findMany({ where: { companyId: user.companyId, outputItemId: { not: null } }, select: { outputItemId: true, versions: { orderBy: { version: "desc" }, take: 1, select: { ingredients: { select: { itemId: true } } } } } });
        const edges = existing.flatMap((recipe) => recipe.outputItemId ? [{ outputItemId: recipe.outputItemId, ingredientItemIds: (recipe.versions[0]?.ingredients ?? []).map((ingredient) => ingredient.itemId) }] : []);
        if (createsInventoryFormulaCycle(edges, outputItem.id, itemIds)) throw new Error("RECIPE_CYCLE");
      }
      const code = await nextBusinessCode(tx, user.companyId, "RECIPE");
      const created = await tx.recipe.create({ data: { companyId: user.companyId, productId: product?.id, outputItemId: outputItem?.id, code, name: parsed.data.name, status: "DRAFT", versions: { create: { version: 1, yieldQuantity, notes: parsed.data.notes, isActive: false, ingredients: { create: parsed.data.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, quantity: new Decimal(ingredient.quantity) })) } } } } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "Recipe", entityId: created.id, action: "CREATE", afterData: { code: created.code, version: 1, ingredientCount: itemIds.length } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "recipe.created.v1", aggregateId: created.id, payload: { recipeId: created.id, code: created.code } } });
      return created;
    });
    return apiSuccess(recipe, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "RECIPE_INVALID_REFERENCE") return apiError("RECIPE_INVALID_REFERENCE", "El producto, insumo resultante o ingrediente no es válido.", 422);
    if (error instanceof Error && error.message === "RECIPE_CYCLE") return apiError("RECIPE_CYCLE", "La receta generaría un ciclo: un insumo no puede terminar dependiendo de sí mismo.", 422);
    const response = knownError(error); if (response) return response; throw error;
  }
}
