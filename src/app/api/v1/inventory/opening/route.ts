import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { createOpeningStock } from "@/modules/inventory/application/create-opening-stock";
import { InventoryApplicationError } from "@/modules/inventory/application/inventory-errors";

const decimal = z.union([z.string().min(1), z.number()]);
const schema = z.object({ referenceNumber: z.string().trim().max(50).optional().or(z.literal("")), itemId: z.uuid(), warehouseId: z.uuid(), quantity: decimal, unitCost: decimal, lotCode: z.string().trim().max(100).optional(), occurredAt: z.coerce.date() });

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "El stock inicial contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("inventory.opening_import");
    const movement = await createOpeningStock(prisma, { ...parsed.data, companyId: user.companyId, createdById: user.id });
    return apiSuccess({ id: movement.id, itemId: movement.itemId, warehouseId: movement.warehouseId, quantity: movement.quantity.toString(), postingSequence: movement.postingSequence.toString() }, 201);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof InventoryApplicationError) return apiError(error.code, error.message, 422);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("INVENTORY_DUPLICATE_OPENING", "Ese número de apertura ya fue registrado.", 409);
    throw error;
  }
}
