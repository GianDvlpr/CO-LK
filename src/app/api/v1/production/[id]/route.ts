import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { productionSheetSchema, serializeProductionSheet, validateProductionSheetTotals } from "@/modules/production/domain/production-sheet";
import { customerBrandName, validateCustomerBrand } from "@/modules/production/domain/production-brand";
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
        recipeVersion: { include: { ingredients: true, costStructure: true } },
        secondaryRecipeVersion: { include: { ingredients: true, costStructure: true } },
        salesOrders: { include: { salesOrder: { include: { lines: true } } } },
        components: true,
      },
    });
    if (!existing) return apiError("PRODUCTION_NOT_FOUND", "La orden no existe.", 404);
    if (existing.targetType !== "PRODUCT" || !existing.productVariant) return apiError("PRODUCTION_EDIT_UNAVAILABLE", "La ficha por talla solo aplica a órdenes de producto terminado.", 422);
    const existingVariant = existing.productVariant;
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") return apiError("PRODUCTION_LOCKED", "Una orden finalizada o cancelada ya no puede editarse.", 422);

    const variantIds = Array.from(new Set([
      ...parsed.data.sizeProgram.map((item) => item.productVariantId),
      ...parsed.data.productionTurns.flatMap((turn) => turn.quantities.map((item) => item.productVariantId)),
      ...parsed.data.dailyProduction.map((item) => item.productVariantId),
    ].filter((value): value is string => Boolean(value))));
    const componentIds = Array.from(new Set(parsed.data.components.map((item) => item.itemId)));
    const [variants, componentItems] = await prisma.$transaction([
      prisma.productVariant.findMany({ where: { id: { in: variantIds }, active: true, productId: existingVariant.productId, product: { companyId: user.companyId } }, include: { size: true, color: true, secondaryColor: true } }),
      prisma.inventoryItem.findMany({ where: { id: { in: componentIds }, companyId: user.companyId, active: true }, select: { id: true } }),
    ]);
    if (variants.length !== variantIds.length || componentItems.length !== componentIds.length) return apiError("PRODUCTION_INVALID_REFERENCE", "Una talla o componente ya no está disponible.", 422);
    if (variants.some((variant) => variant.colorId !== existingVariant.colorId || (variant.secondaryColorId ?? null) !== (existingVariant.secondaryColorId ?? null))) return apiError("PRODUCTION_INVALID_COLOR_PAIR", "Todas las tallas deben conservar la combinación C1/C2 de la orden.", 422);
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
    if (existing.salesOrders.length) {
      const quantities = new Map<string, Decimal>();
      for (const link of existing.salesOrders) for (const line of link.salesOrder.lines) {
        if (!line.productionOrderId || line.productionOrderId === id) quantities.set(line.productVariantId, (quantities.get(line.productVariantId) ?? new Decimal(0)).add(line.quantity.toString()));
      }
      if (normalized.sizeProgram.some((item) => !quantities.has(item.productVariantId))) return apiError("PRODUCTION_INVALID_SALES_ORDER", "Los pedidos vinculados no contienen todas las tallas programadas.", 422);
      if (normalized.sizeProgram.some((item) => new Decimal(item.requestedPairs).greaterThan(quantities.get(item.productVariantId)!.toString()))) return apiError("PRODUCTION_EXCEEDS_SALES_ORDER", "La programación no puede superar la suma de pares de los pedidos vinculados.", 422);
    }

    const oldComponents = existing.components.map(componentKey).sort();
    const newComponents = normalized.components.map(componentKey).sort();    if (existing.status !== "DRAFT" && oldComponents.join(";") !== newComponents.join(";")) return apiError("PRODUCTION_COMPONENTS_LOCKED", "Los componentes solo pueden cambiar mientras la orden está pendiente.", 422);
    if (existing.status !== "DRAFT" && programKeys(existing.sizeProgram).join(";") !== programKeys(normalized.sizeProgram).join(";")) return apiError("PRODUCTION_PROGRAM_LOCKED", "Las tallas y cantidades solo pueden cambiar mientras la orden está pendiente.", 422);

    const brandUnchanged = Boolean(parsed.data.customerBrandId && parsed.data.customerBrandId === existing.customerBrandId);
    const customerBrand = parsed.data.customerBrandId
      ? await prisma.customerBrand.findFirst({
        where: brandUnchanged
          ? { id: parsed.data.customerBrandId, customer: { companyId: user.companyId } }
          : { id: parsed.data.customerBrandId, active: true, customer: { companyId: user.companyId, active: true } },
      })
      : null;
    if (parsed.data.customerBrandId && !customerBrand) return apiError("PRODUCTION_INVALID_BRAND", "El logo/marca no está disponible para esta empresa.", 422);
    const brandIssue = validateCustomerBrand(customerBrand, existing.salesOrders.map((link) => link.salesOrder.customerId));
    if (brandIssue) return apiError(brandIssue.code, brandIssue.message, 422);

    const values = serializeProductionSheet(normalized);
    const result = await prisma.$transaction(async (tx) => {
      if (existing.status === "DRAFT") {
        const plannedMaterials = new Map<string, Decimal>();
        const add = (itemId: string, quantity: Decimal) => plannedMaterials.set(itemId, (plannedMaterials.get(itemId) ?? new Decimal(0)).add(quantity).toDecimalPlaces(6));
        const primaryRuns = plannedQuantity.div(existing.recipeVersion.yieldQuantity.toString()).toDecimalPlaces(6);
        const secondaryRuns = existing.secondaryRecipeVersion ? plannedQuantity.div(existing.secondaryRecipeVersion.yieldQuantity.toString()).toDecimalPlaces(6) : null;
        for (const ingredient of existing.recipeVersion.ingredients) add(ingredient.itemId, new Decimal(ingredient.quantity.toString()).mul(primaryRuns));
        if (existing.secondaryRecipeVersion && secondaryRuns) for (const ingredient of existing.secondaryRecipeVersion.ingredients) add(ingredient.itemId, new Decimal(ingredient.quantity.toString()).mul(secondaryRuns));
        for (const component of normalized.components) add(component.itemId, new Decimal(component.quantity));
        await tx.productionMaterial.deleteMany({ where: { productionOrderId: id } });
        await tx.productionComponent.deleteMany({ where: { productionOrderId: id } });
        await tx.productionMaterial.createMany({ data: Array.from(plannedMaterials, ([itemId, plannedQuantity]) => ({ productionOrderId: id, itemId, plannedQuantity })) });
        if (normalized.components.length) await tx.productionComponent.createMany({ data: normalized.components.map((component) => ({ productionOrderId: id, itemId: component.itemId, componentType: component.componentType, quantity: component.quantity, colorDetail: component.colorDetail || null })) });
        if (existing.salesOrders.length) {
          await tx.salesOrderLine.updateMany({ where: { productionOrderId: id }, data: { productionOrderId: null } });
          await tx.salesOrderLine.updateMany({ where: { salesOrderId: { in: existing.salesOrders.map((link) => link.salesOrderId) }, productVariantId: { in: normalized.sizeProgram.map((item) => item.productVariantId) }, productionOrderId: null }, data: { productionOrderId: id } });
        }
      }
      return tx.productionOrder.update({
        where: { id },
        data: {
          operatorName: values.operatorName || null,
          modelLogo: values.modelLogo || customerBrandName(customerBrand) || null,
          brandColor: values.brandColor || null,
          customerBrandId: values.customerBrandId ?? null,
          productVariantId: values.sizeProgram[0].productVariantId,
          ...(existing.status === "DRAFT" ? (() => {
            const primaryRuns = plannedQuantity.div(existing.recipeVersion.yieldQuantity.toString()).toDecimalPlaces(6);
            const secondaryRuns = existing.secondaryRecipeVersion ? plannedQuantity.div(existing.secondaryRecipeVersion.yieldQuantity.toString()).toDecimalPlaces(6) : null;
            const tariff = (field: "laborTariff" | "energyTariff" | "waterTariff" | "machineryCost") => new Decimal(existing.recipeVersion.costStructure?.[field].toString() ?? 0).mul(primaryRuns).add(new Decimal(existing.secondaryRecipeVersion?.costStructure?.[field].toString() ?? 0).mul(secondaryRuns ?? 0)).toDecimalPlaces(6);
            return { plannedQuantity, recipeRuns: primaryRuns, secondaryRecipeRuns: secondaryRuns, laborTariff: tariff("laborTariff"), energyTariff: tariff("energyTariff"), waterTariff: tariff("waterTariff"), machineryCost: tariff("machineryCost") };
          })() : {}),
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
