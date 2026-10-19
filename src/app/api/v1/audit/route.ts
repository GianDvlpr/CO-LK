import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { auditActionLabel, auditModuleLabel, redactAuditData } from "@/modules/audit/domain/audit-catalog";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { requirePermission } from "@/modules/auth/application/session-service";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  module: z.string().trim().max(50).optional(),
  action: z.string().trim().max(80).optional(),
  userId: z.string().uuid().optional(),
  search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  format: z.enum(["json", "xlsx"]).default("json"),
});

function dateAtStart(value: string) { return new Date(`${value}T00:00:00.000-05:00`); }
function dateAfterEnd(value: string) { const date = dateAtStart(value); date.setDate(date.getDate() + 1); return date; }

function auditWhere(companyId: string, input: z.infer<typeof querySchema>): Prisma.AuditLogWhereInput {
  return {
    companyId,
    ...(input.from || input.to ? { createdAt: { ...(input.from ? { gte: dateAtStart(input.from) } : {}), ...(input.to ? { lt: dateAfterEnd(input.to) } : {}) } } : {}),
    ...(input.module ? { module: input.module } : {}),
    ...(input.action ? { action: input.action } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.search ? { OR: [
      { entity: { contains: input.search, mode: "insensitive" } },
      { entityId: { contains: input.search, mode: "insensitive" } },
      { requestPath: { contains: input.search, mode: "insensitive" } },
      { ipAddress: { contains: input.search, mode: "insensitive" } },
      { user: { name: { contains: input.search, mode: "insensitive" } } },
      { user: { username: { contains: input.search, mode: "insensitive" } } },
    ] } : {}),
  };
}

const select = {
  id: true, module: true, entity: true, entityId: true, action: true, result: true,
  beforeData: true, afterData: true, ipAddress: true, userAgent: true, requestPath: true, createdAt: true,
  user: { select: { id: true, name: true, username: true } },
} satisfies Prisma.AuditLogSelect;

function publicItem<T extends { beforeData: unknown; afterData: unknown }>(item: T) {
  return { ...item, beforeData: redactAuditData(item.beforeData), afterData: redactAuditData(item.afterData) };
}

async function buildWorkbook(items: Prisma.AuditLogGetPayload<{ select: typeof select }>[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LK INNOVACION";
  const sheet = workbook.addWorksheet("Auditoría", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Fecha y hora", key: "date", width: 22 }, { header: "Usuario", key: "user", width: 24 },
    { header: "Módulo", key: "module", width: 20 }, { header: "Acción", key: "action", width: 28 },
    { header: "Entidad", key: "entity", width: 24 }, { header: "Identificador", key: "entityId", width: 38 },
    { header: "Resultado", key: "result", width: 14 }, { header: "IP", key: "ip", width: 18 },
    { header: "Ruta", key: "path", width: 35 }, { header: "Datos anteriores", key: "before", width: 45 },
    { header: "Datos posteriores", key: "after", width: 45 },
  ];
  for (const raw of items) {
    const item = publicItem(raw);
    sheet.addRow({ date: item.createdAt, user: item.user ? `${item.user.name} (@${item.user.username})` : "Sistema", module: auditModuleLabel(item.module), action: auditActionLabel(item.action), entity: item.entity, entityId: item.entityId, result: item.result, ip: item.ipAddress ?? "No disponible", path: item.requestPath ?? "", before: item.beforeData ? JSON.stringify(item.beforeData) : "", after: item.afterData ? JSON.stringify(item.afterData) : "" });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173C52" } };
  sheet.autoFilter = { from: "A1", to: "K1" };
  return workbook.xlsx.writeBuffer();
}

export async function GET(request: Request) {
  try {
    const actor = await requirePermission("audit.read");
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Los filtros de auditoría no son válidos.", 400);
    const where = auditWhere(actor.companyId, parsed.data);

    if (parsed.data.format === "xlsx") {
      const items = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 10_000, select });
      const bytes = await buildWorkbook(items);
      await prisma.auditLog.create({ data: { companyId: actor.companyId, userId: actor.id, module: "audit", entity: "AuditLog", entityId: "filtered-report", action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: "/api/v1/audit", afterData: { filters: { from: parsed.data.from, to: parsed.data.to, module: parsed.data.module, action: parsed.data.action, userId: parsed.data.userId, search: parsed.data.search }, rows: items.length } } });
      return new Response(new Uint8Array(bytes), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.xlsx"`, "cache-control": "no-store" } });
    }

    const limaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const today = dateAtStart(limaToday);
    const [items, total, todayCount, activeUsers, users, modules, actions] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (parsed.data.page - 1) * parsed.data.pageSize, take: parsed.data.pageSize, select }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { companyId: actor.companyId, createdAt: { gte: today } } }),
      prisma.auditLog.findMany({ where: { companyId: actor.companyId, createdAt: { gte: today }, userId: { not: null } }, distinct: ["userId"], select: { userId: true } }),
      prisma.user.findMany({ where: { companyId: actor.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true } }),
      prisma.auditLog.groupBy({ by: ["module"], where: { companyId: actor.companyId, module: { not: null } }, _count: true, orderBy: { module: "asc" } }),
      prisma.auditLog.groupBy({ by: ["action"], where: { companyId: actor.companyId }, _count: true, orderBy: { action: "asc" } }),
    ]);
    return apiSuccess({ items: items.map(publicItem), pagination: { page: parsed.data.page, pageSize: parsed.data.pageSize, total }, summary: { today: todayCount, activeUsers: activeUsers.length, filtered: total }, facets: { users, modules: modules.map((item) => ({ value: item.module, label: auditModuleLabel(item.module), count: item._count })), actions: actions.map((item) => ({ value: item.action, label: auditActionLabel(item.action), count: item._count })) } });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
