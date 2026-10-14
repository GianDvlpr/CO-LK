import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  try {
    const user = await requirePermission("recipes.activate"); const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM recipes WHERE id = ${id}::uuid FOR UPDATE`;
      const recipe = await tx.recipe.findFirst({ where: { id, companyId: user.companyId }, include: { versions: { orderBy: { version: "desc" }, take: 1, include: { ingredients: true } } } });
      if (!recipe) throw new Error("RECIPE_NOT_FOUND");
      const version = recipe.versions[0]; if (!version || version.ingredients.length === 0) throw new Error("RECIPE_EMPTY");
      await tx.recipeVersion.updateMany({ where: { recipeId: recipe.id }, data: { isActive: false } });
      await tx.recipeVersion.update({ where: { id: version.id }, data: { isActive: true } });
      const active = await tx.recipe.update({ where: { id: recipe.id }, data: { status: "ACTIVE" } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "Recipe", entityId: recipe.id, action: "ACTIVATE", beforeData: { status: recipe.status }, afterData: { status: "ACTIVE", version: version.version } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "recipe.activated.v1", aggregateId: recipe.id, payload: { recipeId: recipe.id, versionId: version.id, version: version.version } } });
      return active;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Error && error.message === "RECIPE_NOT_FOUND") return apiError("RECIPE_NOT_FOUND", "La receta no existe.", 404);
    if (error instanceof Error && error.message === "RECIPE_EMPTY") return apiError("RECIPE_EMPTY", "La receta no tiene una versión válida con ingredientes.", 422);
    throw error;
  }
}
