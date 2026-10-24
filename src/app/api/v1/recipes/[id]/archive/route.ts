import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  try {
    const user = await requirePermission("recipes.archive");
    const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM recipes WHERE id = ${id}::uuid FOR UPDATE`;
      const recipe = await tx.recipe.findFirst({ where: { id, companyId: user.companyId } });
      if (!recipe) throw new Error("RECIPE_NOT_FOUND");
      if (recipe.status === "INACTIVE") throw new Error("RECIPE_ALREADY_ARCHIVED");
      const archived = await tx.recipe.update({ where: { id: recipe.id }, data: { status: "INACTIVE" } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "recipes", entity: "Recipe", entityId: recipe.id, action: "DEACTIVATE", beforeData: { status: recipe.status }, afterData: { status: "INACTIVE" } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "recipe.archived.v1", aggregateId: recipe.id, payload: { recipeId: recipe.id, code: recipe.code } } });
      return archived;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Error && error.message === "RECIPE_NOT_FOUND") return apiError("RECIPE_NOT_FOUND", "La receta no existe.", 404);
    if (error instanceof Error && error.message === "RECIPE_ALREADY_ARCHIVED") return apiError("RECIPE_ALREADY_ARCHIVED", "La receta ya está archivada.", 422);
    throw error;
  }
}
