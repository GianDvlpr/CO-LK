import { z } from "zod";

export const calendarEventSchema = z.object({
  title: z.string().trim().min(1, "Ingresa el título.").max(180),
  type: z.enum(["INVENTORY", "MEETING", "TASK", "OTHER"]).default("TASK"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]).default("PENDING"),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional().nullable(),
  allDay: z.boolean().default(false),
  description: z.string().trim().max(1_000).optional(),
  reminderMinutes: z.number().int().min(0).max(10_080).optional().nullable(),
}).refine((value) => !value.endAt || value.endAt >= value.startAt, { message: "La fecha final no puede ser anterior al inicio.", path: ["endAt"] });

export function calendarReminderAt(startAt: Date, minutes: number) {
  return new Date(startAt.getTime() - minutes * 60_000);
}
