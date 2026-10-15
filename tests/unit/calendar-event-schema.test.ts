import { describe, expect, it } from "vitest";
import { calendarEventSchema, calendarReminderAt } from "@/modules/calendar/application/manual-event-schema";

describe("eventos manuales del calendario", () => {
  it("acepta un evento válido y calcula su recordatorio", () => {
    const startAt = new Date("2026-10-20T15:00:00.000Z");
    const result = calendarEventSchema.safeParse({ title: "Inventario físico", type: "INVENTORY", priority: "HIGH", status: "PENDING", startAt, allDay: false, reminderMinutes: 1_440 });
    expect(result.success).toBe(true);
    expect(calendarReminderAt(startAt, 1_440).toISOString()).toBe("2026-10-19T15:00:00.000Z");
  });

  it("rechaza una fecha final anterior al inicio", () => {
    const result = calendarEventSchema.safeParse({ title: "Reunión", startAt: "2026-10-20T15:00:00.000Z", endAt: "2026-10-20T14:00:00.000Z", allDay: false });
    expect(result.success).toBe(false);
  });

  it("rechaza recordatorios mayores a siete días", () => {
    const result = calendarEventSchema.safeParse({ title: "Tarea", startAt: "2026-10-20T15:00:00.000Z", allDay: false, reminderMinutes: 10_081 });
    expect(result.success).toBe(false);
  });
});
