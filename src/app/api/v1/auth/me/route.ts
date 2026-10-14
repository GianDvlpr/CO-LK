import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireUser } from "@/modules/auth/application/session-service";

export async function GET() {
  try {
    return apiSuccess(await requireUser());
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
