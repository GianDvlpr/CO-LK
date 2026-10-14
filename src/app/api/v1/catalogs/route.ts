import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const commonCode = z.string().trim().min(1).max(50);
const commonName = z.string().trim().min(1).max(150);
const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SUPPLIER"), code: commonCode, name: commonName, taxId: z.string().trim().max(30).optional(), email: z.string().trim().max(150).optional(), phone: z.string().trim().max(30).optional() }),
  z.object({ type: z.literal("CUSTOMER"), code: commonCode, name: commonName, taxId: z.string().trim().max(30).optional(), email: z.string().trim().max(150).optional(), phone: z.string().trim().max(30).optional() }),
  z.object({ type: z.literal("WAREHOUSE"), code: commonCode, name: commonName }),
  z.object({ type: z.literal("UNIT"), code: commonCode, name: commonName, symbol: z.string().trim().min(1).max(20), decimalPlaces: z.number().int().min(0).max(6) }),
  z.object({ type: z.literal("CURRENCY"), code: z.string().trim().length(3).transform((value) => value.toUpperCase()), name: commonName, symbol: z.string().trim().min(1).max(10), isBase: z.boolean().default(false) }),
]);

function clean(value?: string) { return value || undefined; }
function knownError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("CATALOG_DUPLICATE", "Ya existe un registro con ese código o identificador.", 409);
  return null;
}

export async function GET() {
  try {
    const user = await requirePermission("catalogs.read");
    const [suppliers, customers, warehouses, units, currencies] = await prisma.$transaction([
      prisma.supplier.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } }),
      prisma.customer.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } }),
      prisma.warehouse.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } }),
      prisma.unitOfMeasure.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } }),
      prisma.currency.findMany({ where: { companyId: user.companyId }, orderBy: [{ isBase: "desc" }, { code: "asc" }] }),
    ]);
    return apiSuccess({ suppliers, customers, warehouses, units, currencies });
  } catch (error) { const response = knownError(error); if (response) return response; throw error; }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "El registro contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("catalogs.manage");
    const result = await prisma.$transaction(async (tx) => {
      const input = parsed.data;
      let created: { id: string };
      if (input.type === "SUPPLIER") created = await tx.supplier.create({ data: { companyId: user.companyId, code: input.code, name: input.name, taxId: clean(input.taxId), email: clean(input.email), phone: clean(input.phone) } });
      else if (input.type === "CUSTOMER") created = await tx.customer.create({ data: { companyId: user.companyId, code: input.code, name: input.name, taxId: clean(input.taxId), email: clean(input.email), phone: clean(input.phone) } });
      else if (input.type === "WAREHOUSE") created = await tx.warehouse.create({ data: { companyId: user.companyId, code: input.code, name: input.name } });
      else if (input.type === "UNIT") created = await tx.unitOfMeasure.create({ data: { companyId: user.companyId, code: input.code, name: input.name, symbol: input.symbol, decimalPlaces: input.decimalPlaces } });
      else {
        if (input.isBase) await tx.currency.updateMany({ where: { companyId: user.companyId }, data: { isBase: false } });
        created = await tx.currency.create({ data: { companyId: user.companyId, code: input.code, name: input.name, symbol: input.symbol, isBase: input.isBase } });
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: `Catalog:${input.type}`, entityId: created.id, action: "CREATE", afterData: input } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "catalog.created.v1", aggregateId: created.id, payload: { catalogType: input.type, id: created.id } } });
      return created;
    });
    return apiSuccess(result, 201);
  } catch (error) { const response = knownError(error); if (response) return response; throw error; }
}
