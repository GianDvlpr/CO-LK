import { z } from "zod";
import { apiError } from "@/lib/http/api-response";
import { getPusherServer } from "@/lib/pusher/server";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireUser } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { authorizedRealtimeChannels } from "@/lib/pusher/channels";

const bodySchema = z.object({ socket_id: z.string().min(1), channel_name: z.string().min(1) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
  const form = await request.formData();
  const parsed = bodySchema.safeParse({ socket_id: form.get("socket_id"), channel_name: form.get("channel_name") });
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Solicitud Pusher inválida.", 400);
  try {
    const user = await requireUser();
    if (!authorizedRealtimeChannels(user.companyId, user.permissions).includes(parsed.data.channel_name)) {
      return apiError("FORBIDDEN", "Canal no autorizado.", 403);
    }
    return Response.json(getPusherServer().authorizeChannel(parsed.data.socket_id, parsed.data.channel_name));
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
