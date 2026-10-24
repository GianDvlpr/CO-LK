import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/database/prisma";
import { readServerEnv } from "@/lib/env/server";
import { sessionExpiresAt } from "@/modules/auth/domain/session-expiration";
import { AuthError } from "./auth-errors";

const LAST_SEEN_WRITE_INTERVAL_MS = 2 * 60 * 1000;

function sessionConfig() {
  const env = readServerEnv();
  if (!env.SESSION_SECRET) {
    throw new AuthError("AUTH_NOT_CONFIGURED", "La autenticación todavía no está configurada.", 503);
  }
  return { secret: env.SESSION_SECRET, cookieName: env.SESSION_COOKIE_NAME };
}

function hashToken(token: string, secret: string) {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export type AuthenticatedUser = {
  sessionId: string;
  id: string;
  companyId: string;
  username: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
};

type SessionUserRow = {
  sessionId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  endedAt: Date | null;
  userId: string;
  companyId: string;
  username: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  mustChangePassword: boolean;
  status: string;
  roles: string[];
  permissions: string[];
};

export async function createSession(userId: string, metadata?: { ipAddress?: string; userAgent?: string }) {
  const { secret, cookieName } = sessionConfig();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiresAt();
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token, secret),
      expiresAt,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    },
  });
  const store = await cookies();
  store.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return session;
}

export async function deleteCurrentSession() {
  const { secret, cookieName } = sessionConfig();
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token, secret), endedAt: null },
      data: { endedAt: new Date(), endReason: "LOGOUT" },
    });
  }
  store.delete(cookieName);
}

async function loadCurrentUser(): Promise<AuthenticatedUser | null> {
  const { secret, cookieName } = sessionConfig();
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token, secret);
  const [session] = await prisma.$queryRaw<SessionUserRow[]>`
    SELECT
      s.id AS "sessionId",
      s.expires_at AS "expiresAt",
      s.last_seen_at AS "lastSeenAt",
      s.ended_at AS "endedAt",
      u.id AS "userId",
      u.company_id AS "companyId",
      u.username,
      u.email,
      u.name,
      u.avatar_url AS "avatarUrl",
      u.must_change_password AS "mustChangePassword",
      u.status::text AS status,
      COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) AS roles,
      COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), ARRAY[]::text[]) AS permissions
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE s.token_hash = ${tokenHash}
    GROUP BY s.id, u.id
    LIMIT 1
  `;
  const now = new Date();
  if (!session) return null;
  if (session.endedAt) return null;
  if (session.expiresAt <= now) {
    await prisma.session.updateMany({
      where: { id: session.sessionId, endedAt: null },
      data: { endedAt: session.expiresAt, endReason: "EXPIRED" },
    });
    return null;
  }
  if (session.status !== "ACTIVE") {
    await prisma.session.updateMany({
      where: { id: session.sessionId, endedAt: null },
      data: { endedAt: now, endReason: "ACCOUNT_DISABLED" },
    });
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= LAST_SEEN_WRITE_INTERVAL_MS) {
    await prisma.session.updateMany({
      where: { id: session.sessionId, endedAt: null, lastSeenAt: { lte: new Date(now.getTime() - LAST_SEEN_WRITE_INTERVAL_MS) } },
      data: { lastSeenAt: now },
    });
  }

  return {
    sessionId: session.sessionId,
    id: session.userId,
    companyId: session.companyId,
    username: session.username,
    email: session.email,
    name: session.name,
    avatarUrl: session.avatarUrl ?? null,
    mustChangePassword: session.mustChangePassword,
    roles: session.roles,
    permissions: session.permissions,
  };
}

// Evita repetir la misma consulta cuando el layout y la página validan
// la sesión dentro de una única navegación renderizada por el servidor.
export const getCurrentUser = cache(loadCurrentUser);

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", "Debes iniciar sesión.", 401);
  return user;
}

export async function requirePermission(permission: string) {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) throw new AuthError("FORBIDDEN", "No tienes permiso para realizar esta operación.", 403);
  return user;
}
