import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { changePassword } from "@/modules/auth/application/change-password";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres."),
});

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Revisa las contraseñas.", 400);
    }
    return apiSuccess(await changePassword(parsed.data.currentPassword, parsed.data.newPassword));
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
