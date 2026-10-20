import { prisma } from "@/lib/database/prisma";
import { destroyInventoryImage } from "@/lib/cloudinary/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("inventory.image_manage");
    const { id, imageId } = await context.params;
    const image = await prisma.inventoryItemImage.findFirst({ where: { id: imageId, itemId: id, item: { companyId: user.companyId } } });
    if (!image) return apiError("INVENTORY_IMAGE_NOT_FOUND", "La imagen no existe.", 404);

    await destroyInventoryImage(image.publicId);
    await prisma.$transaction(async (tx) => {
      await tx.inventoryItemImage.delete({ where: { id: image.id } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "InventoryItemImage", entityId: image.id, action: "DELETE", beforeData: { itemId: image.itemId, publicId: image.publicId, fileName: image.fileName } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "inventory.item-image-removed.v1", aggregateId: image.itemId, payload: { itemId: image.itemId, imageId: image.id } } });
    });
    return apiSuccess({ id: image.id });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Error && error.message === "CLOUDINARY_NOT_CONFIGURED") return apiError("CLOUDINARY_NOT_CONFIGURED", "Cloudinary todavía no está configurado.", 503);
    return apiError("INVENTORY_IMAGE_DELETE_FAILED", "No se pudo eliminar la imagen. Inténtalo nuevamente.", 502);
  }
}
