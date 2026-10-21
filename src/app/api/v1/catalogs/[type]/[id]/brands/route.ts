import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";

const createSchema = z.object({ name: z.string().trim().min(1, "El nombre del logo/marca es obligatorio.").max(150) });

async function findCustomer(type: string, id: string, companyId: string) {
  if (type.toUpperCase() !== "CUSTOMER") return null;
  return prisma.customer.findFirst({ where: { id, companyId }, select: { id: true } });
}

function known(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("CUSTOMER_BRAND_DUPLICATE", "El cliente ya tiene un logo/marca con ese nombre.", 409);
  return null;
}

export async function GET(_request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  try {
    const user = await requirePermission("catalogs.read");
    const { type, id } = await context.params;
    if (!(await findCustomer(type, id, user.companyId))) return apiError("CATALOG_NOT_FOUND", "El cliente no existe.", 404);
    const brands = await prisma.customerBrand.findMany({ where: { customerId: id }, orderBy: { name: "asc" } });
    return apiSuccess({ brands });
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}

export async function POST(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "El logo/marca contiene datos inválidos.", 400);
  try {
    const user = await requirePermission("catalogs.manage");
    const { type, id } = await context.params;
    if (!(await findCustomer(type, id, user.companyId))) return apiError("CATALOG_NOT_FOUND", "El cliente no existe.", 404);
    const brand = await prisma.$transaction(async (tx) => {
      const created = await tx.customerBrand.create({ data: { customerId: id, name: parsed.data.name } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "CustomerBrand", entityId: created.id, action: "CREATE", afterData: { customerId: id, name: created.name } } });
      return created;
    });
    return apiSuccess(brand, 201);
  } catch (error) { const response = known(error); if (response) return response; throw error; }
}
