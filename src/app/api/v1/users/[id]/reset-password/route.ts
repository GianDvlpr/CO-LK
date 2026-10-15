import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { resetUserPassword } from "@/modules/users/application/reset-user-password";
import { passwordResetPolicy } from "@/modules/users/domain/password-reset-policy";

const schema = z.object({
  temporaryPassword: z.string().min(6).max(128),
  confirmPassword: z.string().min(6).max(128),
}).refine((value) => value.temporaryPassword === value.confirmPassword, { message: "Las contraseñas no coinciden.", path: ["confirmPassword"] });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const actor = await requirePermission("users.update");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La contraseña temporal no es válida.", 400);
    const { id } = await context.params;
    const policy = passwordResetPolicy({ actorId: actor.id, targetId: id, actorRoles: actor.roles });
    if (policy === "SUPERADMIN_REQUIRED") return apiError("FORBIDDEN", "Solo un superadministrador puede restablecer contraseñas.", 403);
    if (policy === "SELF_RESET_NOT_ALLOWED") return apiError("USER_SELF_PASSWORD_RESET", "Usa Cambiar contraseña para actualizar tu propia cuenta.", 422);
    const result = await resetUserPassword(prisma, { companyId: actor.companyId, actorId: actor.id, targetId: id, temporaryPassword: parsed.data.temporaryPassword });
    if (!result) return apiError("USER_NOT_FOUND", "El usuario no existe.", 404);
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
