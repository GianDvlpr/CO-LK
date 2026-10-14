import { hash, verify } from "@node-rs/argon2";
import type { PrismaClient } from "@prisma/client";
import { AuthError } from "./auth-errors";

export async function changePasswordForUser(database: PrismaClient, userId: string, currentPassword: string, newPassword: string) {
  const user = await database.user.findUnique({ where: { id: userId } });
  if (!user || !(await verify(user.passwordHash, currentPassword))) {
    throw new AuthError("INVALID_CURRENT_PASSWORD", "La contraseña actual no es correcta.", 400);
  }
  if (currentPassword === newPassword) {
    throw new AuthError("PASSWORD_NOT_CHANGED", "La nueva contraseña debe ser diferente.", 400);
  }
  await database.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(newPassword), mustChangePassword: false },
  });
  return { changed: true };
}
