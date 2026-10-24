import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { buildRecipePdf } from "@/modules/recipes/application/recipe-pdf";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("recipes.read");
    const { id } = await context.params;
    const recipe = await prisma.recipe.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        product: { select: { code: true, name: true } },
        outputItem: { select: { code: true, name: true, unit: { select: { symbol: true } } } },
        versions: { orderBy: { version: "desc" }, take: 1, include: { ingredients: { include: { item: { select: { code: true, name: true, unit: { select: { symbol: true } } } } } } } },
      },
    });
    if (!recipe) return apiError("RECIPE_NOT_FOUND", "La receta no existe.", 404);
    const version = recipe.versions[0];
    if (!version) return apiError("RECIPE_EMPTY", "La receta no tiene una versión válida con ingredientes.", 422);
    const pdf = await buildRecipePdf(recipe);
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "recipes", entity: "Recipe", entityId: recipe.id, action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { code: recipe.code, version: version.version, format: "PDF" } } });
    const baseName = `receta-${recipe.code}`.replace(/[^a-zA-Z0-9-_]/g, "-");
    return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${baseName}.pdf"`, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
