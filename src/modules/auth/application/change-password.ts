import { prisma } from "@/lib/database/prisma";
import { changePasswordForUser } from "./change-password-for-user";
import { requireUser } from "./session-service";

export async function changePassword(currentPassword: string, newPassword: string) {
  const sessionUser = await requireUser();
  return changePasswordForUser(prisma, sessionUser.id, currentPassword, newPassword);
}
