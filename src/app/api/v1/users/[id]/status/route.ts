import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const schema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "El estado no es válido.", 400);
    const actor = await requirePermission("users.deactivate");
    const { id } = await context.params;
    if (id === actor.id) return apiError("USER_SELF_STATUS", "No puedes desactivar tu propia cuenta.", 422);
    const target = await prisma.user.findFirst({ where: { id, companyId: actor.companyId } });
    if (!target) return apiError("USER_NOT_FOUND", "El usuario no existe.", 404);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { status: parsed.data.status } });
      if (parsed.data.status !== "ACTIVE") {
        await tx.session.updateMany({
          where: { userId: id, endedAt: null },
          data: { endedAt: new Date(), endReason: "ACCOUNT_DISABLED", endedById: actor.id },
        });
      }
      await tx.auditLog.create({ data: { companyId: actor.companyId, userId: actor.id, entity: "User", entityId: id, action: "STATUS_CHANGE", beforeData: { status: target.status }, afterData: { status: parsed.data.status } } });
      return updated;
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
