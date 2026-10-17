import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { productionSheetSchema, serializeProductionSheet, validateProductionSheetTotals } from "@/modules/production/domain/production-sheet";
import { productVariantColorLabel } from "@/modules/products/domain/product-sku";

function componentKey(component: { itemId: string; componentType: string; quantity: Decimal.Value; colorDetail?: string | null }) {
  return `${component.componentType}|${component.itemId}|${new Decimal(component.quantity).toString()}|${component.colorDetail ?? ""}`;
}

function programKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { productVariantId: string; requestedPairs: Decimal.Value } => Boolean(item && typeof item === "object" && "productVariantId" in item && "requestedPairs" in item)).map((item) => `${item.productVariantId}|${new Decimal(item.requestedPairs).toString()}`).sort();
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("production.create");
    const parsed = productionSheetSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La ficha contiene datos inválidos.", 400);
    const { id } = await context.params;
    const existing = await prisma.productionOrder.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        productVariant: true,
        recipeVersion: { include: { ingredients: true } },
        secondaryRecipeVersion: { include: { ingredients: true } },
        salesOrder: { include: { lines: true } },
        components: true,
      },
    });
    if (!existing) return apiError("PRODUCTION_NOT_FOUND", "La orden no existe.", 404);
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") return apiError("PRODUCTION_LOCKED", "Una orden finalizada o cancelada ya no puede editarse.", 422);

    const variantIds = Array.from(new Set([
      ...parsed.data.sizeProgram.map((item) => item.productVariantId),
      ...parsed.data.productionTurns.flatMap((turn) => turn.quantities.map((item) => item.productVariantId)),
      ...parsed.data.dailyProduction.map((item) => item.productVariantId),
    ].filter((value): value is string => Boolean(value))));
    const componentIds = Array.from(new Set(parsed.data.components.map((item) => item.itemId)));
    const [variants, componentItems] = await prisma.$transaction([
      prisma.productVariant.findMany({ where: { id: { in: variantIds }, active: true, productId: existing.productVariant.productId, product: { companyId: user.companyId } }, include: { size: true, color: true, secondaryColor: true } }),
      prisma.inventoryItem.findMany({ where: { id: { in: componentIds }, companyId: user.companyId, active: true }, select: { id: true } }),
    ]);
    if (variants.length !== variantIds.length || componentItems.length !== componentIds.length) return apiError("PRODUCTION_INVALID_REFERENCE", "Una talla o componente ya no está disponible.", 422);
    if (variants.some((variant) => variant.colorId !== existing.productVariant.colorId || (variant.secondaryColorId ?? null) !== (existing.productVariant.secondaryColorId ?? null))) return apiError("PRODUCTION_INVALID_COLOR_PAIR", "Todas las tallas deben conservar la combinación C1/C2 de la orden.", 422);
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const normalized = {
      ...parsed.data,
      sizeProgram: parsed.data.sizeProgram.map((item) => { const variant = variantById.get(item.productVariantId)!; return { ...item, sku: variant.sku, size: variant.size.name, color: productVariantColorLabel(variant.color.name, variant.secondaryColor?.name) }; }),
      productionTurns: parsed.data.productionTurns.map((turn) => ({ ...turn, quantities: turn.quantities.map((item) => { const variant = variantById.get(item.productVariantId)!; return { ...item, sku: variant.sku, size: variant.size.name }; }) })),
      dailyProduction: parsed.data.dailyProduction.map((item) => item.productVariantId ? { ...item, sku: variantById.get(item.productVariantId)!.sku, size: variantById.get(item.productVariantId)!.size.name, color: productVariantColorLabel(variantById.get(item.productVariantId)!.color.name, variantById.get(item.productVariantId)!.secondaryColor?.name) } : item),
    };
    const plannedQuantity = normalized.sizeProgram.reduce((total, item) => total.add(item.requestedPairs), new Decimal(0));
    const sheetIssue = validateProductionSheetTotals(normalized, existing.status === "DRAFT" ? plannedQuantity : existing.plannedQuantity.toString());
    if (sheetIssue) return apiError("PRODUCTION_SHEET_INVALID", sheetIssue, 422);
    if (existing.salesOrder) {
      const lines = new Map(existing.salesOrder.lines.map((line) => [line.productVariantId, line]));
      if (normalized.sizeProgram.some((item) => !lines.has(item.productVariantId))) return apiError("PRODUCTION_INVALID_SALES_ORDER", "El pedido vinculado no contiene todas las tallas programadas.", 422);
      if (normalized.sizeProgram.some((item) => new Decimal(item.requestedPairs).greaterThan(lines.get(item.productVariantId)!.quantity.toString()))) return apiError("PRODUCTION_EXCEEDS_SALES_ORDER", "La programación no puede superar los pares solicitados en el pedido.", 422);
      if (normalized.sizeProgram.some((item) => { const line = lines.get(item.productVariantId)!; return line.productionOrderId && line.productionOrderId !== id; })) return apiError("PRODUCTION_ORDER_LINE_ASSIGNED", "Una línea del pedido ya pertenece a otra orden de producción.", 422);
    }

    const oldComponents = existing.components.map(componentKey).sort();
    const newComponents = normalized.components.map(componentKey).sort();
    if (existing.status !== "DRAFT" && oldComponents.join(";") !== newComponents.join(";")) return apiError("PRODUCTION_COMPONENTS_LOCKED", "Los componentes solo pueden cambiar mientras la orden está pendiente.", 422);
    if (existing.status !== "DRAFT" && programKeys(existing.sizeProgram).join(";") !== programKeys(normalized.sizeProgram).join(";")) return apiError("PRODUCTION_PROGRAM_LOCKED", "Las tallas y cantidades solo pueden cambiar mientras la orden está pendiente.", 422);

    const values = serializeProductionSheet(normalized);
    const result = await prisma.$transaction(async (tx) => {
      if (existing.status === "DRAFT") {
        const plannedMaterials = new Map<string, Decimal>();
        const add = (itemId: string, quantity: Decimal) => plannedMaterials.set(itemId, (plannedMaterials.get(itemId) ?? new Decimal(0)).add(quantity).toDecimalPlaces(6));
        const primaryRuns = plannedQuantity.div(existing.recipeVersion.yieldQuantity.toString()).toDecimalPlaces(6);
        const secondaryRuns = existing.secondaryRecipeVersion ? plannedQuantity.div(existing.secondaryRecipeVersion.yieldQuantity.toString()).toDecimalPlaces(6) : null;
        for (const ingredient of existing.recipeVersion.ingredients) add(ingredient.itemId, new Decimal(ingredient.quantity.toString()).mul(new Decimal(1).add(new Decimal(ingredient.wastePercentage.toString()).div(100))).mul(primaryRuns));
        if (existing.secondaryRecipeVersion && secondaryRuns) for (const ingredient of existing.secondaryRecipeVersion.ingredients) add(ingredient.itemId, new Decimal(ingredient.quantity.toString()).mul(new Decimal(1).add(new Decimal(ingredient.wastePercentage.toString()).div(100))).mul(secondaryRuns));
        for (const component of normalized.components) add(component.itemId, new Decimal(component.quantity));
        await tx.productionMaterial.deleteMany({ where: { productionOrderId: id } });
        await tx.productionComponent.deleteMany({ where: { productionOrderId: id } });
        await tx.productionMaterial.createMany({ data: Array.from(plannedMaterials, ([itemId, plannedQuantity]) => ({ productionOrderId: id, itemId, plannedQuantity })) });
        if (normalized.components.length) await tx.productionComponent.createMany({ data: normalized.components.map((component) => ({ productionOrderId: id, itemId: component.itemId, componentType: component.componentType, quantity: component.quantity, colorDetail: component.colorDetail || null })) });
        if (existing.salesOrderId) {
          await tx.salesOrderLine.updateMany({ where: { productionOrderId: id }, data: { productionOrderId: null } });
          await tx.salesOrderLine.updateMany({ where: { salesOrderId: existing.salesOrderId, productVariantId: { in: normalized.sizeProgram.map((item) => item.productVariantId) }, productionOrderId: null }, data: { productionOrderId: id } });
        }
      }
      return tx.productionOrder.update({
        where: { id },
        data: {
          operatorName: values.operatorName || null,
          modelLogo: values.modelLogo || null,
          brandColor: values.brandColor || null,
          productVariantId: values.sizeProgram[0].productVariantId,
          ...(existing.status === "DRAFT" ? { plannedQuantity, recipeRuns: plannedQuantity.div(existing.recipeVersion.yieldQuantity.toString()).toDecimalPlaces(6), secondaryRecipeRuns: existing.secondaryRecipeVersion ? plannedQuantity.div(existing.secondaryRecipeVersion.yieldQuantity.toString()).toDecimalPlaces(6) : null } : {}),
          sizeProgram: values.sizeProgram as Prisma.InputJsonValue,
          productionTurns: values.productionTurns as Prisma.InputJsonValue,
          dailyProduction: values.dailyProduction as Prisma.InputJsonValue,
        },
      });
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
