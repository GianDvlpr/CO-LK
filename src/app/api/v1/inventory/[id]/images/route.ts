import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { destroyInventoryImage, uploadInventoryImage } from "@/lib/cloudinary/server";
import { hasValidImageSignature, isAllowedProductImageMimeType, PRODUCT_IMAGE_MAX_BYTES } from "@/lib/cloudinary/image-validation";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("inventory.image_manage");
    const { id } = await context.params;
    const item = await prisma.inventoryItem.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, code: true, type: true, _count: { select: { images: true } } },
    });
    if (!item) return apiError("INVENTORY_NOT_FOUND", "El ítem no existe.", 404);
    if (item.type !== "RAW_MATERIAL") return apiError("INVENTORY_IMAGE_TYPE", "Solo las materias primas admiten imágenes.", 422);
    if (item._count.images >= 1) return apiError("INVENTORY_IMAGE_LIMIT", "Cada materia prima admite una sola imagen. Elimina la actual para reemplazarla.", 422);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return apiError("INVENTORY_IMAGE_REQUIRED", "Selecciona una imagen.", 400);
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) return apiError("INVENTORY_IMAGE_TOO_LARGE", "La imagen no puede superar 5 MB.", 413);
    if (!isAllowedProductImageMimeType(file.type)) return apiError("INVENTORY_IMAGE_TYPE_FILE", "Solo se permiten imágenes JPEG, PNG o WebP.", 415);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidImageSignature(bytes, file.type)) return apiError("INVENTORY_IMAGE_SIGNATURE", "El contenido del archivo no coincide con un formato de imagen permitido.", 422);

    const safeCode = item.code.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "material";
    const uploaded = await uploadInventoryImage({ bytes, mimeType: file.type, companyId: user.companyId, publicId: `${safeCode}-${randomUUID()}` });
    try {
      const image = await prisma.$transaction(async (tx) => {
        const created = await tx.inventoryItemImage.create({ data: {
          itemId: item.id,
          publicId: uploaded.public_id,
          secureUrl: uploaded.secure_url,
          fileName: file.name.slice(0, 255),
          mimeType: file.type,
          sizeBytes: uploaded.bytes,
          sortOrder: 0,
          createdById: user.id,
        } });
        await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "InventoryItemImage", entityId: created.id, action: "CREATE", afterData: { itemId: item.id, publicId: created.publicId, fileName: created.fileName, mimeType: created.mimeType, sizeBytes: created.sizeBytes } } });
        await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "inventory.item-image-added.v1", aggregateId: item.id, payload: { itemId: item.id, imageId: created.id } } });
        return created;
      });
      return apiSuccess(image, 201);
    } catch (error) {
      await destroyInventoryImage(uploaded.public_id).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Error && error.message === "CLOUDINARY_NOT_CONFIGURED") return apiError("CLOUDINARY_NOT_CONFIGURED", "Cloudinary todavía no está configurado.", 503);
    return apiError("INVENTORY_IMAGE_UPLOAD_FAILED", "No se pudo cargar la imagen. Inténtalo nuevamente.", 502);
  }
}
