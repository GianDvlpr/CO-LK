import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { resolveItemUnitCost } from "@/modules/recipes/domain/recipe-cost";
import { latestCostRates } from "@/modules/recipes/application/recipe-cost-service";

export async function GET() {
  try {
    const user = await requirePermission("recipes.read");
    const [products, materials, outputItems, warehouses] = await prisma.$transaction([
      prisma.product.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, variants: { where: { active: true }, select: { sku: true, size: { select: { name: true } }, color: { select: { name: true } } } } } }),
      prisma.inventoryItem.findMany({ where: { companyId: user.companyId, active: true, type: { in: ["RAW_MATERIAL", "INTERMEDIATE", "WASTE"] } }, orderBy: [{ type: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, type: true, referenceNetPrice: true, unit: { select: { symbol: true } }, currency: { select: { code: true, symbol: true } } } }),
      prisma.inventoryItem.findMany({ where: { companyId: user.companyId, active: true, type: "INTERMEDIATE" }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, type: true, lotTrackingMode: true, unit: { select: { symbol: true } } } }),
      prisma.warehouse.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    ]);
    const materialOptions = materials.map((material) => ({ ...material, unitCost: resolveItemUnitCost(material).toString(), currencyCode: material.currency?.code ?? "PEN", currencySymbol: material.currency?.symbol ?? "S/" }));
    const currencyCodes = [...new Set(materialOptions.filter((material) => Number(material.unitCost) > 0).map((material) => material.currencyCode))];
    const rates = await latestCostRates(prisma, user.companyId, currencyCodes);
    return apiSuccess({ products, materials: materialOptions, outputItems, warehouses, exchangeRates: Object.fromEntries([...rates].map(([code, rate]) => [code, rate.toString()])) });
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
