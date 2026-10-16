import { prisma } from "@/lib/database/prisma";
import { authenticateCredentials, type LoginInput } from "./authenticate-credentials";
import { createSession } from "./session-service";

export async function login(input: LoginInput) {
  const user = await authenticateCredentials(prisma, input);
  await createSession(user.id, input.remember, { ipAddress: input.ipAddress, userAgent: input.userAgent });
  return { id: user.id, name: user.name, email: user.email, username: user.username, mustChangePassword: user.mustChangePassword };
}
