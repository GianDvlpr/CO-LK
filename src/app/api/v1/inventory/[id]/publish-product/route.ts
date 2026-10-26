import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { nextBusinessCode } from "@/lib/database/business-code";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { buildProductSku, normalizeMatrixCode } from "@/modules/products/domain/product-sku";

const schema = z.object({
  matrixCode: z.string().trim().min(1).max(50),
  productName: z.string().trim().min(1).max(150),
  colorCode: z.string().trim().min(1).max(30).default("NEG"),
  colorName: z.string().trim().min(1).max(80).default("Negro"),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("products.create");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Los datos para publicar el producto no son válidos.", 400);
    const { id } = await context.params;
    const matrixCode = normalizeMatrixCode(parsed.data.matrixCode);
    const colorCode = normalizeMatrixCode(parsed.data.colorCode);
    if (!matrixCode || !colorCode) return apiError("PRODUCT_INVALID_REFERENCE", "El código de producto o color no es válido.", 422);

    const product = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`publish-intermediate:${id}`}, 0))`;
      const item = await tx.inventoryItem.findFirst({
        where: { id, companyId: user.companyId, type: "INTERMEDIATE", active: true },
        include: { productVariants: { select: { id: true } } },
      });
      if (!item) throw new Error("PRODUCT_SOURCE_NOT_FOUND");
      if (item.productVariants.length) throw new Error("PRODUCT_SOURCE_ALREADY_LINKED");

      const [size, color] = await Promise.all([
        tx.size.upsert({ where: { companyId_code: { companyId: user.companyId, code: "EST" } }, update: { name: "Estándar" }, create: { companyId: user.companyId, code: "EST", name: "Estándar", sortOrder: 0 } }),
        tx.color.upsert({ where: { companyId_code: { companyId: user.companyId, code: colorCode } }, update: {}, create: { companyId: user.companyId, code: colorCode, name: parsed.data.colorName } }),
      ]);
      const sku = buildProductSku({ matrixCode, primaryColorCode: color.code, sizeCode: size.code });
      const code = await nextBusinessCode(tx, user.companyId, "PRODUCT");
      const created = await tx.product.create({
        data: {
          companyId: user.companyId,
          code,
          matrixCode,
          name: parsed.data.productName,
          description: `Producto vendible vinculado al stock ${item.code} de Almacén.`,
          variants: { create: { sizeId: size.id, colorId: color.id, inventoryItemId: item.id, sku } },
        },
      });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "Product", entityId: created.id, action: "CREATE", afterData: { code: created.code, matrixCode, sku, sourceInventoryItemId: item.id, sourceInventoryItemCode: item.code } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "product.created-from-inventory.v1", aggregateId: created.id, payload: { productId: created.id, inventoryItemId: item.id } } });
      return created;
    });
    return apiSuccess(product, 201);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Error && error.message === "PRODUCT_SOURCE_NOT_FOUND") return apiError("PRODUCT_SOURCE_NOT_FOUND", "El insumo elaborado no existe o está inactivo.", 404);
    if (error instanceof Error && error.message === "PRODUCT_SOURCE_ALREADY_LINKED") return apiError("PRODUCT_SOURCE_ALREADY_LINKED", "Este ítem ya está publicado como producto.", 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("PRODUCT_DUPLICATE", "El código de matriz o SKU ya está en uso.", 409);
    throw error;
  }
}
