import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { deleteCurrentSession } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await deleteCurrentSession();
    return apiSuccess({ loggedOut: true });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
