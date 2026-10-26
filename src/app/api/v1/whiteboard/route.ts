import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import {
  createWhiteboardSchema,
  emptyWhiteboardContent,
  referencedAssetIds,
  updateWhiteboardSchema,
  whiteboardContentSchema,
  whiteboardIdSchema,
} from "@/modules/whiteboard/domain/whiteboard-schema";

class WhiteboardError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof WhiteboardError) return apiError(error.code, error.message, error.status);
  return null;
}

const boardInclude = {
  updatedBy: { select: { name: true, username: true } },
  assets: { orderBy: { createdAt: "asc" as const }, select: { id: true, secureUrl: true, fileName: true, mimeType: true, sizeBytes: true, width: true, height: true } },
};

function responseBoard<T extends { content: Prisma.JsonValue }>(board: T) {
  return { ...board, content: whiteboardContentSchema.parse(board.content) };
}

async function registerUpdate(tx: Prisma.TransactionClient, input: { companyId: string; userId: string; boardId: string; revision: number; elements: number; title: string; action: "CREATE" | "UPDATE" }) {
  await tx.auditLog.create({ data: {
    companyId: input.companyId,
    userId: input.userId,
    module: "whiteboard",
    entity: "Whiteboard",
    entityId: input.boardId,
    action: input.action,
    afterData: { revision: input.revision, elements: input.elements, title: input.title },
  } });
  await tx.outboxEvent.create({ data: {
    companyId: input.companyId,
    topic: `private-company-${input.companyId}`,
    eventName: "whiteboard.updated.v1",
    aggregateId: input.boardId,
    payload: { whiteboardId: input.boardId, revision: input.revision },
  } });
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("whiteboard.read");
    const requestedId = new URL(request.url).searchParams.get("id");
    if (requestedId && !whiteboardIdSchema.safeParse(requestedId).success) return apiError("VALIDATION_ERROR", "La pizarra seleccionada no es válida.", 400);
    const board = await prisma.whiteboard.findFirst({
      where: { companyId: user.companyId, ...(requestedId ? { id: requestedId } : {}) },
      include: boardInclude,
      orderBy: { updatedAt: "desc" },
    });
    if (!board) {
      if (requestedId) return apiError("WHITEBOARD_NOT_FOUND", "La pizarra ya no existe.", 404);
      return apiSuccess({ id: null, title: "Pizarra sin título", revision: 0, content: emptyWhiteboardContent(), assets: [], updatedAt: null, updatedBy: null });
    }
    return apiSuccess(responseBoard(board));
  } catch (error) {
    const response = known(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = known(error); if (response) return response; throw error; }
  const parsed = createWhiteboardSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Los datos de la pizarra no son válidos.", 400);
  try {
    const user = await requirePermission("whiteboard.manage");
    const content = parsed.data.content ?? emptyWhiteboardContent();
    if (referencedAssetIds(content).length) return apiError("WHITEBOARD_INVALID_ASSET", "Una pizarra nueva no puede usar imágenes de otra pizarra.", 422);
    const board = await prisma.$transaction(async (tx) => {
      const created = await tx.whiteboard.create({ data: {
        companyId: user.companyId,
        updatedById: user.id,
        title: parsed.data.title,
        content: content as Prisma.InputJsonValue,
      } });
      await registerUpdate(tx, { companyId: user.companyId, userId: user.id, boardId: created.id, revision: created.revision, elements: content.elements.length, title: created.title, action: "CREATE" });
      return tx.whiteboard.findUniqueOrThrow({ where: { id: created.id }, include: boardInclude });
    });
    return apiSuccess(responseBoard(board), 201);
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
      const current = parsed.data.id
        ? await tx.whiteboard.findFirst({ where: { id: parsed.data.id, companyId: user.companyId } })
        : await tx.whiteboard.findFirst({ where: { companyId: user.companyId }, orderBy: { updatedAt: "desc" } });
      if (!current) {
        if (parsed.data.id || parsed.data.revision !== 0) throw new WhiteboardError("WHITEBOARD_CONFLICT", "La pizarra cambió. Recarga antes de guardar nuevamente.", 409);
        if (referencedAssetIds(parsed.data.content).length) throw new WhiteboardError("WHITEBOARD_INVALID_ASSET", "Una imagen ya no pertenece a esta pizarra.", 422);
        const created = await tx.whiteboard.create({ data: {
          companyId: user.companyId,
          updatedById: user.id,
          title: parsed.data.title ?? "Pizarra sin título",
          content: parsed.data.content as Prisma.InputJsonValue,
        } });
        await registerUpdate(tx, { companyId: user.companyId, userId: user.id, boardId: created.id, revision: created.revision, elements: parsed.data.content.elements.length, title: created.title, action: "CREATE" });
        return created.id;
      }
      if (current.revision !== parsed.data.revision) throw new WhiteboardError("WHITEBOARD_CONFLICT", "Otra persona actualizó la pizarra. Recarga para conservar sus cambios.", 409);
      const assetIds = referencedAssetIds(parsed.data.content);
      if (assetIds.length) {
        const ownedAssets = await tx.whiteboardAsset.count({ where: { whiteboardId: current.id, id: { in: assetIds } } });
        if (ownedAssets !== assetIds.length) throw new WhiteboardError("WHITEBOARD_INVALID_ASSET", "Una imagen ya no pertenece a esta pizarra.", 422);
      }
      const title = parsed.data.title ?? current.title;
      const updated = await tx.whiteboard.updateMany({
        where: { id: current.id, companyId: user.companyId, revision: current.revision },
        data: { updatedById: user.id, title, content: parsed.data.content as Prisma.InputJsonValue, revision: { increment: 1 } },
      });
      if (!updated.count) throw new WhiteboardError("WHITEBOARD_CONFLICT", "Otra persona actualizó la pizarra. Recarga para conservar sus cambios.", 409);
      await registerUpdate(tx, { companyId: user.companyId, userId: user.id, boardId: current.id, revision: current.revision + 1, elements: parsed.data.content.elements.length, title, action: "UPDATE" });
      return current.id;
    });
    const board = await prisma.whiteboard.findFirstOrThrow({ where: { id: boardId, companyId: user.companyId }, include: boardInclude });
    return apiSuccess(responseBoard(board));
  } catch (error) {
    const response = known(error);
    if (response) return response;
    throw error;
  }
}
