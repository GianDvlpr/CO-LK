import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { nextBusinessCode } from "@/lib/database/business-code";

const commonCode = z.string().trim().min(1).max(50);
const commonName = z.string().trim().min(1).max(150);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const taxpayerFields = {
  name: commonName,
  documentType: z.enum(["DNI", "RUC"]).default("RUC"),
  taxId: optionalText(30),
  email: optionalText(150),
  phone: optionalText(30),
  fiscalAddress: optionalText(300),
  ubigeo: optionalText(6),
  department: optionalText(100),
  province: optionalText(100),
  district: optionalText(100),
  rucStatus: optionalText(50),
  rucCondition: optionalText(50),
  sunatSource: z.literal("APIS.NET.PE").optional(),
  sunatCheckedAt: z.string().datetime().transform((value) => new Date(value)).optional(),
};
const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SUPPLIER"), ...taxpayerFields }),
  z.object({ type: z.literal("CUSTOMER"), ...taxpayerFields }),
  z.object({ type: z.literal("WAREHOUSE"), code: commonCode, name: commonName }),
  z.object({ type: z.literal("UNIT"), code: commonCode, name: commonName, symbol: z.string().trim().min(1).max(20), decimalPlaces: z.number().int().min(0).max(6) }),
  z.object({ type: z.literal("CURRENCY"), code: z.string().trim().length(3).transform((value) => value.toUpperCase()), name: commonName, symbol: z.string().trim().min(1).max(10), isBase: z.boolean().default(false) }),
]).superRefine((data, context) => {
  if ((data.type !== "SUPPLIER" && data.type !== "CUSTOMER") || !data.taxId) return;
  const pattern = data.documentType === "DNI" ? /^\d{8}$/ : /^\d{11}$/;
  if (!pattern.test(data.taxId)) context.addIssue({ code: "custom", path: ["taxId"], message: `El ${data.documentType} no tiene la cantidad de dígitos correcta.` });
});

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
      prisma.customer.findMany({ where: { companyId: user.companyId }, include: { brands: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
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
      let created: { id: string; code?: string };
      if (input.type === "SUPPLIER") created = await tx.supplier.create({ data: { companyId: user.companyId, code: await nextBusinessCode(tx, user.companyId, "SUPPLIER"), name: input.name, documentType: input.documentType, taxId: clean(input.taxId), email: clean(input.email), phone: clean(input.phone), fiscalAddress: clean(input.fiscalAddress), ubigeo: clean(input.ubigeo), department: clean(input.department), province: clean(input.province), district: clean(input.district), rucStatus: clean(input.rucStatus), rucCondition: clean(input.rucCondition), sunatSource: input.sunatSource, sunatCheckedAt: input.sunatCheckedAt } });
      else if (input.type === "CUSTOMER") created = await tx.customer.create({ data: { companyId: user.companyId, code: await nextBusinessCode(tx, user.companyId, "CUSTOMER"), name: input.name, documentType: input.documentType, taxId: clean(input.taxId), email: clean(input.email), phone: clean(input.phone), fiscalAddress: clean(input.fiscalAddress), ubigeo: clean(input.ubigeo), department: clean(input.department), province: clean(input.province), district: clean(input.district), rucStatus: clean(input.rucStatus), rucCondition: clean(input.rucCondition), sunatSource: input.sunatSource, sunatCheckedAt: input.sunatCheckedAt } });
      else if (input.type === "WAREHOUSE") created = await tx.warehouse.create({ data: { companyId: user.companyId, code: input.code, name: input.name } });
      else if (input.type === "UNIT") created = await tx.unitOfMeasure.create({ data: { companyId: user.companyId, code: input.code, name: input.name, symbol: input.symbol, decimalPlaces: input.decimalPlaces } });
      else {
        if (input.isBase) await tx.currency.updateMany({ where: { companyId: user.companyId }, data: { isBase: false } });
        created = await tx.currency.create({ data: { companyId: user.companyId, code: input.code, name: input.name, symbol: input.symbol, isBase: input.isBase } });
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: `Catalog:${input.type}`, entityId: created.id, action: "CREATE", afterData: { ...input, sunatCheckedAt: "sunatCheckedAt" in input ? input.sunatCheckedAt?.toISOString() : undefined, code: created.code ?? ("code" in input ? input.code : undefined) } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "catalog.created.v1", aggregateId: created.id, payload: { catalogType: input.type, id: created.id } } });
      return created;
    });
    return apiSuccess(result, 201);
  } catch (error) { const response = knownError(error); if (response) return response; throw error; }
}
