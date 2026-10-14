import { Prisma, type PrismaClient } from "@prisma/client";
import { PurchaseApplicationError } from "./purchase-errors";

export type RejectPurchaseCommand = {
  companyId: string;
  purchaseId: string;
  rejectedById: string;
  comment?: string;
};

export async function rejectPurchase(database: PrismaClient, command: RejectPurchaseCommand) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${command.purchaseId}::uuid FOR UPDATE`;
    const purchase = await tx.purchase.findFirst({ where: { id: command.purchaseId, companyId: command.companyId } });
    if (!purchase) throw new PurchaseApplicationError("PURCHASE_NOT_FOUND", "La compra no existe.");
    if (purchase.status !== "PENDING") throw new PurchaseApplicationError("PURCHASE_INVALID_STATE", "Solo se puede rechazar una compra pendiente.");

    const rejected = await tx.purchase.update({ where: { id: purchase.id }, data: { status: "REJECTED" } });
    await tx.purchaseApproval.create({ data: { purchaseId: purchase.id, userId: command.rejectedById, status: "REJECTED", comment: command.comment } });
    await tx.auditLog.create({ data: { companyId: command.companyId, userId: command.rejectedById, entity: "Purchase", entityId: purchase.id, action: "REJECT", beforeData: { status: "PENDING" }, afterData: { status: "REJECTED", comment: command.comment ?? null } } });
    await tx.outboxEvent.create({ data: { companyId: command.companyId, topic: `private-company-${command.companyId}`, eventName: "purchase.rejected.v1", aggregateId: purchase.id, payload: { purchaseId: purchase.id, code: purchase.code } } });
    return rejected;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
