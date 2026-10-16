import { verify } from "@node-rs/argon2";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { AuthError } from "./auth-errors";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function bucketKey(username: string, ipAddress: string) {
  return createHash("sha256").update(`${username.toLowerCase()}:${ipAddress}`).digest("hex");
}

export type LoginInput = { username: string; password: string; remember: boolean; ipAddress: string; userAgent?: string };

export async function authenticateCredentials(database: PrismaClient, input: LoginInput) {
  const username = input.username.trim().toLowerCase();
  const key = bucketKey(username, input.ipAddress);
  const now = new Date();
  const bucket = await database.rateLimitBucket.findUnique({ where: { key } });
  if (bucket?.blockedUntil && bucket.blockedUntil > now) {
    throw new AuthError("RATE_LIMITED", "Demasiados intentos. Intenta nuevamente en 15 minutos.", 429);
  }

  const users = await database.user.findMany({ where: { username, status: "ACTIVE" }, take: 2 });
  const user = users.length === 1 ? users[0] : null;
  const valid = user ? await verify(user.passwordHash, input.password) : false;

  if (!user || !valid) {
    const windowExpired = !bucket || now.getTime() - bucket.windowStart.getTime() >= WINDOW_MS;
    const attempts = windowExpired ? 1 : bucket.attempts + 1;
    await database.rateLimitBucket.upsert({
      where: { key },
      update: { attempts, windowStart: windowExpired ? now : bucket.windowStart, blockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + WINDOW_MS) : null },
      create: { key, attempts: 1, windowStart: now },
    });
    throw new AuthError("INVALID_CREDENTIALS", "Usuario o contraseña incorrectos.", 401);
  }

  await database.rateLimitBucket.deleteMany({ where: { key } });
  return user;
}
