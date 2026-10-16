export type SessionEndReasonValue = "LOGOUT" | "REVOKED" | "PASSWORD_RESET" | "ACCOUNT_DISABLED" | "EXPIRED";

export function getEffectiveSessionEnd(
  session: { endedAt: Date | null; expiresAt: Date },
  now = new Date(),
) {
  if (session.endedAt) return session.endedAt;
  return session.expiresAt <= now ? session.expiresAt : null;
}

export function getEffectiveSessionReason(
  session: { endedAt: Date | null; endReason: SessionEndReasonValue | null; expiresAt: Date },
  now = new Date(),
): SessionEndReasonValue | null {
  if (session.endReason) return session.endReason;
  return !session.endedAt && session.expiresAt <= now ? "EXPIRED" : null;
}

export function describeUserAgent(userAgent?: string | null) {
  if (!userAgent) return "No disponible";

  const browser =
    /Edg\//.test(userAgent) ? "Edge" :
    /OPR\//.test(userAgent) ? "Opera" :
    /Chrome\//.test(userAgent) ? "Chrome" :
    /Firefox\//.test(userAgent) ? "Firefox" :
    /Safari\//.test(userAgent) ? "Safari" : "Otro navegador";
  const system =
    /Android/.test(userAgent) ? "Android" :
    /iPhone|iPad|iPod/.test(userAgent) ? "iOS" :
    /Windows/.test(userAgent) ? "Windows" :
    /Mac OS X/.test(userAgent) ? "macOS" :
    /Linux/.test(userAgent) ? "Linux" : "Dispositivo desconocido";

  return `${browser} · ${system}`;
}
