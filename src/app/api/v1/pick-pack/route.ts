import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const createSchema = z.object({ salesOrderId: z.uuid(), priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"), pickerId: z.uuid().optional(), packerId: z.uuid().optional(), notes: z.string().trim().max(1000).optional() });
const include = {
  warehouse: { select: { code: true, name: true } },
  picker: { select: { id: true, name: true, username: true } },
  packer: { select: { id: true, name: true, username: true } },
  salesOrder: { include: { customer: { select: { code: true, name: true } } } },
  lines: {
    orderBy: { salesOrderLine: { productVariant: { sku: "asc" as const } } },
    include: {
      salesOrderLine: {
        include: {
          productVariant: {
            include: {
              product: { select: { code: true, name: true } },
              size: { select: { name: true } },
              color: { select: { name: true } },
              inventoryItem: { include: { unit: { select: { symbol: true } } } },
            },
          },
        },
      },
    },
  },
  packages: { orderBy: { packageNumber: "asc" as const } },
} satisfies Prisma.PickPackOrderInclude;

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("PICK_PACK_DUPLICATE", "El pedido ya tiene una orden de Pick & Pack.", 409);
  return null;
}

export async function GET() {
  try {
    const user = await requirePermission("pick_pack.read");
    const items = await prisma.pickPackOrder.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "desc" }, include });
    return apiSuccess({ items });
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Los datos de la orden de preparación son inválidos.", 400);
  try {
    const user = await requirePermission("pick_pack.create");
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({ where: { id: parsed.data.salesOrderId, companyId: user.companyId }, include: { lines: true, pickPackOrder: { select: { id: true } } } });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (order.status !== "CONFIRMED") throw new Error("ORDER_NOT_CONFIRMED");
      if (order.pickPackOrder) throw new Error("PICK_PACK_EXISTS");
      const reservation = await tx.stockReservation.findFirst({ where: { referenceType: "SALES_ORDER", referenceId: order.id, active: true }, select: { warehouseId: true } });
      if (!reservation) throw new Error("RESERVATION_NOT_FOUND");
      const people = [parsed.data.pickerId, parsed.data.packerId].filter((id): id is string => Boolean(id));
      if (people.length && await tx.user.count({ where: { id: { in: people }, companyId: user.companyId, status: "ACTIVE" } }) !== new Set(people).size) throw new Error("INVALID_USER");
      const year = new Date().getFullYear();
      const counter = await tx.correlativeCounter.upsert({ where: { companyId_scope_year: { companyId: user.companyId, scope: "PICK_PACK", year } }, update: { value: { increment: 1 } }, create: { companyId: user.companyId, scope: "PICK_PACK", year, value: 1 }, select: { value: true } });
      const number = `PP-${year}-${String(counter.value).padStart(6, "0")}`;
      const created = await tx.pickPackOrder.create({ data: { companyId: user.companyId, salesOrderId: order.id, warehouseId: reservation.warehouseId, number, priority: parsed.data.priority, pickerId: parsed.data.pickerId, packerId: parsed.data.packerId, notes: parsed.data.notes, lines: { create: order.lines.map((line) => ({ salesOrderLineId: line.id, requestedQuantity: line.quantity })) } }, include });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "PickPackOrder", entityId: created.id, action: "CREATE", afterData: { number, salesOrderId: order.id } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "pick_pack.created.v1", aggregateId: created.id, payload: { pickPackOrderId: created.id, number } } });
      return created;
    });
    return apiSuccess(result, 201);
  } catch (error) {
    const messages: Record<string, [string, string, number]> = { ORDER_NOT_FOUND: ["ORDER_NOT_FOUND", "El pedido no existe.", 404], ORDER_NOT_CONFIRMED: ["ORDER_NOT_CONFIRMED", "Solo se puede preparar un pedido confirmado.", 422], PICK_PACK_EXISTS: ["PICK_PACK_EXISTS", "El pedido ya tiene una orden de Pick & Pack.", 409], RESERVATION_NOT_FOUND: ["RESERVATION_NOT_FOUND", "El pedido no tiene stock reservado.", 422], INVALID_USER: ["INVALID_USER", "El responsable seleccionado no es válido.", 422] };
    if (error instanceof Error && messages[error.message]) { const [code, message, status] = messages[error.message]; return apiError(code, message, status); }
    const response = known(error); if (response) return response; throw error;
  }
}
