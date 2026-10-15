import { PickPackStatus, ProductionOrderStatus, SalesOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { calendarEventSchema, calendarReminderAt } from "@/modules/calendar/application/manual-event-schema";

function parseRange(request: Request) {
  const url = new URL(request.url);
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;
  if (to.getTime() - from.getTime() > 370 * 24 * 60 * 60 * 1_000) return null;
  return { from, to };
}

function between(date: Date | null | undefined, from: Date, to: Date) {
  return Boolean(date && date >= from && date <= to);
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("calendar.read");
    const range = parseRange(request);
    if (!range) return apiError("INVALID_PERIOD", "Selecciona un rango de calendario válido de hasta 370 días.", 400);
    const permissions = new Set(user.permissions);
    const { from, to } = range;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 8);

    const [manual, orders, production, pickPack, machines] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: { companyId: user.companyId, OR: [{ endAt: null, startAt: { gte: from, lte: to } }, { startAt: { lte: to }, endAt: { gte: from } }] },
        orderBy: { startAt: "asc" },
        include: { createdBy: { select: { name: true, username: true } } },
      }),
      permissions.has("orders.read") ? prisma.salesOrder.findMany({
        where: { companyId: user.companyId, OR: [{ requestedAt: { gte: from, lte: to } }, { promisedAt: { gte: from, lte: to } }] },
        select: { id: true, number: true, status: true, requestedAt: true, promisedAt: true, customer: { select: { name: true } } },
      }) : Promise.resolve([]),
      permissions.has("production.read") ? prisma.productionOrder.findMany({
        where: { companyId: user.companyId, plannedAt: { gte: from, lte: to } },
        select: { id: true, number: true, status: true, plannedAt: true, warehouseId: true, warehouse: { select: { name: true } }, productVariant: { select: { sku: true, product: { select: { name: true } } } } },
      }) : Promise.resolve([]),
      permissions.has("pick_pack.read") ? prisma.pickPackOrder.findMany({
        where: { companyId: user.companyId, OR: [{ salesOrder: { promisedAt: { gte: from, lte: to } } }, { salesOrder: { promisedAt: null }, createdAt: { gte: from, lte: to } }] },
        select: { id: true, number: true, status: true, priority: true, createdAt: true, warehouseId: true, warehouse: { select: { name: true } }, salesOrder: { select: { number: true, promisedAt: true, customer: { select: { name: true } } } } },
      }) : Promise.resolve([]),
      permissions.has("machinery.read") ? prisma.machine.findMany({
        where: { companyId: user.companyId },
        select: { id: true, code: true, name: true, status: true, maintenanceRecords: { where: { nextDueAt: { not: null } }, orderBy: { performedAt: "desc" }, take: 1, select: { id: true, type: true, nextDueAt: true, description: true } } },
      }) : Promise.resolve([]),
    ]);

    const items = [
      ...manual.map((event) => ({
        id: `manual:${event.id}`, manualId: event.id, source: "MANUAL", kind: event.type, title: event.title,
        subtitle: event.description || "Evento manual", startAt: event.startAt.toISOString(), endAt: event.endAt?.toISOString(), allDay: event.allDay,
        status: event.status, priority: event.priority, href: null, warehouseId: null, warehouse: null, machineId: null, machine: null,
        description: event.description, reminderMinutes: event.reminderMinutes, createdBy: event.createdBy,
      })),
      ...orders.flatMap((order) => {
        const events = [];
        if (between(order.requestedAt, from, to)) events.push({ id: `order-requested:${order.id}`, source: "ORDERS", kind: "REQUESTED", title: `Pedido ${order.number}`, subtitle: `${order.customer.name} · Fecha de pedido`, startAt: order.requestedAt.toISOString(), endAt: null, allDay: true, status: order.status, priority: "NORMAL", href: "/dashboard/orders", warehouseId: null, warehouse: null, machineId: null, machine: null });
        if (between(order.promisedAt, from, to)) events.push({ id: `order-due:${order.id}`, source: "ORDERS", kind: "DUE", title: `Entrega ${order.number}`, subtitle: order.customer.name, startAt: order.promisedAt!.toISOString(), endAt: null, allDay: true, status: order.status, priority: "HIGH", href: "/dashboard/orders", warehouseId: null, warehouse: null, machineId: null, machine: null });
        return events;
      }),
      ...production.map((order) => ({
        id: `production:${order.id}`, source: "PRODUCTION", kind: "PLANNED", title: `Producción ${order.number}`,
        subtitle: `${order.productVariant.sku} · ${order.productVariant.product.name}`, startAt: order.plannedAt!.toISOString(), endAt: null, allDay: false,
        status: order.status, priority: "NORMAL", href: "/dashboard/production", warehouseId: order.warehouseId, warehouse: order.warehouse.name, machineId: null, machine: null,
      })),
      ...pickPack.map((order) => ({
        id: `pick-pack:${order.id}`, source: "PICK_PACK", kind: "DISPATCH", title: `Preparar ${order.salesOrder.number}`,
        subtitle: `${order.number} · ${order.salesOrder.customer.name}`, startAt: (order.salesOrder.promisedAt ?? order.createdAt).toISOString(), endAt: null, allDay: true,
        status: order.status, priority: order.priority, href: "/dashboard/pick-pack", warehouseId: order.warehouseId, warehouse: order.warehouse.name, machineId: null, machine: null,
      })),
      ...machines.flatMap((machine) => machine.maintenanceRecords.filter((record) => between(record.nextDueAt, from, to)).map((record) => ({
        id: `maintenance:${record.id}`, source: "MAINTENANCE", kind: record.type, title: `Mantenimiento ${machine.code}`,
        subtitle: `${machine.name} · ${record.description}`, startAt: record.nextDueAt!.toISOString(), endAt: null, allDay: true,
        status: machine.status === "OUT_OF_SERVICE" ? "CANCELLED" : "PENDING", priority: "HIGH", href: "/dashboard/machinery", warehouseId: null, warehouse: null, machineId: machine.id, machine: `${machine.code} · ${machine.name}`,
      }))),
    ].sort((a, b) => a.startAt.localeCompare(b.startAt));

    const warehouses = [...new Map(items.filter((item) => item.warehouseId).map((item) => [item.warehouseId!, { id: item.warehouseId!, name: item.warehouse! }])).values()];
    const machineOptions = machines.map((machine) => ({ id: machine.id, name: `${machine.code} · ${machine.name}` }));
    const activeOrderStatuses = { notIn: [SalesOrderStatus.DISPATCHED, SalesOrderStatus.CANCELLED] };
    const activeProductionStatuses = { notIn: [ProductionOrderStatus.COMPLETED, ProductionOrderStatus.CANCELLED] };
    const activePickPackStatuses = { notIn: [PickPackStatus.DISPATCHED, PickPackStatus.CANCELLED] };
    const [manualOverdue, manualToday, manualNext, ordersOverdue, ordersToday, ordersNext, productionOverdue, productionToday, productionNext, pickPackOverdue, pickPackToday, pickPackNext] = await Promise.all([
      prisma.calendarEvent.count({ where: { companyId: user.companyId, status: "PENDING", startAt: { lt: today } } }),
      prisma.calendarEvent.count({ where: { companyId: user.companyId, status: "PENDING", startAt: { gte: today, lt: tomorrow } } }),
      prisma.calendarEvent.count({ where: { companyId: user.companyId, status: "PENDING", startAt: { gte: tomorrow, lt: nextWeek } } }),
      permissions.has("orders.read") ? prisma.salesOrder.count({ where: { companyId: user.companyId, status: activeOrderStatuses, promisedAt: { lt: today } } }) : 0,
      permissions.has("orders.read") ? prisma.salesOrder.count({ where: { companyId: user.companyId, status: activeOrderStatuses, promisedAt: { gte: today, lt: tomorrow } } }) : 0,
      permissions.has("orders.read") ? prisma.salesOrder.count({ where: { companyId: user.companyId, status: activeOrderStatuses, promisedAt: { gte: tomorrow, lt: nextWeek } } }) : 0,
      permissions.has("production.read") ? prisma.productionOrder.count({ where: { companyId: user.companyId, status: activeProductionStatuses, plannedAt: { lt: today } } }) : 0,
      permissions.has("production.read") ? prisma.productionOrder.count({ where: { companyId: user.companyId, status: activeProductionStatuses, plannedAt: { gte: today, lt: tomorrow } } }) : 0,
      permissions.has("production.read") ? prisma.productionOrder.count({ where: { companyId: user.companyId, status: activeProductionStatuses, plannedAt: { gte: tomorrow, lt: nextWeek } } }) : 0,
      permissions.has("pick_pack.read") ? prisma.pickPackOrder.count({ where: { companyId: user.companyId, status: activePickPackStatuses, salesOrder: { promisedAt: { lt: today } } } }) : 0,
      permissions.has("pick_pack.read") ? prisma.pickPackOrder.count({ where: { companyId: user.companyId, status: activePickPackStatuses, salesOrder: { promisedAt: { gte: today, lt: tomorrow } } } }) : 0,
      permissions.has("pick_pack.read") ? prisma.pickPackOrder.count({ where: { companyId: user.companyId, status: activePickPackStatuses, salesOrder: { promisedAt: { gte: tomorrow, lt: nextWeek } } } }) : 0,
    ]);
    const maintenanceDates = machines.flatMap((machine) => machine.status === "OUT_OF_SERVICE" ? [] : machine.maintenanceRecords.map((record) => record.nextDueAt).filter((date): date is Date => Boolean(date)));
    const summary = {
      overdue: manualOverdue + ordersOverdue + productionOverdue + pickPackOverdue + maintenanceDates.filter((date) => date < today).length,
      today: manualToday + ordersToday + productionToday + pickPackToday + maintenanceDates.filter((date) => date >= today && date < tomorrow).length,
      nextWeek: manualNext + ordersNext + productionNext + pickPackNext + maintenanceDates.filter((date) => date >= tomorrow && date < nextWeek).length,
      maintenance: maintenanceDates.filter((date) => date < nextWeek).length,
    };
    return apiSuccess({ items, summary, filters: { warehouses, machines: machineOptions } });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("calendar.create");
    const parsed = calendarEventSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "El evento contiene datos inválidos.", 400);
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.calendarEvent.create({ data: { companyId: user.companyId, createdById: user.id, ...parsed.data, endAt: parsed.data.endAt ?? null, description: parsed.data.description || null, reminderMinutes: parsed.data.reminderMinutes ?? null } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "CalendarEvent", entityId: created.id, action: "CREATE", afterData: { title: created.title, startAt: created.startAt.toISOString(), status: created.status } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "calendar.created.v1", aggregateId: created.id, payload: { calendarEventId: created.id, title: created.title } } });
      if (created.status === "PENDING" && created.reminderMinutes !== null && created.startAt > new Date()) await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "calendar.reminder.v1", aggregateId: created.id, availableAt: calendarReminderAt(created.startAt, created.reminderMinutes), payload: { calendarEventId: created.id, title: created.title, startAt: created.startAt.toISOString() } } });
      return created;
    });
    return apiSuccess(event, 201);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}

