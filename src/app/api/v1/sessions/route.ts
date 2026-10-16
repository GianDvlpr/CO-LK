import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { getEffectiveSessionEnd, getEffectiveSessionReason } from "@/modules/auth/application/session-monitoring";
import { requirePermission } from "@/modules/auth/application/session-service";

const querySchema = z.object({
  status: z.enum(["all", "active", "closed"]).default("all"),
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export async function GET(request: Request) {
  try {
    const actor = await requirePermission("sessions.read");
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Los filtros de sesiones no son válidos.", 400);

    const { status, search, page, pageSize } = parsed.data;
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const companyFilter: Prisma.SessionWhereInput = { user: { companyId: actor.companyId } };
    const where: Prisma.SessionWhereInput = {
      ...companyFilter,
      ...(status === "active" ? { endedAt: null, expiresAt: { gt: now } } : {}),
      ...(status === "closed" ? { OR: [{ endedAt: { not: null } }, { expiresAt: { lte: now } }] } : {}),
      ...(search ? {
        AND: [{
          OR: [
            { user: { name: { contains: search, mode: "insensitive" } } },
            { user: { username: { contains: search, mode: "insensitive" } } },
            { ipAddress: { contains: search, mode: "insensitive" } },
          ],
        }],
      } : {}),
    };

    const activeWhere: Prisma.SessionWhereInput = { ...companyFilter, endedAt: null, expiresAt: { gt: now } };
    const [sessions, total, active, signedInToday, closedToday, activeUsers] = await Promise.all([
      prisma.session.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          endedAt: true,
          endReason: true,
          endedBy: { select: { name: true, username: true } },
          user: { select: { id: true, name: true, username: true } },
        },
      }),
      prisma.session.count({ where }),
      prisma.session.count({ where: activeWhere }),
      prisma.session.count({ where: { ...companyFilter, createdAt: { gte: startOfToday } } }),
      prisma.session.count({ where: { ...companyFilter, OR: [{ endedAt: { gte: startOfToday } }, { endedAt: null, expiresAt: { gte: startOfToday, lte: now } }] } }),
      prisma.session.findMany({ where: activeWhere, distinct: ["userId"], select: { userId: true } }),
    ]);

    return apiSuccess({
      items: sessions.map((session) => {
        const effectiveEndedAt = getEffectiveSessionEnd(session, now);
        return {
          ...session,
          current: session.id === actor.sessionId,
          status: effectiveEndedAt ? "CLOSED" : "ACTIVE",
          effectiveEndedAt,
          effectiveEndReason: getEffectiveSessionReason(session, now),
        };
      }),
      pagination: { page, pageSize, total },
      summary: { active, activeUsers: activeUsers.length, signedInToday, closedToday },
      observedAt: now,
    });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
