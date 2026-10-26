import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { destroyWhiteboardImage, uploadWhiteboardImage } from "@/lib/cloudinary/server";
import { hasValidImageSignature, isAllowedProductImageMimeType, PRODUCT_IMAGE_MAX_BYTES } from "@/lib/cloudinary/image-validation";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { emptyWhiteboardContent, whiteboardIdSchema } from "@/modules/whiteboard/domain/whiteboard-schema";

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Error && error.message === "CLOUDINARY_NOT_CONFIGURED") return apiError("CLOUDINARY_NOT_CONFIGURED", "Cloudinary todavía no está configurado.", 503);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("WHITEBOARD_ASSET_CONFLICT", "No se pudo registrar la imagen. Intenta nuevamente.", 409);
  return null;
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = known(error); if (response) return response; throw error; }
  try {
    const user = await requirePermission("whiteboard.manage");
    const form = await request.formData();
    const file = form.get("file");
    const requestedBoardId = form.get("whiteboardId");
    const boardId = typeof requestedBoardId === "string" && requestedBoardId ? requestedBoardId : null;
    if (boardId && !whiteboardIdSchema.safeParse(boardId).success) return apiError("VALIDATION_ERROR", "La pizarra seleccionada no es válida.", 400);
    if (!(file instanceof File)) return apiError("FILE_REQUIRED", "Selecciona una imagen.", 400);
    if (!isAllowedProductImageMimeType(file.type)) return apiError("INVALID_IMAGE_TYPE", "La imagen debe ser JPEG, PNG o WebP.", 400);
    if (file.size < 1 || file.size > PRODUCT_IMAGE_MAX_BYTES) return apiError("INVALID_IMAGE_SIZE", "La imagen no puede superar 5 MB.", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidImageSignature(bytes, file.type)) return apiError("INVALID_IMAGE_CONTENT", "El archivo no contiene una imagen válida.", 400);
    const upload = await uploadWhiteboardImage({ bytes, mimeType: file.type, companyId: user.companyId, publicId: randomUUID() });
    try {
      const result = await prisma.$transaction(async (tx) => {
        const selectedBoard = boardId
          ? await tx.whiteboard.findFirst({ where: { id: boardId, companyId: user.companyId } })
          : await tx.whiteboard.findFirst({ where: { companyId: user.companyId }, orderBy: { updatedAt: "desc" } });
        if (boardId && !selectedBoard) throw new Error("WHITEBOARD_NOT_FOUND");
        const board = selectedBoard ?? await tx.whiteboard.create({ data: {
          companyId: user.companyId,
          updatedById: user.id,
          title: "Pizarra sin título",
          content: emptyWhiteboardContent() as Prisma.InputJsonValue,
        } });
        const asset = await tx.whiteboardAsset.create({ data: { whiteboardId: board.id, createdById: user.id, publicId: upload.public_id, secureUrl: upload.secure_url, fileName: file.name.slice(0, 255) || "captura", mimeType: file.type, sizeBytes: file.size, width: upload.width ?? null, height: upload.height ?? null } });
        await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "whiteboard", entity: "WhiteboardAsset", entityId: asset.id, action: "CREATE", afterData: { fileName: asset.fileName, sizeBytes: asset.sizeBytes } } });
        return { asset: { id: asset.id, secureUrl: asset.secureUrl, fileName: asset.fileName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, width: asset.width, height: asset.height }, boardId: board.id, revision: board.revision };
      });
      return apiSuccess(result, 201);
    } catch (error) {
      await destroyWhiteboardImage(upload.public_id).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "WHITEBOARD_NOT_FOUND") return apiError("WHITEBOARD_NOT_FOUND", "La pizarra ya no existe.", 404);
    const response = known(error);
    if (response) return response;
    throw error;
  }
}
