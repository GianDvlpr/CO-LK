import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { catalogUpdateSchema } from "@/modules/catalogs/domain/catalog-update-schema";

const supported = ["SUPPLIER", "CUSTOMER", "WAREHOUSE", "UNIT", "CURRENCY"] as const;

export async function PATCH(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("catalogs.manage");
    const parsed = catalogUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("VALIDATION_ERROR", "Los datos del catálogo no son válidos.", 400);
    const params = await context.params;
    const type = params.type.toUpperCase() as typeof supported[number];
    if (!supported.includes(type)) return apiError("CATALOG_TYPE_INVALID", "El tipo de catálogo no es válido.", 400);
    const result = await prisma.$transaction(async (tx) => {
      const data = parsed.data;
      let count = 0;
      const taxpayerData = { name: data.name, taxId: data.taxId || null, email: data.email || null, phone: data.phone || null, fiscalAddress: data.fiscalAddress || null, ubigeo: data.ubigeo || null, department: data.department || null, province: data.province || null, district: data.district || null, rucStatus: data.rucStatus || null, rucCondition: data.rucCondition || null, sunatSource: data.sunatSource || null, sunatCheckedAt: data.sunatCheckedAt || null };
      if (type === "SUPPLIER") count = (await tx.supplier.updateMany({ where: { id: params.id, companyId: user.companyId }, data: taxpayerData })).count;
      else if (type === "CUSTOMER") count = (await tx.customer.updateMany({ where: { id: params.id, companyId: user.companyId }, data: taxpayerData })).count;
      else if (type === "WAREHOUSE") count = (await tx.warehouse.updateMany({ where: { id: params.id, companyId: user.companyId }, data: { name: data.name } })).count;
      else if (type === "UNIT") count = (await tx.unitOfMeasure.updateMany({ where: { id: params.id, companyId: user.companyId }, data: { name: data.name, symbol: data.symbol, decimalPlaces: data.decimalPlaces } })).count;
      else { if (data.isBase) await tx.currency.updateMany({ where: { companyId: user.companyId }, data: { isBase: false } }); count = (await tx.currency.updateMany({ where: { id: params.id, companyId: user.companyId }, data: { name: data.name, symbol: data.symbol, isBase: data.isBase } })).count; }
      if (!count) return null;
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: `Catalog:${type}`, entityId: params.id, action: "UPDATE", afterData: { ...data, sunatCheckedAt: data.sunatCheckedAt?.toISOString() } } });
      return { id: params.id };
    });
    if (!result) return apiError("CATALOG_NOT_FOUND", "El registro no existe.", 404);
    return apiSuccess(result);
  } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
}
