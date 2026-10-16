import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "@prisma/client";

export async function resetUserPassword(database: PrismaClient, command: { companyId: string; actorId: string; targetId: string; temporaryPassword: string }) {
  const target = await database.user.findFirst({ where: { id: command.targetId, companyId: command.companyId }, select: { id: true, username: true } });
  if (!target) return null;

  await database.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { passwordHash: await hash(command.temporaryPassword), mustChangePassword: true } });
    await tx.session.updateMany({
      where: { userId: target.id, endedAt: null },
      data: { endedAt: new Date(), endReason: "PASSWORD_RESET", endedById: command.actorId },
    });
    await tx.auditLog.create({ data: { companyId: command.companyId, userId: command.actorId, entity: "User", entityId: target.id, action: "RESET_PASSWORD", afterData: { username: target.username, mustChangePassword: true, sessionsRevoked: true } } });
    await tx.outboxEvent.create({ data: { companyId: command.companyId, topic: `private-company-${command.companyId}`, eventName: "user.password_reset.v1", aggregateId: target.id, payload: { userId: target.id, username: target.username, mustChangePassword: true } } });
  });

  return { reset: true, mustChangePassword: true };
}
