import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { calendarEventSchema, calendarReminderAt } from "@/modules/calendar/application/manual-event-schema";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("calendar.update");
    const parsed = calendarEventSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "El evento contiene datos inválidos.", 400);
    const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.calendarEvent.findFirst({ where: { id, companyId: user.companyId } });
      if (!current) return null;
      const reminderChanged = current.startAt.getTime() !== parsed.data.startAt.getTime() || current.reminderMinutes !== (parsed.data.reminderMinutes ?? null) || current.status !== parsed.data.status;
      const updated = await tx.calendarEvent.update({ where: { id }, data: { ...parsed.data, endAt: parsed.data.endAt ?? null, description: parsed.data.description || null, reminderMinutes: parsed.data.reminderMinutes ?? null } });
      if (reminderChanged) {
        await tx.outboxEvent.deleteMany({ where: { companyId: user.companyId, aggregateId: id, eventName: "calendar.reminder.v1", status: { in: ["PENDING", "FAILED"] } } });
        if (updated.status === "PENDING" && updated.reminderMinutes !== null && updated.startAt > new Date()) await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "calendar.reminder.v1", aggregateId: id, availableAt: calendarReminderAt(updated.startAt, updated.reminderMinutes), payload: { calendarEventId: id, title: updated.title, startAt: updated.startAt.toISOString() } } });
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "CalendarEvent", entityId: id, action: "UPDATE", afterData: { title: updated.title, startAt: updated.startAt.toISOString(), status: updated.status } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "calendar.updated.v1", aggregateId: id, payload: { calendarEventId: id, title: updated.title } } });
      return updated;
    });
    if (!result) return apiError("CALENDAR_EVENT_NOT_FOUND", "El evento no existe.", 404);
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("calendar.delete");
    const { id } = await context.params;
    const deleted = await prisma.$transaction(async (tx) => {
      const current = await tx.calendarEvent.findFirst({ where: { id, companyId: user.companyId } });
      if (!current) return null;
      await tx.outboxEvent.deleteMany({ where: { companyId: user.companyId, aggregateId: id, eventName: "calendar.reminder.v1", status: { in: ["PENDING", "FAILED"] } } });
      await tx.calendarEvent.delete({ where: { id } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "CalendarEvent", entityId: id, action: "DELETE", beforeData: { title: current.title, startAt: current.startAt.toISOString() } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "calendar.deleted.v1", aggregateId: id, payload: { calendarEventId: id } } });
      return current;
    });
    if (!deleted) return apiError("CALENDAR_EVENT_NOT_FOUND", "El evento no existe.", 404);
    return apiSuccess({ id });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
