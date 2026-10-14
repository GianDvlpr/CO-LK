import Decimal from "decimal.js";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const decimal = z.union([z.string().min(1), z.number()]);
const schema = z.object({
  priority: z.enum(["NORMAL", "URGENT"]), carrier: z.string().trim().max(150).optional(), shippingDocument: z.string().trim().max(100).optional(), notes: z.string().trim().max(1000).optional(), nextStatus: z.enum(["PICKING", "PACKING", "READY"]).optional(),
  lines: z.array(z.object({ id: z.uuid(), warehouseLocation: z.string().trim().max(100).optional(), lotCode: z.string().trim().max(100).optional(), pickedQuantity: decimal, packedQuantity: decimal, incidentType: z.enum(["SHORTAGE", "DAMAGED", "SUBSTITUTION", "OTHER"]).optional().nullable(), incidentReason: z.string().trim().max(500).optional(), notes: z.string().trim().max(500).optional() })).min(1),
  packages: z.array(z.object({ packageType: z.string().trim().max(100).optional(), weight: decimal.optional(), length: decimal.optional(), width: decimal.optional(), height: decimal.optional(), notes: z.string().trim().max(500).optional() })).max(100).default([]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Datos inválidos.", 400);
  try {
    const user = await requirePermission("pick_pack.update");
    if (parsed.data.nextStatus === "READY" && !user.permissions.includes("pick_pack.ready")) return apiError("FORBIDDEN", "No tienes permiso para cerrar el Pick & Pack.", 403);
    const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pick_pack_orders WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.pickPackOrder.findFirst({ where: { id, companyId: user.companyId }, include: { lines: true } });
      if (!current) throw new Error("NOT_FOUND");
      if (["READY", "DISPATCHED", "CANCELLED"].includes(current.status)) throw new Error("LOCKED");
      const lineIds = current.lines.map((line) => line.id);
      if (parsed.data.lines.length !== lineIds.length || parsed.data.lines.some((line) => !lineIds.includes(line.id))) throw new Error("INVALID_LINES");
      for (const input of parsed.data.lines) {
        const source = current.lines.find((line) => line.id === input.id)!;
        const requested = new Decimal(source.requestedQuantity.toString()); const picked = new Decimal(input.pickedQuantity); const packed = new Decimal(input.packedQuantity);
        if (picked.isNegative() || packed.isNegative() || picked.greaterThan(requested) || packed.greaterThan(picked)) throw new Error("INVALID_QUANTITY");
        if (parsed.data.nextStatus === "PACKING" && picked.lessThan(requested) && (!input.incidentType || !input.incidentReason)) throw new Error("INCIDENT_REQUIRED");
        if (parsed.data.nextStatus === "READY" && (packed.lessThan(requested) || picked.lessThan(requested)) && (!input.incidentType || !input.incidentReason)) throw new Error("INCIDENT_REQUIRED");
      }
      const transitions: Record<string, string> = { PENDING: "PICKING", PICKING: "PACKING", PACKING: "READY" };
      if (parsed.data.nextStatus && transitions[current.status] !== parsed.data.nextStatus) throw new Error("INVALID_STATE");
      if (parsed.data.nextStatus === "READY" && !parsed.data.lines.some((line) => new Decimal(line.packedQuantity).greaterThan(0))) throw new Error("EMPTY_PACKING");
      await Promise.all(parsed.data.lines.map((line) => tx.pickPackLine.update({ where: { id: line.id }, data: { warehouseLocation: line.warehouseLocation || null, lotCode: line.lotCode || null, pickedQuantity: new Decimal(line.pickedQuantity), packedQuantity: new Decimal(line.packedQuantity), incidentType: line.incidentType ?? null, incidentReason: line.incidentReason || null, notes: line.notes || null } })));
      await tx.pickPackPackage.deleteMany({ where: { pickPackOrderId: current.id } });
      if (parsed.data.packages.length) await tx.pickPackPackage.createMany({ data: parsed.data.packages.map((item, index) => ({ pickPackOrderId: current.id, packageNumber: index + 1, packageType: item.packageType || null, weight: item.weight === undefined ? null : new Decimal(item.weight), length: item.length === undefined ? null : new Decimal(item.length), width: item.width === undefined ? null : new Decimal(item.width), height: item.height === undefined ? null : new Decimal(item.height), notes: item.notes || null })) });
      const now = new Date();
      const updated = await tx.pickPackOrder.update({ where: { id: current.id }, data: { priority: parsed.data.priority, carrier: parsed.data.carrier || null, shippingDocument: parsed.data.shippingDocument || null, notes: parsed.data.notes || null, ...(parsed.data.nextStatus ? { status: parsed.data.nextStatus, startedAt: parsed.data.nextStatus === "PICKING" ? now : undefined, packingStartedAt: parsed.data.nextStatus === "PACKING" ? now : undefined, readyAt: parsed.data.nextStatus === "READY" ? now : undefined } : {}) } });
      if (parsed.data.nextStatus === "READY") await tx.salesOrder.update({ where: { id: current.salesOrderId }, data: { status: "READY" } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "PickPackOrder", entityId: current.id, action: parsed.data.nextStatus ? `STATUS_${parsed.data.nextStatus}` : "UPDATE", afterData: { status: updated.status, lineCount: parsed.data.lines.length, packageCount: parsed.data.packages.length } } });
      if (parsed.data.nextStatus) await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: `pick_pack.${parsed.data.nextStatus.toLowerCase()}.v1`, aggregateId: current.id, payload: { pickPackOrderId: current.id, status: parsed.data.nextStatus } } });
      return updated;
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    const messages: Record<string, [string, string, number]> = { NOT_FOUND: ["PICK_PACK_NOT_FOUND", "La orden de preparación no existe.", 404], LOCKED: ["PICK_PACK_LOCKED", "La orden ya está cerrada y no puede editarse.", 422], INVALID_LINES: ["PICK_PACK_INVALID_LINES", "Las líneas no coinciden con el pedido.", 422], INVALID_QUANTITY: ["PICK_PACK_INVALID_QUANTITY", "Debe cumplirse: empacado ≤ recogido ≤ solicitado.", 422], INCIDENT_REQUIRED: ["PICK_PACK_INCIDENT_REQUIRED", "Registra tipo y motivo cuando exista una diferencia.", 422], INVALID_STATE: ["PICK_PACK_INVALID_STATE", "El cambio de estado no corresponde al flujo.", 422], EMPTY_PACKING: ["PICK_PACK_EMPTY", "No se puede cerrar sin cantidades empacadas.", 422] };
    if (error instanceof Error && messages[error.message]) { const [code, message, status] = messages[error.message]; return apiError(code, message, status); }
    throw error;
  }
}
