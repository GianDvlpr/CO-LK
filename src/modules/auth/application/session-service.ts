import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
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
  mustChangePassword: boolean;
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

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const { secret, cookieName } = sessionConfig();
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token, secret) },
    include: {
      user: {
        include: {
          userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      },
    },
  });
  const now = new Date();
  if (!session) return null;
  if (session.endedAt) return null;
  if (session.expiresAt <= now) {
    await prisma.session.updateMany({
      where: { id: session.id, endedAt: null },
      data: { endedAt: session.expiresAt, endReason: "EXPIRED" },
    });
    return null;
  }
  if (session.user.status !== "ACTIVE") {
    await prisma.session.updateMany({
      where: { id: session.id, endedAt: null },
      data: { endedAt: now, endReason: "ACCOUNT_DISABLED" },
    });
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= LAST_SEEN_WRITE_INTERVAL_MS) {
    await prisma.session.updateMany({
      where: { id: session.id, endedAt: null, lastSeenAt: { lte: new Date(now.getTime() - LAST_SEEN_WRITE_INTERVAL_MS) } },
      data: { lastSeenAt: now },
    });
  }

  return {
    sessionId: session.id,
    id: session.user.id,
    companyId: session.user.companyId,
    username: session.user.username,
    email: session.user.email,
    name: session.user.name,
    mustChangePassword: session.user.mustChangePassword,
    roles: session.user.userRoles.map(({ role }) => role.code),
    permissions: [...new Set(session.user.userRoles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code)))],
  };
}

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
