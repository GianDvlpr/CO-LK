import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { createPurchase } from "@/modules/purchases/application/create-purchase";
import { PurchaseApplicationError } from "@/modules/purchases/application/purchase-errors";

const decimal = z.union([z.string().min(1), z.number()]);
const createSchema = z.object({
  supplierId: z.uuid(), warehouseId: z.uuid(), currencyId: z.uuid(),
  receptionDate: z.coerce.date(), documentNumber: z.string().trim().min(1).max(100),
  sourceOrderReference: z.string().trim().max(100).optional(), receiptSequence: z.number().int().positive().default(1),
  exchangeRate: decimal,
  lines: z.array(z.object({
    lineNumber: z.number().int().positive(), itemId: z.uuid(), presentationType: z.string().trim().min(1).max(50), presentationQuantity: decimal,
    contentPerUnit: decimal, pricePerBaseUnit: decimal, taxRate: decimal.optional(),
    lots: z.array(z.object({
      lineNumber: z.number().int().positive(), lotCode: z.string().trim().min(1).max(100),
      supplierLot: z.string().trim().max(100).optional(), expiresAt: z.coerce.date().optional(), quantity: decimal,
    })).optional(),
  })).min(1),
});

function knownError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof PurchaseApplicationError) {
    const status = error.code === "PURCHASE_NOT_FOUND" ? 404 : error.code === "PURCHASE_DUPLICATE_DOCUMENT" ? 409 : 422;
    return apiError(error.code, error.message, status);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return apiError("CONFLICT", "Ya existe un registro con esos datos únicos.", 409);
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("purchases.read");
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
    const search = (url.searchParams.get("search") ?? "").trim();
    const where = {
      companyId: user.companyId,
      ...(search ? { OR: [
        { code: { contains: search, mode: "insensitive" as const } },
        { documentNumber: { contains: search, mode: "insensitive" as const } },
        { supplier: { name: { contains: search, mode: "insensitive" as const } } },
        { supplier: { code: { contains: search, mode: "insensitive" as const } } },
      ] } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.purchase.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: "desc" },
        include: { supplier: { select: { code: true, name: true, phone: true } }, currency: { select: { code: true } }, lines: { orderBy: { lineNumber: "asc" }, include: { item: { select: { code: true, name: true, supplierProductCode: true, unit: { select: { symbol: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { secureUrl: true } } } }, lots: { include: { lot: { select: { supplierLot: true } } } } } }, _count: { select: { lines: true } } },
      }),
      prisma.purchase.count({ where }),
    ]);
    return apiSuccess({ items, page, pageSize, total });
  } catch (error) {
    const response = knownError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "La compra contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("purchases.create");
    const purchase = await createPurchase(prisma, { ...parsed.data, companyId: user.companyId, createdById: user.id });
    return apiSuccess(purchase, 201);
  } catch (error) {
    const response = knownError(error);
    if (response) return response;
    throw error;
  }
}
