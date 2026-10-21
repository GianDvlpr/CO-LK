import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const updateSchema = z.object({
  name: z.string().trim().min(1, "El nombre del logo/marca es obligatorio.").max(150).optional(),
  active: z.boolean().optional(),
}).refine((value) => value.name !== undefined || value.active !== undefined, "Indica el nombre o el estado a actualizar.");

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("CUSTOMER_BRAND_DUPLICATE", "El cliente ya tiene un logo/marca con ese nombre.", 409);
  return null;
}

async function findBrand(type: string, customerId: string, brandId: string, companyId: string) {
  if (type.toUpperCase() !== "CUSTOMER") return null;
  return prisma.customerBrand.findFirst({ where: { id: brandId, customerId, customer: { companyId } } });
}

export async function PATCH(request: Request, context: { params: Promise<{ type: string; id: string; brandId: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "El logo/marca contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("catalogs.manage");
    const { type, id, brandId } = await context.params;
    if (!(await findBrand(type, id, brandId, user.companyId))) return apiError("CUSTOMER_BRAND_NOT_FOUND", "El logo/marca no existe.", 404);
    const brand = await prisma.$transaction(async (tx) => {
      const updated = await tx.customerBrand.update({ where: { id: brandId }, data: { name: parsed.data.name, active: parsed.data.active } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "CustomerBrand", entityId: brandId, action: "UPDATE", afterData: { ...parsed.data } } });
      return updated;
    });
    return apiSuccess(brand);
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}

export async function DELETE(request: Request, context: { params: Promise<{ type: string; id: string; brandId: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  try {
    const user = await requirePermission("catalogs.manage");
    const { type, id, brandId } = await context.params;
    const brand = await findBrand(type, id, brandId, user.companyId);
    if (!brand) return apiError("CUSTOMER_BRAND_NOT_FOUND", "El logo/marca no existe.", 404);
    const used = await prisma.productionOrder.count({ where: { customerBrandId: brandId } });
    if (used > 0) return apiError("CUSTOMER_BRAND_IN_USE", "El logo/marca ya se usa en órdenes de producción; desactívalo en lugar de eliminarlo.", 409);
    await prisma.$transaction(async (tx) => {
      await tx.customerBrand.delete({ where: { id: brandId } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "CustomerBrand", entityId: brandId, action: "DELETE", beforeData: { customerId: id, name: brand.name } } });
    });
    return apiSuccess({ id: brandId });
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}
