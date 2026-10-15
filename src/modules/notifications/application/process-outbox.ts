import type { PrismaClient } from "@prisma/client";
import { getPusherServer } from "@/lib/pusher/server";
import { channelForEvent } from "@/lib/pusher/channels";
import { notificationContent, retryDelayMilliseconds } from "@/modules/notifications/domain/notification-content";

const MAX_ATTEMPTS = 5;

export async function processCompanyOutbox(database: PrismaClient, companyId: string, limit = 25) {
  const now = new Date();
  const candidates = await database.outboxEvent.findMany({
    where: { companyId, status: { in: ["PENDING", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS }, availableAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  let published = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const claimed = await database.outboxEvent.updateMany({
      where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts, availableAt: { lte: now } },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
    });
    if (!claimed.count) continue;
    const attempt = candidate.attempts + 1;
    const baseContent = notificationContent(candidate.eventName);
    const reminderTitle = candidate.eventName === "calendar.reminder.v1" && candidate.payload && typeof candidate.payload === "object" && !Array.isArray(candidate.payload) && typeof candidate.payload.title === "string" ? candidate.payload.title : null;
    const content = baseContent && reminderTitle ? { ...baseContent, message: `${reminderTitle} está próximo.` } : baseContent;
    const channel = channelForEvent(companyId, candidate.eventName);
    const eventPayload = {
      eventId: candidate.id,
      eventName: candidate.eventName,
      aggregateId: candidate.aggregateId,
      occurredAt: candidate.createdAt.toISOString(),
      data: candidate.payload,
      notification: content,
    };
    try {
      if (channel) await getPusherServer().trigger(channel, candidate.eventName, eventPayload);
      await database.$transaction(async (tx) => {
        if (content) {
          await tx.notification.upsert({
            where: { id: candidate.id },
            update: {},
            create: { id: candidate.id, companyId, type: content.type, title: content.title, message: content.message, data: eventPayload },
          });
        }
        await tx.outboxEvent.update({ where: { id: candidate.id }, data: { status: "PUBLISHED", publishedAt: new Date(), lastError: null } });
      });
      published += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1_000) : "Error desconocido al publicar en Pusher.";
      await database.outboxEvent.update({
        where: { id: candidate.id },
        data: { status: "FAILED", availableAt: new Date(Date.now() + retryDelayMilliseconds(attempt)), lastError: message },
      });
      failed += 1;
    }
  }
  return { examined: candidates.length, published, failed };
}

export async function processAllOutbox(database: PrismaClient, limitPerCompany = 25) {
  const companies = await database.outboxEvent.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS }, availableAt: { lte: new Date() } },
    distinct: ["companyId"],
    select: { companyId: true },
  });
  const results = [];
  for (const company of companies) results.push(await processCompanyOutbox(database, company.companyId, limitPerCompany));
  return results.reduce((total, result) => ({ examined: total.examined + result.examined, published: total.published + result.published, failed: total.failed + result.failed }), { examined: 0, published: 0, failed: 0 });
}
