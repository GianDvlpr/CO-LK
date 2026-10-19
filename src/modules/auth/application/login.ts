import { prisma } from "@/lib/database/prisma";
import { authenticateCredentials, type LoginInput } from "./authenticate-credentials";
import { createSession } from "./session-service";
import { SESSION_DURATION_HOURS } from "@/modules/auth/domain/session-expiration";

export async function login(input: LoginInput) {
  const user = await authenticateCredentials(prisma, input);
  const session = await createSession(user.id, { ipAddress: input.ipAddress, userAgent: input.userAgent });
  await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "sessions", entity: "Session", entityId: session.id, action: "LOGIN", ipAddress: input.ipAddress, userAgent: input.userAgent, requestPath: "/login", afterData: { durationHours: SESSION_DURATION_HOURS, expiresAt: session.expiresAt.toISOString() } } });
  return { id: user.id, name: user.name, email: user.email, username: user.username, mustChangePassword: user.mustChangePassword };
}
