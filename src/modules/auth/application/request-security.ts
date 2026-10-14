import { AuthError } from "./auth-errors";

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AuthError("FORBIDDEN", "Origen de solicitud no autorizado.", 403);
  }
}
