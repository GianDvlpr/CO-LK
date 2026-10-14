import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/database/prisma";
import { readServerEnv } from "@/lib/env/server";
import { AuthError } from "./auth-errors";

const SHORT_SESSION_HOURS = 12;
const REMEMBER_SESSION_DAYS = 30;

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
  id: string;
  companyId: string;
  username: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
};

export async function createSession(userId: string, remember: boolean) {
  const { secret, cookieName } = sessionConfig();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (remember ? REMEMBER_SESSION_DAYS * 24 : SHORT_SESSION_HOURS) * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token, secret), expiresAt } });
  const store = await cookies();
  store.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteCurrentSession() {
  const { secret, cookieName } = sessionConfig();
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token, secret) } });
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
  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return {
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
