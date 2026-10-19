import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { login } from "@/modules/auth/application/login";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Revisa el usuario y la contraseña.", 400);
  try {
    const user = await login({ ...parsed.data, ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request) });
    return apiSuccess(user);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
