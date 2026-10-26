import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { createsInventoryFormulaCycle } from "@/modules/inventory/domain/inventory-formula-cycle";
import { calculateRecipeCost, resolveItemUnitCost } from "@/modules/recipes/domain/recipe-cost";

const decimal = z.union([z.string().min(1), z.number()]);
const updateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  yieldQuantity: decimal.optional(),
  notes: z.string().trim().max(500).optional(),
  manualCost: decimal.nullable().optional(),
  ingredients: z.array(z.object({ itemId: z.uuid(), quantity: decimal })).min(1).optional(),
}).refine((value) => value.name !== undefined || value.yieldQuantity !== undefined || value.notes !== undefined || value.manualCost !== undefined || value.ingredients !== undefined, "Indica al menos un cambio en la receta.");

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("RECIPE_DUPLICATE", "Una materia prima está repetida en la receta.", 409);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return apiError("RECIPE_IN_USE", "La receta ya se usó en órdenes de producción o transformaciones; archívala en lugar de eliminarla.", 409);
  return null;
}

const messages: Record<string, [string, string, number]> = {
  RECIPE_NOT_FOUND: ["RECIPE_NOT_FOUND", "La receta no existe.", 404],
  RECIPE_ARCHIVED: ["RECIPE_ARCHIVED", "Reactiva la receta antes de editarla.", 422],
  RECIPE_EMPTY: ["RECIPE_EMPTY", "La receta no tiene una versión válida con ingredientes.", 422],
  RECIPE_INVALID: ["RECIPE_INVALID", "El rendimiento debe ser positivo y las materias primas no pueden repetirse.", 422],
  RECIPE_INVALID_COST: ["RECIPE_INVALID_COST", "El costo manual no puede ser negativo.", 422],
  RECIPE_INVALID_YIELD: ["RECIPE_INVALID_YIELD", "El rendimiento de una receta de producción debe ser un número entero de pares.", 422],
  RECIPE_INVALID_REFERENCE: ["RECIPE_INVALID_REFERENCE", "Una materia prima o insumo no es válido.", 422],
  RECIPE_CYCLE: ["RECIPE_CYCLE", "La receta generaría un ciclo: un insumo no puede terminar dependiendo de sí mismo.", 422],
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La receta contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("recipes.update");
    const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM recipes WHERE id = ${id}::uuid FOR UPDATE`;
      const recipe = await tx.recipe.findFirst({ where: { id, companyId: user.companyId }, include: { versions: { orderBy: { version: "desc" }, include: { ingredients: true } } } });
      if (!recipe) throw new Error("RECIPE_NOT_FOUND");
      if (recipe.status === "INACTIVE") throw new Error("RECIPE_ARCHIVED");
      const latest = recipe.versions[0];
      if (!latest) throw new Error("RECIPE_EMPTY");

      const input = parsed.data;
      const ingredients = input.ingredients
        ? input.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, quantity: new Decimal(ingredient.quantity) }))
        : latest.ingredients.map((ingredient) => ({ itemId: ingredient.itemId, quantity: new Decimal(ingredient.quantity.toString()) }));
      if (ingredients.some((ingredient) => !ingredient.quantity.greaterThan(0)) || new Set(ingredients.map((ingredient) => ingredient.itemId)).size !== ingredients.length) throw new Error("RECIPE_INVALID");

      const yieldQuantity = input.yieldQuantity !== undefined ? new Decimal(input.yieldQuantity) : new Decimal(latest.yieldQuantity.toString());
      if (!yieldQuantity.greaterThan(0)) throw new Error("RECIPE_INVALID");
      if (recipe.productId && !yieldQuantity.isInteger()) throw new Error("RECIPE_INVALID_YIELD");
      const manualCost = input.manualCost === undefined ? latest.manualCost : input.manualCost === null ? null : new Decimal(input.manualCost);
      if (manualCost && (manualCost.isNegative() || !manualCost.isFinite())) throw new Error("RECIPE_INVALID_COST");

      if (input.ingredients) {
        const itemIds = input.ingredients.map((ingredient) => ingredient.itemId);
        const previousIds = new Set(latest.ingredients.map((ingredient) => ingredient.itemId));
        const newItemIds = itemIds.filter((itemId) => !previousIds.has(itemId));
        if (newItemIds.length) {
          const items = await tx.inventoryItem.findMany({ where: { id: { in: newItemIds }, companyId: user.companyId, active: true, type: { in: ["RAW_MATERIAL", "INTERMEDIATE", "WASTE"] } }, select: { id: true } });
          if (items.length !== newItemIds.length) throw new Error("RECIPE_INVALID_REFERENCE");
        }
        if (recipe.outputItemId) {
          const others = await tx.recipe.findMany({ where: { companyId: user.companyId, outputItemId: { not: null }, id: { not: recipe.id } }, select: { outputItemId: true, versions: { orderBy: { version: "desc" }, take: 1, select: { ingredients: { select: { itemId: true } } } } } });
          const edges = others.flatMap((other) => other.outputItemId ? [{ outputItemId: other.outputItemId, ingredientItemIds: (other.versions[0]?.ingredients ?? []).map((ingredient) => ingredient.itemId) }] : []);
          if (createsInventoryFormulaCycle(edges, recipe.outputItemId, itemIds)) throw new Error("RECIPE_CYCLE");
        }
      }

      const versionChanged = input.yieldQuantity !== undefined || input.notes !== undefined || input.manualCost !== undefined || input.ingredients !== undefined;
      const editInPlace = recipe.status === "DRAFT" && !recipe.versions.some((version) => version.isActive);
      let targetVersion = latest.version;
      if (versionChanged) {
        const ingredientItemIds = ingredients.map((ingredient) => ingredient.itemId);
        const costItems = await tx.inventoryItem.findMany({ where: { id: { in: ingredientItemIds }, companyId: user.companyId }, select: { id: true, referenceNetPrice: true, referenceTaxRate: true, balances: { where: { lotId: null }, select: { onHandQuantity: true, averageUnitCost: true } } } });
        const unitCostByItem = new Map(costItems.map((item) => [item.id, resolveItemUnitCost(item)]));
        const calculatedCost = calculateRecipeCost(ingredients.map((ingredient) => ({ quantity: ingredient.quantity, unitCost: unitCostByItem.get(ingredient.itemId) ?? 0 })));
        if (editInPlace) {
          await tx.recipeVersion.update({ where: { id: latest.id }, data: { yieldQuantity, notes: input.notes ?? latest.notes, calculatedCost, manualCost } });
          if (input.ingredients) {
            await tx.recipeIngredient.deleteMany({ where: { recipeVersionId: latest.id } });
            await tx.recipeIngredient.createMany({ data: ingredients.map((ingredient) => ({ recipeVersionId: latest.id, itemId: ingredient.itemId, quantity: ingredient.quantity })) });
          }
        } else {
          targetVersion = latest.version + 1;
          await tx.recipeVersion.create({ data: { recipeId: recipe.id, version: targetVersion, yieldQuantity, notes: input.notes ?? latest.notes, isActive: false, calculatedCost, manualCost, ingredients: { create: ingredients.map((ingredient) => ({ itemId: ingredient.itemId, quantity: ingredient.quantity })) } } });
        }
      }

      const updated = await tx.recipe.update({ where: { id: recipe.id }, data: input.name !== undefined ? { name: input.name } : {} });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "recipes", entity: "Recipe", entityId: recipe.id, action: "UPDATE", beforeData: { name: recipe.name, status: recipe.status, version: latest.version, ingredientCount: latest.ingredients.length, yieldQuantity: latest.yieldQuantity.toString() }, afterData: { name: updated.name, status: updated.status, version: targetVersion, ingredientCount: ingredients.length, yieldQuantity: yieldQuantity.toString() } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "recipe.updated.v1", aggregateId: recipe.id, payload: { recipeId: recipe.id, version: targetVersion } } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof Error && messages[error.message]) { const [code, message, status] = messages[error.message]; return apiError(code, message, status); }
    const response = known(error); if (response) return response; throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  try {
    const user = await requirePermission("recipes.archive");
    const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM recipes WHERE id = ${id}::uuid FOR UPDATE`;
      const recipe = await tx.recipe.findFirst({ where: { id, companyId: user.companyId }, select: { id: true, code: true, name: true } });
      if (!recipe) return "missing" as const;
      const [productionReferences, transformationReferences] = await Promise.all([
        tx.productionOrder.count({ where: { companyId: user.companyId, OR: [{ recipeVersion: { recipeId: id } }, { secondaryRecipeVersion: { recipeId: id } }] } }),
        tx.inventoryTransformation.count({ where: { companyId: user.companyId, recipeVersion: { recipeId: id } } }),
      ]);
      if (productionReferences + transformationReferences > 0) return "in-use" as const;
      await tx.recipe.delete({ where: { id } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "recipes", entity: "Recipe", entityId: id, action: "DELETE", beforeData: { code: recipe.code, name: recipe.name } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "recipe.deleted.v1", aggregateId: id, payload: { recipeId: id, code: recipe.code } } });
      return "deleted" as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result === "missing") return apiError("RECIPE_NOT_FOUND", "La receta no existe.", 404);
    if (result === "in-use") return apiError("RECIPE_IN_USE", "La receta ya se usó en órdenes de producción o transformaciones; archívala en lugar de eliminarla.", 409);
    return apiSuccess({ id });
  } catch (error) {
    const response = known(error); if (response) return response; throw error;
  }
}
