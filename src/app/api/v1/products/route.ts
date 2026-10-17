import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { nextBusinessCode } from "@/lib/database/business-code";
import { buildProductSku, normalizeMatrixCode, productVariantColorLabel } from "@/modules/products/domain/product-sku";

const createSchema = z.object({
  matrixCode: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(150), description: z.string().trim().max(500).optional(),
  unitId: z.uuid(), minimumStock: z.union([z.string(), z.number()]).default(0),
  variants: z.array(z.object({ sizeId: z.uuid(), colorId: z.uuid(), secondaryColorId: z.uuid().optional() })).min(1),
});

function knownError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("PRODUCT_DUPLICATE", "El código, SKU o combinación talla/color ya existe.", 409);
  return null;
}

export async function GET() {
  try {
    const user = await requirePermission("products.read");
    const items = await prisma.product.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, include: { images: { orderBy: { sortOrder: "asc" } }, variants: { orderBy: { sku: "asc" }, include: { size: true, color: true, secondaryColor: true, inventoryItem: { include: { unit: { select: { symbol: true } }, balances: { where: { lotId: null }, select: { onHandQuantity: true } } } } } }, _count: { select: { recipes: true } } } });
    return apiSuccess({ items });
  } catch (error) { const response = knownError(error); if (response) return response; throw error; }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "El producto contiene datos inválidos.", 400);
  const combinations = parsed.data.variants.map((variant) => `${variant.sizeId}:${variant.colorId}:${variant.secondaryColorId ?? ""}`);
  if (new Set(combinations).size !== combinations.length || parsed.data.variants.some((variant) => variant.secondaryColorId === variant.colorId)) return apiError("PRODUCT_DUPLICATE_VARIANT", "No repitas combinaciones ni selecciones el mismo color como C1 y C2.", 422);
  try {
    const user = await requirePermission("products.create");
    const created = await prisma.$transaction(async (tx) => {
      const colorIds = Array.from(new Set(parsed.data.variants.flatMap((variant) => [variant.colorId, variant.secondaryColorId]).filter((value): value is string => Boolean(value))));
      const [unit, sizes, colors] = await Promise.all([
        tx.unitOfMeasure.findFirst({ where: { id: parsed.data.unitId, companyId: user.companyId } }),
        tx.size.findMany({ where: { companyId: user.companyId, id: { in: parsed.data.variants.map((variant) => variant.sizeId) } } }),
        tx.color.findMany({ where: { companyId: user.companyId, id: { in: colorIds } } }),
      ]);
      if (!unit || sizes.length !== new Set(parsed.data.variants.map((variant) => variant.sizeId)).size || colors.length !== colorIds.length) throw new Error("PRODUCT_INVALID_REFERENCE");
      const matrixCode = normalizeMatrixCode(parsed.data.matrixCode);
      if (!matrixCode) throw new Error("PRODUCT_INVALID_MATRIX");
      const code = await nextBusinessCode(tx, user.companyId, "PRODUCT");
      const product = await tx.product.create({ data: { companyId: user.companyId, code, matrixCode, name: parsed.data.name, description: parsed.data.description } });
      const sizeMap = new Map(sizes.map((size) => [size.id, size])); const colorMap = new Map(colors.map((color) => [color.id, color]));
      for (const variant of parsed.data.variants) {
        const primary = colorMap.get(variant.colorId)!;
        const secondary = variant.secondaryColorId ? colorMap.get(variant.secondaryColorId)! : undefined;
        const sku = buildProductSku({ matrixCode, primaryColorCode: primary.code, secondaryColorCode: secondary?.code, sizeCode: sizeMap.get(variant.sizeId)!.code });
        const item = await tx.inventoryItem.create({ data: { companyId: user.companyId, code: sku, name: `${parsed.data.name} · ${sizeMap.get(variant.sizeId)!.name} · ${productVariantColorLabel(primary.name, secondary?.name)}`, type: "FINISHED_PRODUCT", unitId: parsed.data.unitId, minimumStock: parsed.data.minimumStock, lotTrackingMode: "NONE" } });
        await tx.productVariant.create({ data: { productId: product.id, sizeId: variant.sizeId, colorId: variant.colorId, secondaryColorId: variant.secondaryColorId || null, inventoryItemId: item.id, sku } });
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "Product", entityId: product.id, action: "CREATE", afterData: { code: product.code, variantCount: parsed.data.variants.length } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "product.created.v1", aggregateId: product.id, payload: { productId: product.id, code: product.code } } });
      return product;
    });
    return apiSuccess(created, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_INVALID_REFERENCE") return apiError("PRODUCT_INVALID_REFERENCE", "La unidad, talla o color no pertenece a la empresa.", 422);
    if (error instanceof Error && error.message === "PRODUCT_INVALID_MATRIX") return apiError("PRODUCT_INVALID_MATRIX", "El código de matriz no es válido.", 422);
    const response = knownError(error); if (response) return response; throw error;
  }
}
