import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { emptyWhiteboardContent, referencedAssetIds, updateWhiteboardSchema, whiteboardContentSchema } from "@/modules/whiteboard/domain/whiteboard-schema";

class WhiteboardError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof WhiteboardError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return apiError("WHITEBOARD_CONFLICT", "La pizarra fue actualizada por otra persona. Recarga para ver los últimos cambios.", 409);
  }
  return null;
}

const boardInclude = {
  updatedBy: { select: { name: true, username: true } },
  assets: { orderBy: { createdAt: "asc" as const }, select: { id: true, secureUrl: true, fileName: true, mimeType: true, sizeBytes: true, width: true, height: true } },
};

export async function GET() {
  try {
    const user = await requirePermission("whiteboard.read");
    const board = await prisma.whiteboard.findUnique({ where: { companyId: user.companyId }, include: boardInclude });
    if (!board) return apiSuccess({ id: null, revision: 0, content: emptyWhiteboardContent(), assets: [], updatedAt: null, updatedBy: null });
    const content = whiteboardContentSchema.parse(board.content);
    return apiSuccess({ ...board, content });
  } catch (error) {
    const response = known(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = known(error); if (response) return response; throw error; }
  const parsed = updateWhiteboardSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "La pizarra contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("whiteboard.manage");
    const boardId = await prisma.$transaction(async (tx) => {
      const current = await tx.whiteboard.findUnique({ where: { companyId: user.companyId } });
      if (!current) {
        if (parsed.data.revision !== 0) throw new WhiteboardError("WHITEBOARD_CONFLICT", "La pizarra cambió. Recarga antes de guardar nuevamente.", 409);
        if (referencedAssetIds(parsed.data.content).length) throw new WhiteboardError("WHITEBOARD_INVALID_ASSET", "Una imagen ya no pertenece a esta pizarra.", 422);
        const created = await tx.whiteboard.create({ data: { companyId: user.companyId, updatedById: user.id, content: parsed.data.content as Prisma.InputJsonValue } });
        await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "whiteboard", entity: "Whiteboard", entityId: created.id, action: "CREATE", afterData: { revision: created.revision, elements: parsed.data.content.elements.length } } });
        await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "whiteboard.updated.v1", aggregateId: created.id, payload: { whiteboardId: created.id, revision: created.revision } } });
        return created.id;
      }
      if (current.revision !== parsed.data.revision) throw new WhiteboardError("WHITEBOARD_CONFLICT", "Otra persona actualizó la pizarra. Recarga para conservar sus cambios.", 409);
      const assetIds = referencedAssetIds(parsed.data.content);
      if (assetIds.length) {
        const ownedAssets = await tx.whiteboardAsset.count({ where: { whiteboardId: current.id, id: { in: assetIds } } });
        if (ownedAssets !== assetIds.length) throw new WhiteboardError("WHITEBOARD_INVALID_ASSET", "Una imagen ya no pertenece a esta pizarra.", 422);
      }
      const updated = await tx.whiteboard.updateMany({ where: { id: current.id, revision: current.revision }, data: { updatedById: user.id, content: parsed.data.content as Prisma.InputJsonValue, revision: { increment: 1 } } });
      if (!updated.count) throw new WhiteboardError("WHITEBOARD_CONFLICT", "Otra persona actualizó la pizarra. Recarga para conservar sus cambios.", 409);
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "whiteboard", entity: "Whiteboard", entityId: current.id, action: "UPDATE", afterData: { revision: current.revision + 1, elements: parsed.data.content.elements.length } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "whiteboard.updated.v1", aggregateId: current.id, payload: { whiteboardId: current.id, revision: current.revision + 1 } } });
      return current.id;
    });
    const board = await prisma.whiteboard.findUniqueOrThrow({ where: { id: boardId }, include: boardInclude });
    return apiSuccess({ ...board, content: whiteboardContentSchema.parse(board.content) });
  } catch (error) {
    const response = known(error);
    if (response) return response;
    throw error;
  }
}
