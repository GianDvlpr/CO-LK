import { prisma } from "@/lib/database/prisma";
import { destroyWhiteboardImage } from "@/lib/cloudinary/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { whiteboardContentSchema } from "@/modules/whiteboard/domain/whiteboard-schema";

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Error && error.message === "CLOUDINARY_NOT_CONFIGURED") return apiError("CLOUDINARY_NOT_CONFIGURED", "Cloudinary todavía no está configurado.", 503);
  return null;
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = known(error); if (response) return response; throw error; }
  try {
    const user = await requirePermission("whiteboard.manage");
    const { id } = await context.params;
    const asset = await prisma.whiteboardAsset.findFirst({ where: { id, whiteboard: { companyId: user.companyId } }, include: { whiteboard: true } });
    if (!asset) return apiError("WHITEBOARD_ASSET_NOT_FOUND", "La imagen ya no existe.", 404);
    const content = whiteboardContentSchema.parse(asset.whiteboard.content);
    if (content.elements.some((element) => element.type === "image" && element.assetId === asset.id)) return apiError("WHITEBOARD_ASSET_IN_USE", "Quita la imagen de la pizarra antes de eliminar el archivo.", 409);
    await prisma.$transaction(async (tx) => {
      await tx.whiteboardAsset.delete({ where: { id: asset.id } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "whiteboard", entity: "WhiteboardAsset", entityId: asset.id, action: "DELETE", beforeData: { fileName: asset.fileName } } });
    });
    await destroyWhiteboardImage(asset.publicId).catch(() => undefined);
    return apiSuccess({ deleted: true });
  } catch (error) {
    const response = known(error);
    if (response) return response;
    throw error;
  }
}
