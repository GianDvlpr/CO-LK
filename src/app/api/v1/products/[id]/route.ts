import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { buildProductSku, normalizeMatrixCode, productVariantColorLabel } from "@/modules/products/domain/product-sku";

const schema = z.object({
  matrixCode: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional(),
  active: z.boolean(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("products.update");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "El producto contiene datos inválidos.", 400);
    const { id } = await context.params;
    const product = await prisma.product.findFirst({
      where: { id, companyId: user.companyId },
      include: { variants: { include: { size: true, color: true, secondaryColor: true, inventoryItem: true } } },
    });
    if (!product) return apiError("PRODUCT_NOT_FOUND", "El producto no existe.", 404);
    const matrixCode = normalizeMatrixCode(parsed.data.matrixCode);
    if (!matrixCode) return apiError("PRODUCT_INVALID_MATRIX", "El código de matriz no es válido.", 422);

    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.product.update({ where: { id }, data: { ...parsed.data, matrixCode, description: parsed.data.description || null } });
      for (const variant of product.variants) {
        const sku = buildProductSku({ matrixCode, primaryColorCode: variant.color.code, secondaryColorCode: variant.secondaryColor?.code, sizeCode: variant.size.code });
        const colorLabel = productVariantColorLabel(variant.color.name, variant.secondaryColor?.name);
        if (variant.inventoryItem.type === "FINISHED_PRODUCT") {
          await tx.inventoryItem.update({ where: { id: variant.inventoryItemId }, data: { code: sku, name: `${parsed.data.name} · ${variant.size.name} · ${colorLabel}`, active: parsed.data.active } });
        }
        await tx.productVariant.update({ where: { id: variant.id }, data: { sku, active: parsed.data.active } });
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "Product", entityId: id, action: "UPDATE", beforeData: { name: product.name, matrixCode: product.matrixCode, description: product.description, active: product.active }, afterData: { ...parsed.data, matrixCode } } });
      return value;
    });
    return apiSuccess(updated);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("PRODUCT_DUPLICATE", "El código de matriz o uno de los SKU generados ya existe.", 409);
    throw error;
  }
}
