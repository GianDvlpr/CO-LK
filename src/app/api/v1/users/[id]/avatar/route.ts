import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { destroyProductImage, uploadUserAvatar } from "@/lib/cloudinary/server";
import { hasValidImageSignature, isAllowedProductImageMimeType, PRODUCT_IMAGE_MAX_BYTES } from "@/lib/cloudinary/image-validation";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { canSeeUser } from "@/modules/users/domain/privileged-user-policy";

export const runtime = "nodejs";

async function findTarget(companyId: string, id: string) {
  return prisma.user.findFirst({ where: { id, companyId }, include: { userRoles: { include: { role: { select: { code: true } } } } } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  try {
    const actor = await requirePermission("users.update");
    const { id } = await context.params;
    const target = await findTarget(actor.companyId, id);
    if (!target || !canSeeUser(actor.roles, target.userRoles.map((entry) => entry.role.code))) return apiError("USER_NOT_FOUND", "El usuario no existe.", 404);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return apiError("USER_AVATAR_REQUIRED", "Selecciona una imagen.", 400);
    if (file.size > PRODUCT_IMAGE_MAX_BYTES) return apiError("USER_AVATAR_TOO_LARGE", "La imagen no puede superar 5 MB.", 413);
    if (!isAllowedProductImageMimeType(file.type)) return apiError("USER_AVATAR_TYPE_FILE", "Solo se permiten imágenes JPEG, PNG o WebP.", 415);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidImageSignature(bytes, file.type)) return apiError("USER_AVATAR_SIGNATURE", "El contenido del archivo no coincide con un formato de imagen permitido.", 422);

    const uploaded = await uploadUserAvatar({ bytes, mimeType: file.type, companyId: actor.companyId, publicId: `user-${target.id}-${randomUUID()}` });
    let previousPublicId: string | null = null;
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.user.findUniqueOrThrow({ where: { id: target.id }, select: { avatarPublicId: true } });
        previousPublicId = current.avatarPublicId;
        const user = await tx.user.update({ where: { id: target.id }, data: { avatarUrl: uploaded.secure_url, avatarPublicId: uploaded.public_id }, select: { id: true, name: true, avatarUrl: true } });
        await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.id, module: "users", entity: "User", entityId: target.id, action: "UPDATE", afterData: { avatarUrl: uploaded.secure_url } } });
        await tx.outboxEvent.create({ data: { companyId: actor.companyId, topic: `private-company-${actor.companyId}`, eventName: "user.avatar-updated.v1", aggregateId: target.id, payload: { userId: target.id } } });
        return user;
      });
      if (previousPublicId) await destroyProductImage(previousPublicId).catch(() => undefined);
      return apiSuccess(updated);
    } catch (error) {
      await destroyProductImage(uploaded.public_id).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof Error && error.message === "CLOUDINARY_NOT_CONFIGURED") return apiError("CLOUDINARY_NOT_CONFIGURED", "Cloudinary todavía no está configurado.", 503);
    return apiError("USER_AVATAR_UPLOAD_FAILED", "No se pudo cargar la imagen. Inténtalo nuevamente.", 502);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  try {
    const actor = await requirePermission("users.update");
    const { id } = await context.params;
    const target = await findTarget(actor.companyId, id);
    if (!target || !canSeeUser(actor.roles, target.userRoles.map((entry) => entry.role.code))) return apiError("USER_NOT_FOUND", "El usuario no existe.", 404);
    if (!target.avatarUrl && !target.avatarPublicId) return apiSuccess({ id });
    const publicId = target.avatarPublicId;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { avatarUrl: null, avatarPublicId: null } });
      await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.id, module: "users", entity: "User", entityId: target.id, action: "UPDATE", beforeData: { avatarUrl: target.avatarUrl }, afterData: { avatarUrl: null } } });
      await tx.outboxEvent.create({ data: { companyId: actor.companyId, topic: `private-company-${actor.companyId}`, eventName: "user.avatar-updated.v1", aggregateId: target.id, payload: { userId: target.id } } });
    });
    if (publicId) await destroyProductImage(publicId).catch(() => undefined);
    return apiSuccess({ id });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
